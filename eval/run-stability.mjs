#!/usr/bin/env node

/**
 * run-stability.mjs — pass^k 安定性測定ランナー
 *
 * 同一ケースを k 回実行して LLM の確率的振る舞いの flakiness を数値化する。
 *
 * Usage:
 *   node eval/run-stability.mjs [--k 3] [--concurrency 3] [case-files...]
 *
 * Example:
 *   node eval/run-stability.mjs --k 3 tdd-behavior.yaml
 *   node eval/run-stability.mjs --k 5 tdd-behavior.yaml requirements-behavior.yaml
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { mapWithConcurrency } from "./lib/concurrency.mjs";
import { parseCliArgs } from "./lib/cli-args.mjs";
import { runSingleTest } from "./lib/test-runner.mjs";
import { aggregateStabilityResults } from "./lib/stability.mjs";

const EVAL_DIR = resolve(import.meta.dirname);

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_K = 3;

/**
 * case_id をファイルシステム安全な文字列に変換する。
 * 英数字・アンダースコア・ハイフン以外を "_" に置換し、80文字でスライスする。
 *
 * @param {string} caseId
 * @returns {string}
 */
function toCaseIdSafe(caseId) {
  return caseId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

/**
 * stability ランを実行して結果を保存する。
 *
 * @param {string[]} caseFiles - ケースファイル名の配列
 * @param {object} options
 * @param {number} options.k - 各ケースの実行回数
 * @param {number} options.concurrency - 同時実行数
 */
async function runStability(caseFiles, { k = DEFAULT_K, concurrency = DEFAULT_CONCURRENCY } = {}) {
  const runId = `stability-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`\n=== Stability Run: ${runId} ===`);
  console.log(`k: ${k}, Concurrency: ${concurrency}`);
  console.log(`Case files: ${caseFiles.join(", ")}\n`);

  // テストアイテムを k 個複製してフラット展開
  const testItems = [];

  for (const caseFile of caseFiles) {
    const filePath = resolve(EVAL_DIR, "cases", caseFile);
    const raw = readFileSync(filePath, "utf-8");
    const config = parseYaml(raw);
    const caseFixture = config.fixture || null;
    const defaultMaxTurns = config.run?.max_turns || 4;

    console.log(`--- ${caseFile} (${config.tests.length} tests × ${k} runs) ---`);

    for (const test of config.tests) {
      for (let runIndex = 0; runIndex < k; runIndex++) {
        testItems.push({ test, caseFile, caseFixture, defaultMaxTurns, runIndex });
      }
    }
  }

  // 並列実行（concurrency limiter 付き）
  const allResults = await mapWithConcurrency(
    testItems,
    (item) => runSingleTest(item.test, {
      caseFile: item.caseFile,
      caseFixture: item.caseFixture,
      defaultMaxTurns: item.defaultMaxTurns,
    }).then((result) => ({ ...result, runIndex: item.runIndex })),
    concurrency,
  );

  // case_id ごとにグルーピングして pass/fail を集計
  const runsPerCase = new Map();
  const tracePerCase = new Map();

  for (const result of allResults) {
    const caseId = result.case_id;
    if (!runsPerCase.has(caseId)) {
      runsPerCase.set(caseId, []);
      tracePerCase.set(caseId, []);
    }
    runsPerCase.get(caseId).push(result.pass);
    tracePerCase.get(caseId).push(result);
  }

  // 合計コスト計算
  const totalCostUsd = allResults.reduce(
    (sum, r) => sum + (r.trace?.usage?.total_cost_usd || 0),
    0,
  );

  // aggregateStabilityResults で集約
  const { per_case, summary } = aggregateStabilityResults(runsPerCase, k, totalCostUsd);

  // 結果表示
  console.log("\n=== Stability Summary ===");
  const headerLine = `${"Case ID".padEnd(50)} | ${"pass^k".padStart(6)} | ${"pass/k".padStart(8)} | classification`;
  console.log(headerLine);
  console.log("-".repeat(headerLine.length));

  for (const entry of per_case) {
    const shortId = entry.case_id.length > 48 ? entry.case_id.slice(0, 45) + "..." : entry.case_id;
    const passK = entry.pass_k.toFixed(3);
    const passRatio = `${entry.pass_count}/${k}`;
    console.log(
      `${shortId.padEnd(50)} | ${passK.padStart(6)} | ${passRatio.padStart(8)} | ${entry.classification}`,
    );
  }

  console.log(
    `\nTotal: stable_pass=${summary.stable_pass} stable_fail=${summary.stable_fail} flaky=${summary.flaky}  Cost: $${totalCostUsd.toFixed(4)}`,
  );

  // 保存先: eval/results/stability/<runId>/summary.json + runs/<caseIdSafe>/run-N.json
  const outDir = resolve(EVAL_DIR, "results", "stability", runId);
  mkdirSync(outDir, { recursive: true });

  // 個別 trace を保存
  for (const [caseId, caseRuns] of tracePerCase) {
    const caseIdSafe = toCaseIdSafe(caseId);
    const caseRunDir = join(outDir, "runs", caseIdSafe);
    mkdirSync(caseRunDir, { recursive: true });

    for (const run of caseRuns) {
      const outPath = join(caseRunDir, `run-${run.runIndex}.json`);
      writeFileSync(outPath, JSON.stringify(run, null, 2));
    }
  }

  // summary.json を保存
  const summaryData = {
    run_id: runId,
    k,
    concurrency,
    case_files: caseFiles,
    timestamp: new Date().toISOString(),
    per_case,
    summary,
  };
  const summaryPath = join(outDir, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));

  console.log(`Results saved: ${summaryPath}`);

  return summaryData;
}

// CLI
const { k, concurrency, positional } = parseCliArgs(
  process.argv.slice(2),
  DEFAULT_CONCURRENCY,
  DEFAULT_K,
);
const caseFiles = positional.length > 0 ? positional : ["tdd-behavior.yaml"];

runStability(caseFiles, { k, concurrency }).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
