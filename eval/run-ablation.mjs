#!/usr/bin/env node

/**
 * run-ablation.mjs — スキル/ルールの ON/OFF でハーネスの効果を比較する
 *
 * 使い方:
 *   node eval/run-ablation.mjs tdd-behavior.yaml
 *   node eval/run-ablation.mjs --concurrency 2 tdd-behavior.yaml
 *
 * 動作:
 * 1. ルールあり（base fixture 使用）で eval 実行 → 結果 A
 * 2. ルールなし（base fixture からルールを除外）で eval 実行 → 結果 B
 * 3. A と B を比較して case flips（PASS→FAIL, FAIL→PASS）を検出
 * 4. レポートを eval/results/ablation/ に保存
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseStreamJson, buildTrace } from "./lib/trace.mjs";
import { runAssertions as runDeterministicAssertions } from "./lib/assertions.mjs";
import { claudeRun, checkLlmRubricTrace } from "./lib/claude-cli.mjs";
import { mapWithConcurrency } from "./lib/concurrency.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVAL_DIR = resolve(import.meta.dirname);
const FIXTURES_DIR = resolve(EVAL_DIR, "fixtures");

const DEFAULT_CONCURRENCY = 3;

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

// --- 単一テストの実行 ---

async function runSingleAblationTest(test, { caseFile, caseFixture, defaultMaxTurns, withRules }) {
  const caseId = `${basename(caseFile, ".yaml")}/${test.description}`;
  const maxTurns = test.run?.max_turns || defaultMaxTurns;
  const fixture = test.fixture || caseFixture;
  const label = withRules ? "WITH_RULES" : "NO_RULES";

  const workdir = prepareWorkdir(fixture, { withRules });

  let ndjson;
  try {
    ndjson = await claudeRun(test.vars.task, { maxTurns, cwd: workdir });
  } catch (err) {
    cleanupWorkdir(workdir);
    console.log(`  [${label}] ${test.description} ... INFRA_ERROR`);
    return { case_id: caseId, description: test.description, pass: null, infra_error: err.message };
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
  console.log(`  [${label}] ${test.description} ... ${allPass ? "PASS" : "FAIL"}`);

  cleanupWorkdir(workdir);

  return {
    case_id: caseId,
    description: test.description,
    pass: allPass,
    assertions: assertionResults,
    cost_usd: trace.usage.total_cost_usd,
  };
}

// --- 1回分の eval 実行（並列化対応） ---

async function runSingleEval(caseFile, { withRules, concurrency }) {
  const filePath = resolve(EVAL_DIR, "cases", caseFile);
  const config = parseYaml(readFileSync(filePath, "utf-8"));
  const caseFixture = config.fixture || null;
  const defaultMaxTurns = config.run?.max_turns || 4;

  const results = await mapWithConcurrency(
    config.tests,
    (test) => runSingleAblationTest(test, { caseFile, caseFixture, defaultMaxTurns, withRules }),
    concurrency,
  );

  return results;
}

// --- 比較 ---

function compareResults(withRulesResults, noRulesResults) {
  const flips = [];

  const noRulesMap = new Map(noRulesResults.map((r) => [r.case_id, r]));

  for (const wr of withRulesResults) {
    if (!wr) continue;
    const nr = noRulesMap.get(wr.case_id);
    if (!nr) continue;

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

async function runAblation(caseFiles, { concurrency = DEFAULT_CONCURRENCY } = {}) {
  const runId = `ablation-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`\n=== Ablation: ${runId} ===`);
  console.log(`Cases: ${caseFiles.join(", ")}`);
  console.log(`Concurrency: ${concurrency}\n`);

  const allFlips = [];
  let totalCost = 0;

  for (const caseFile of caseFiles) {
    console.log(`--- ${caseFile} ---`);

    console.log("\n  Phase 1: WITH RULES");
    const withRulesResults = await runSingleEval(caseFile, { withRules: true, concurrency });

    console.log("\n  Phase 2: NO RULES");
    const noRulesResults = await runSingleEval(caseFile, { withRules: false, concurrency });

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

// --concurrency N オプションの解析
let concurrency = DEFAULT_CONCURRENCY;
const concurrencyIdx = args.indexOf("--concurrency");
if (concurrencyIdx !== -1) {
  concurrency = parseInt(args[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY;
  args.splice(concurrencyIdx, 2);
}

const caseFiles = args.length > 0 ? args : ["tdd-behavior.yaml"];

runAblation(caseFiles, { concurrency }).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
