#!/usr/bin/env node

/**
 * feedback-staleness-check.mjs
 *
 * PreToolUse (Bash) フック。
 * git commit 実行前にフィードバック記録の集中度を検査する。
 *
 * open エントリが2件以上あり、かつ全件の timestamp が10分以内に集中している場合、
 * 「後でまとめて記録した可能性がある」と判断し警告を出す。
 * fail-open: 常に exit(0) でブロックしない。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 集中とみなす時間幅（ミリ秒）: 10分
const CONCENTRATION_WINDOW_MS = 10 * 60 * 1000;

// 警告を出す最小件数
const MIN_OPEN_COUNT = 2;

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const command = input?.tool_input?.command || "";

  // git commit 以外はスキップ
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0);
  }

  const cwd = input?.cwd || process.cwd();
  const feedbackPath = resolve(cwd, ".claude/harness/session-feedback.jsonl");

  let rawContent;
  try {
    rawContent = readFileSync(feedbackPath, "utf-8");
  } catch {
    // ファイルが存在しない場合はスキップ
    process.exit(0);
  }

  const openEntries = rawContent
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null && entry.status === "open");

  if (openEntries.length < MIN_OPEN_COUNT) {
    process.exit(0);
  }

  const timestamps = openEntries
    .map((entry) => {
      const ts = Date.parse(entry.timestamp);
      return Number.isNaN(ts) ? null : ts;
    })
    .filter((ts) => ts !== null);

  if (timestamps.length < MIN_OPEN_COUNT) {
    process.exit(0);
  }

  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  if (maxTs - minTs <= CONCENTRATION_WINDOW_MS) {
    process.stderr.write(
      `[feedback-staleness-check] 警告: フィードバックが短時間に集中して記録されています。指摘を受けた時点で即時記録していますか？（.claude/rules/feedback-recording.md 参照）\n`,
    );
  }

  process.exit(0);
} catch (err) {
  // fail-open: エラーが発生してもブロックしない
  process.stderr.write(`[feedback-staleness-check] ${err.message}\n`);
  process.exit(0);
}
