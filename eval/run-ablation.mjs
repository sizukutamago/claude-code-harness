#!/usr/bin/env node

/**
 * run-ablation.mjs — スキル/ルールの ON/OFF でハーネスの効果を比較する
 *
 * 使い方:
 *   node eval/run-ablation.mjs tdd-behavior.yaml
 *
 * 動作:
 * 1. ルールあり（base fixture 使用）で eval 実行 → 結果 A
 * 2. ルールなし（base fixture からルールを除外）で eval 実行 → 結果 B
 * 3. A と B を比較して case flips（PASS→FAIL, FAIL→PASS）を検出
 * 4. レポートを eval/results/ablation/ に保存
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, mkdtempSync, readdirSync, unlinkSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve, basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseStreamJson, buildTrace } from "./lib/trace.mjs";
import { runAssertions as runDeterministicAssertions } from "./lib/assertions.mjs";

const execFileAsync = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "..");
const EVAL_DIR = resolve(import.meta.dirname);
const FIXTURES_DIR = resolve(EVAL_DIR, "fixtures");

// --- Claude Code CLI (run-eval.mjs と同じ) ---

function claudeRun(prompt, { maxTurns = 4, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--max-turns", String(maxTurns),
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];

    const child = spawn("claude", args, { cwd, timeout: 180000 });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("close", (code) => {
      if (!stdout.trim()) {
        reject(new Error(`claude exited ${code} with no output. stderr: ${(stderr).slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });

    child.on("error", reject);

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function claudeJudge(prompt) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--max-turns", "1", "--output-format", "json"];
    const child = spawn("claude", args, { cwd: "/tmp", timeout: 120000 });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", () => {});
    child.on("close", () => {
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`judge parse failed: ${stdout.slice(0, 300)}`)); }
    });
    child.on("error", reject);
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function checkLlmRubricTrace(trace, rubric) {
  const eventsSummary = trace.events
    .filter((e) => e.event_type === "tool_call")
    .map((e) => {
      let detail = `${e.tool_name}`;
      if (e.path) detail += ` -> ${e.path} (${e.path_class})`;
      if (e.command) detail += ` -> ${e.command_class}: ${e.command.slice(0, 80)}`;
      if (e.denied) detail += " [DENIED]";
      return `  [${e.index}] ${detail}`;
    })
    .join("\n");

  const prompt = `以下の Claude Code の行動 trace を評価してください。

## 評価基準
${rubric}

## 行動 trace
${eventsSummary || "(ツール呼び出しなし)"}

## テキスト応答
${trace.final.result_text || "(なし)"}

## 統計
- ツール呼び出し数: ${trace.derived.tool_calls_total}
- 最初の Write 対象: ${trace.derived.first_write_path_class || "なし"}
- テスト先行: ${trace.derived.test_before_prod_write}
- 読んでから書いた: ${trace.derived.read_before_write}
- 権限拒否数: ${trace.derived.permission_denials_total}

## 指示
評価基準を満たしているか判定してください。
回答は以下の JSON のみで返してください:
{"pass": true, "reason": "判定理由"}
または
{"pass": false, "reason": "判定理由"}`;

  try {
    const result = await claudeJudge(prompt);
    const text = result.result || "";
    const jsonMatch = text.match(/\{[\s\S]*?"pass"\s*:[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { type: "llm-rubric-trace", pass: parsed.pass, reason: parsed.reason, grader_cost_usd: result.total_cost_usd || 0 };
    }
    return { type: "llm-rubric-trace", pass: false, reason: `judge parse failed: ${text.slice(0, 200)}` };
  } catch (err) {
    return { type: "llm-rubric-trace", pass: false, reason: `judge error: ${err.message}` };
  }
}

// --- Fixture ---

function prepareWorkdir(fixtureName, { withRules = true } = {}) {
  const workdirsRoot = resolve(EVAL_DIR, "workdirs");
  mkdirSync(workdirsRoot, { recursive: true });
  const workdir = mkdtempSync(join(workdirsRoot, "abl-"));

  // base fixture
  const baseDir = resolve(FIXTURES_DIR, "base");
  try { cpSync(baseDir, workdir, { recursive: true }); } catch {}

  // ハーネスなしモード: CLAUDE.md を空にし、.claude/rules/ を削除
  if (!withRules) {
    const rulesDir = join(workdir, ".claude", "rules");
    try { rmSync(rulesDir, { recursive: true, force: true }); } catch {}
    const claudeMd = join(workdir, "CLAUDE.md");
    try { writeFileSync(claudeMd, "# Project\n"); } catch {}
  }

  // ケース固有 fixture
  if (fixtureName) {
    const fixtureDir = resolve(FIXTURES_DIR, fixtureName);
    try { cpSync(fixtureDir, workdir, { recursive: true }); } catch {}
  }

  return workdir;
}

function cleanupWorkdir(workdir) {
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
}

// --- 1回分の eval 実行 ---

async function runSingleEval(caseFile, { withRules }) {
  const filePath = resolve(EVAL_DIR, "cases", caseFile);
  const config = parseYaml(readFileSync(filePath, "utf-8"));
  const caseFixture = config.fixture || null;
  const label = withRules ? "WITH_RULES" : "NO_RULES";
  const results = [];

  for (const test of config.tests) {
    const caseId = `${basename(caseFile, ".yaml")}/${test.description}`;
    const maxTurns = test.run?.max_turns || config.run?.max_turns || 4;
    const fixture = test.fixture || caseFixture;
    process.stdout.write(`  [${label}] ${test.description} ... `);

    const workdir = prepareWorkdir(fixture, { withRules });

    let ndjson;
    try {
      ndjson = await claudeRun(test.vars.task, { maxTurns, cwd: workdir });
    } catch (err) {
      cleanupWorkdir(workdir);
      console.log("INFRA_ERROR");
      results.push({ case_id: caseId, description: test.description, pass: null, infra_error: err.message });
      continue;
    }

    const rawMessages = parseStreamJson(ndjson);
    const trace = buildTrace({ rawMessages, caseId, caseFile, testDescription: test.description, task: test.vars.task });

    const assertions = test.assert || [];
    const deterministicAssertions = assertions.filter((a) => a.type !== "llm-rubric-trace");
    const llmAssertions = assertions.filter((a) => a.type === "llm-rubric-trace");

    const assertionResults = runDeterministicAssertions(trace, deterministicAssertions);
    for (const a of llmAssertions) {
      assertionResults.push(await checkLlmRubricTrace(trace, a.value));
    }

    const allPass = assertionResults.every((r) => r.pass === true);
    console.log(allPass ? "PASS" : "FAIL");

    results.push({
      case_id: caseId,
      description: test.description,
      pass: allPass,
      assertions: assertionResults,
      cost_usd: trace.usage.total_cost_usd,
    });

    cleanupWorkdir(workdir);
  }

  return results;
}

// --- 比較 ---

function compareResults(withRulesResults, noRulesResults) {
  const flips = [];

  for (let i = 0; i < withRulesResults.length; i++) {
    const wr = withRulesResults[i];
    const nr = noRulesResults[i];
    if (!wr || !nr) continue;

    if (wr.pass !== nr.pass) {
      flips.push({
        case_id: wr.case_id,
        description: wr.description,
        with_rules: wr.pass,
        no_rules: nr.pass,
        flip: wr.pass === true && nr.pass === false ? "RULE_HELPS" : "RULE_HURTS",
      });
    }
  }

  return flips;
}

// --- メイン ---

async function runAblation(caseFiles) {
  const runId = `ablation-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`\n=== Ablation: ${runId} ===`);
  console.log(`Cases: ${caseFiles.join(", ")}\n`);

  const allFlips = [];
  let totalCost = 0;

  for (const caseFile of caseFiles) {
    console.log(`--- ${caseFile} ---`);

    console.log("\n  Phase 1: WITH RULES");
    const withRulesResults = await runSingleEval(caseFile, { withRules: true });

    console.log("\n  Phase 2: NO RULES");
    const noRulesResults = await runSingleEval(caseFile, { withRules: false });

    const flips = compareResults(withRulesResults, noRulesResults);
    allFlips.push(...flips);

    const wrPassed = withRulesResults.filter((r) => r.pass === true).length;
    const nrPassed = noRulesResults.filter((r) => r.pass === true).length;
    const wrCost = withRulesResults.reduce((s, r) => s + (r.cost_usd || 0), 0);
    const nrCost = noRulesResults.reduce((s, r) => s + (r.cost_usd || 0), 0);
    totalCost += wrCost + nrCost;

    console.log(`\n  Result: WITH=${wrPassed}/${withRulesResults.length} vs NO=${nrPassed}/${noRulesResults.length}`);
    if (flips.length > 0) {
      console.log(`  Flips:`);
      for (const f of flips) {
        console.log(`    ${f.flip}: ${f.description}`);
      }
    } else {
      console.log("  No flips detected");
    }
  }

  // サマリー
  const ruleHelps = allFlips.filter((f) => f.flip === "RULE_HELPS").length;
  const ruleHurts = allFlips.filter((f) => f.flip === "RULE_HURTS").length;

  console.log(`\n=== Ablation Summary ===`);
  console.log(`Total flips: ${allFlips.length}`);
  console.log(`  RULE_HELPS (PASS with rules, FAIL without): ${ruleHelps}`);
  console.log(`  RULE_HURTS (FAIL with rules, PASS without): ${ruleHurts}`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  // 保存
  const report = {
    run_id: runId,
    timestamp: new Date().toISOString(),
    case_files: caseFiles,
    total_flips: allFlips.length,
    rule_helps: ruleHelps,
    rule_hurts: ruleHurts,
    total_cost_usd: totalCost,
    flips: allFlips,
  };

  const outDir = resolve(EVAL_DIR, "results", "ablation");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${outPath}`);

  return report;
}

// CLI
const args = process.argv.slice(2);
const caseFiles = args.length > 0 ? args : ["tdd-behavior.yaml"];

runAblation(caseFiles).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
