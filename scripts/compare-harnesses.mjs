#!/usr/bin/env node
/**
 * compare-harnesses.mjs
 *
 * 2つのハーネスの eval-results を比較して勝者を判定し、レポートを生成する。
 *
 * Usage:
 *   node scripts/compare-harnesses.mjs <eval-a.jsonl> <eval-b.jsonl> [output.jsonl]
 *
 * Example:
 *   node scripts/compare-harnesses.mjs \
 *     .claude/harness/eval-results-a.jsonl \
 *     .claude/harness/eval-results-b.jsonl \
 *     .claude/harness/comparison-report.jsonl
 *
 * Exit codes:
 *   0  正常完了
 *   1  引数エラー
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * JSONL ファイルから最新エントリを読む。
 * ファイルが存在しない・空の場合は null を返す。
 *
 * @param {string} filePath
 * @returns {object | null}
 */
function readLatestEntry(filePath) {
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, "utf-8").trim();
  if (!content) return null;

  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  try {
    return JSON.parse(lines.at(-1));
  } catch {
    return null;
  }
}

/**
 * 指標の勝者を判定する。
 *
 * @param {number | null} aVal
 * @param {number | null} bVal
 * @param {"higher" | "lower"} betterDirection - higher: 大きい方が良い / lower: 小さい方が良い
 * @returns {{ a: number | null, b: number | null, winner: "a" | "b" | "tie" }}
 */
function judgeWinner(aVal, bVal, betterDirection) {
  if (aVal === null && bVal === null) return { a: null, b: null, winner: "tie" };
  if (aVal === null) return { a: null, b: bVal, winner: "b" };
  if (bVal === null) return { a: aVal, b: null, winner: "a" };

  if (aVal === bVal) return { a: aVal, b: bVal, winner: "tie" };

  if (betterDirection === "higher") {
    return { a: aVal, b: bVal, winner: aVal > bVal ? "a" : "b" };
  } else {
    return { a: aVal, b: bVal, winner: aVal < bVal ? "a" : "b" };
  }
}

/**
 * src_loc の勝者判定（stories_done が同じ場合のみ少ない方が winner）。
 * stories_done が異なる場合は stories_done の多い方を基準に比率で判断。
 *
 * @param {object | null} entryA
 * @param {object | null} entryB
 * @returns {{ a: number | null, b: number | null, winner: "a" | "b" | "tie" }}
 */
function judgeSrcLoc(entryA, entryB) {
  const aLoc = entryA?.src_loc ?? null;
  const bLoc = entryB?.src_loc ?? null;

  if (aLoc === null && bLoc === null) return { a: null, b: null, winner: "tie" };
  if (aLoc === null) return { a: null, b: bLoc, winner: "b" };
  if (bLoc === null) return { a: aLoc, b: null, winner: "a" };

  // stories_done が同じなら少ない行数（簡潔）が良い
  const aStories = entryA?.stories_done ?? 0;
  const bStories = entryB?.stories_done ?? 0;

  if (aStories === bStories) {
    // 同じストーリー数なら少ない行数が良い
    if (aLoc === bLoc) return { a: aLoc, b: bLoc, winner: "tie" };
    return { a: aLoc, b: bLoc, winner: aLoc < bLoc ? "a" : "b" };
  }

  // stories_done が違う場合は、ストーリー当たりの行数（効率）で比較
  const aEfficiency = aStories > 0 ? aLoc / aStories : aLoc;
  const bEfficiency = bStories > 0 ? bLoc / bStories : bLoc;

  if (aEfficiency === bEfficiency) return { a: aLoc, b: bLoc, winner: "tie" };
  return { a: aLoc, b: bLoc, winner: aEfficiency < bEfficiency ? "a" : "b" };
}

/**
 * overall_winner を判定する（指標の勝利数で比較）。
 *
 * @param {object} quantitative
 * @returns {"a" | "b" | "tie"}
 */
function judgeOverallWinner(quantitative) {
  let aWins = 0;
  let bWins = 0;

  for (const metric of Object.values(quantitative)) {
    if (metric.winner === "a") aWins++;
    else if (metric.winner === "b") bWins++;
  }

  if (aWins === bWins) return "tie";
  return aWins > bWins ? "a" : "b";
}

/**
 * 人間可読なサマリ表を生成する。
 *
 * @param {object} report
 * @returns {string}
 */
function buildSummary(report) {
  const lines = [];

  lines.push(`## Synthesis Report (iteration A / B)`);
  lines.push("");
  lines.push("### 勝敗表");
  lines.push("| 指標 | A | B | 勝者 |");
  lines.push("|-----|---|---|-----|");

  for (const [key, metric] of Object.entries(report.quantitative)) {
    const aVal = metric.a !== null && metric.a !== undefined ? metric.a : "N/A";
    const bVal = metric.b !== null && metric.b !== undefined ? metric.b : "N/A";
    lines.push(`| ${key} | ${aVal} | ${bVal} | ${metric.winner} |`);
  }

  lines.push("");
  lines.push(`### 総合: ${report.overall_winner === "a" ? "A 優位" : report.overall_winner === "b" ? "B 優位" : "引き分け"}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * 比較レポートを生成する。
 *
 * @param {string} evalAPath
 * @param {string} evalBPath
 * @param {string | null} outputJsonlPath
 */
function compareHarnesses(evalAPath, evalBPath, outputJsonlPath) {
  const entryA = readLatestEntry(evalAPath);
  const entryB = readLatestEntry(evalBPath);

  const quantitative = {
    tests: judgeWinner(entryA?.tests ?? null, entryB?.tests ?? null, "higher"),
    test_code_ratio: judgeWinner(entryA?.test_code_ratio ?? null, entryB?.test_code_ratio ?? null, "higher"),
    src_loc: judgeSrcLoc(entryA, entryB),
    stories_done: judgeWinner(entryA?.stories_done ?? null, entryB?.stories_done ?? null, "higher"),
  };

  // lint_errors はデータがある場合のみ追加
  const aLint = entryA?.lint_errors ?? null;
  const bLint = entryB?.lint_errors ?? null;
  if (aLint !== null || bLint !== null) {
    quantitative.lint_errors = judgeWinner(aLint, bLint, "lower");
  }

  const overallWinner = judgeOverallWinner(quantitative);

  const report = {
    timestamp: new Date().toISOString(),
    overall_winner: overallWinner,
    quantitative,
  };

  // comparison-report.jsonl に追記
  if (outputJsonlPath) {
    const line = JSON.stringify(report) + "\n";
    appendFileSync(outputJsonlPath, line, "utf-8");
  }

  // stdout に人間可読サマリを出力
  const summary = buildSummary(report);
  process.stdout.write(summary + "\n");
}

// CLI エントリポイント
const [, , evalAPath, evalBPath, outputJsonlPath] = process.argv;

if (!evalAPath || !evalBPath) {
  process.stderr.write("Usage: node scripts/compare-harnesses.mjs <eval-a.jsonl> <eval-b.jsonl> [output.jsonl]\n");
  process.exit(1);
}

compareHarnesses(
  resolve(evalAPath),
  resolve(evalBPath),
  outputJsonlPath ? resolve(outputJsonlPath) : null,
);
