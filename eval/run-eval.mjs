#!/usr/bin/env node

/**
 * claude-code-harness eval runner v2
 *
 * stream-json ベースの行動 trace 評価。
 * 1. eval/cases/*.yaml からテスト定義を読む
 * 2. claude -p --output-format stream-json --verbose で実行
 * 3. stream-json を trace-v1 に正規化
 * 4. 決定的 assertion + llm-rubric-trace で判定
 * 5. 結果を eval/results/ に保存
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve, basename, join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { parseStreamJson, buildTrace } from "./lib/trace.mjs";
import { runAssertions as runDeterministicAssertions } from "./lib/assertions.mjs";

const execFileAsync = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "..");
const EVAL_DIR = resolve(import.meta.dirname);
const FIXTURES_DIR = resolve(EVAL_DIR, "fixtures");

// --- Claude Code CLI ---

function claudeRun(prompt, { maxTurns = 4, cwd = ROOT } = {}) {
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

// 判定者: /tmp で CLAUDE.md なし環境で実行
function claudeJudge(prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--max-turns", "1",
      "--output-format", "json",
    ];

    const child = spawn("claude", args, { cwd: "/tmp", timeout: 120000 });

    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", () => {});

    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`judge parse failed: ${stdout.slice(0, 300)}`));
      }
    });

    child.on("error", reject);

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// --- llm-rubric-trace ---

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
      return {
        type: "llm-rubric-trace",
        value: rubric,
        pass: parsed.pass,
        reason: parsed.reason,
        grader_cost_usd: result.total_cost_usd || 0,
      };
    }
    return { type: "llm-rubric-trace", pass: false, reason: `judge parse failed: ${text.slice(0, 200)}` };
  } catch (err) {
    return { type: "llm-rubric-trace", pass: false, reason: `judge error: ${err.message}` };
  }
}

// --- Fixture ---

function prepareWorkdir(fixtureName) {
  const workdirsRoot = resolve(EVAL_DIR, "workdirs");
  mkdirSync(workdirsRoot, { recursive: true });
  const workdir = mkdtempSync(join(workdirsRoot, "run-"));

  // base fixture を先にコピー（CLAUDE.md, ルール, スキル等）
  const baseDir = resolve(FIXTURES_DIR, "base");
  try {
    cpSync(baseDir, workdir, { recursive: true });
  } catch {
    // base がなければスキップ
  }

  // ケース固有の fixture を上書きコピー
  if (fixtureName) {
    const fixtureDir = resolve(FIXTURES_DIR, fixtureName);
    cpSync(fixtureDir, workdir, { recursive: true });
  }

  return workdir;
}

function cleanupWorkdir(workdir) {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // cleanup failure は無視
  }
}

// --- メイン ---

async function runEval(caseFiles) {
  const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const gitSha = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .then((r) => r.stdout.trim())
    .catch(() => "unknown");

  console.log(`\n=== Eval Run: ${runId} ===`);
  console.log(`Git SHA: ${gitSha}`);
  console.log(`Cases: ${caseFiles.join(", ")}\n`);

  const allResults = [];

  for (const caseFile of caseFiles) {
    const filePath = resolve(EVAL_DIR, "cases", caseFile);
    const raw = readFileSync(filePath, "utf-8");
    const config = parseYaml(raw);

    console.log(`--- ${caseFile} (${config.tests.length} tests) ---`);

    // fixture 名はケースファイル単位 or テスト単位で指定可能
    const caseFixture = config.fixture || null;

    for (const test of config.tests) {
      const caseId = `${basename(caseFile, ".yaml")}/${test.description}`;
      const maxTurns = test.run?.max_turns || config.run?.max_turns || 4;
      const fixture = test.fixture || caseFixture;
      process.stdout.write(`  ${test.description} ... `);

      // 1. 一時ディレクトリを作成し fixture をコピー
      const workdir = prepareWorkdir(fixture);

      // 2. Claude Code 実行 (stream-json)
      let ndjson;
      try {
        ndjson = await claudeRun(test.vars.task, { maxTurns, cwd: workdir });
      } catch (err) {
        cleanupWorkdir(workdir);
        console.log("INFRA_ERROR");
        allResults.push({
          case_id: caseId,
          case_file: caseFile,
          description: test.description,
          task: test.vars.task,
          infra_error: err.message,
          pass: null,
        });
        continue;
      }

      // 2. trace-v1 に正規化
      const rawMessages = parseStreamJson(ndjson);
      const trace = buildTrace({
        rawMessages,
        caseId,
        caseFile,
        testDescription: test.description,
        task: test.vars.task,
      });

      // 3. 決定的 assertion を実行
      const assertions = test.assert || [];
      const deterministicAssertions = assertions.filter((a) => a.type !== "llm-rubric-trace");
      const llmAssertions = assertions.filter((a) => a.type === "llm-rubric-trace");

      const results = runDeterministicAssertions(trace, deterministicAssertions);

      // 4. llm-rubric-trace を実行（あれば）
      for (const a of llmAssertions) {
        results.push(await checkLlmRubricTrace(trace, a.value));
      }

      const allPass = results.every((r) => r.pass === true);
      console.log(allPass ? "PASS" : "FAIL");

      if (!allPass) {
        for (const r of results.filter((r) => !r.pass)) {
          console.log(`    x ${r.type}: ${r.reason}`);
        }
      }

      allResults.push({
        case_id: caseId,
        case_file: caseFile,
        description: test.description,
        task: test.vars.task,
        pass: allPass,
        assertions: results,
        trace,
      });

      cleanupWorkdir(workdir);
    }
  }

  // サマリー
  const passed = allResults.filter((r) => r.pass === true).length;
  const failed = allResults.filter((r) => r.pass === false).length;
  const infraErrors = allResults.filter((r) => r.pass === null).length;
  const evaluated = passed + failed;
  const totalCost = allResults.reduce(
    (sum, r) => sum + (r.trace?.usage?.total_cost_usd || 0),
    0,
  );

  const summary = {
    run_id: runId,
    git_sha: gitSha,
    timestamp: new Date().toISOString(),
    total_tests: allResults.length,
    evaluated,
    passed,
    failed,
    infra_errors: infraErrors,
    pass_rate: evaluated > 0 ? `${((passed / evaluated) * 100).toFixed(1)}%` : "N/A",
    total_cost_usd: totalCost.toFixed(4),
  };

  console.log(`\n=== Summary ===`);
  console.log(`Pass: ${passed}/${evaluated} (${summary.pass_rate})`);
  console.log(`Failed: ${failed}, Infra Errors: ${infraErrors}`);
  console.log(`Cost: $${summary.total_cost_usd}`);

  // 保存
  // NOTE: trace を結果に丸ごと含めているのでファイルサイズが大きくなりうる。
  //       問題になったら trace を別ファイルに分離する。
  const resultData = { summary, results: allResults };
  const outDir = resolve(EVAL_DIR, "results", "raw");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(resultData, null, 2));
  console.log(`Results saved: ${outPath}`);

  return resultData;
}

// CLI
const args = process.argv.slice(2);
const caseFiles = args.length > 0 ? args : ["tdd-behavior.yaml"];

runEval(caseFiles).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
