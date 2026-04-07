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

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseStreamJson, buildTrace } from "./lib/trace.mjs";
import { runAssertionPipeline } from "./lib/assertions.mjs";
import { claudeRun, checkLlmRubricTrace } from "./lib/claude-cli.mjs";
import { mapWithConcurrency } from "./lib/concurrency.mjs";
import { prepareWorkdir, cleanupWorkdir } from "./lib/workdir.mjs";
import { parseCliArgs } from "./lib/cli-args.mjs";

const execFileAsync = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "..");
const EVAL_DIR = resolve(import.meta.dirname);

const DEFAULT_CONCURRENCY = 3;

// --- 単一テストの実行 ---

async function runSingleTest(test, { caseFile, caseFixture, defaultMaxTurns }) {
  const caseId = `${basename(caseFile, ".yaml")}/${test.description}`;
  const maxTurns = test.run?.max_turns || defaultMaxTurns;
  const fixture = test.fixture || caseFixture;

  // 1. 一時ディレクトリを作成し fixture をコピー（ルールあり）
  const workdir = prepareWorkdir(fixture);

  // 2. Claude Code 実行 (stream-json)
  let ndjson;
  try {
    ndjson = await claudeRun(test.vars.task, { maxTurns, cwd: workdir });
  } catch (err) {
    cleanupWorkdir(workdir);
    console.log(`  ${test.description} ... INFRA_ERROR`);
    return {
      case_id: caseId,
      case_file: caseFile,
      description: test.description,
      task: test.vars.task,
      infra_error: err.message,
      pass: null,
    };
  }

  // 3. trace-v1 に正規化
  const rawMessages = parseStreamJson(ndjson);
  const trace = buildTrace({
    rawMessages,
    caseId,
    caseFile,
    testDescription: test.description,
    task: test.vars.task,
  });

  // 4. 決定的 assertion + llm-rubric-trace を実行
  const results = await runAssertionPipeline(trace, test.assert || [], checkLlmRubricTrace);

  const allPass = results.every((r) => r.pass === true);
  console.log(`  ${test.description} ... ${allPass ? "PASS" : "FAIL"}`);

  if (!allPass) {
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`    x ${r.type}: ${r.reason}`);
    }
  }

  cleanupWorkdir(workdir);

  return {
    case_id: caseId,
    case_file: caseFile,
    description: test.description,
    task: test.vars.task,
    pass: allPass,
    assertions: results,
    trace,
  };
}

// --- メイン ---

async function runEval(caseFiles, { concurrency = DEFAULT_CONCURRENCY } = {}) {
  const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const gitSha = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
    .then((r) => r.stdout.trim())
    .catch(() => "unknown");

  console.log(`\n=== Eval Run: ${runId} ===`);
  console.log(`Git SHA: ${gitSha}`);
  console.log(`Cases: ${caseFiles.join(", ")}`);
  console.log(`Concurrency: ${concurrency}\n`);

  // 全テストケースをフラット化
  const testItems = [];

  for (const caseFile of caseFiles) {
    const filePath = resolve(EVAL_DIR, "cases", caseFile);
    const raw = readFileSync(filePath, "utf-8");
    const config = parseYaml(raw);
    const caseFixture = config.fixture || null;
    const defaultMaxTurns = config.run?.max_turns || 4;

    console.log(`--- ${caseFile} (${config.tests.length} tests) ---`);

    for (const test of config.tests) {
      testItems.push({ test, caseFile, caseFixture, defaultMaxTurns });
    }
  }

  // 並列実行（concurrency limiter 付き）
  const allResults = await mapWithConcurrency(
    testItems,
    (item) => runSingleTest(item.test, {
      caseFile: item.caseFile,
      caseFixture: item.caseFixture,
      defaultMaxTurns: item.defaultMaxTurns,
    }),
    concurrency,
  );

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
const { concurrency, positional } = parseCliArgs(process.argv.slice(2), DEFAULT_CONCURRENCY);
const caseFiles = positional.length > 0 ? positional : ["tdd-behavior.yaml"];

runEval(caseFiles, { concurrency }).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
