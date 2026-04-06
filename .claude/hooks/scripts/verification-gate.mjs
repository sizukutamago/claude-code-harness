#!/usr/bin/env node

/**
 * verification-gate.mjs
 *
 * PreToolUse (Bash) フック。
 * git commit 実行前に検証証拠の存在を確認する。
 *
 * 不変制約「検証証拠なしに完了を宣言しない」を構造的に強制する。
 * verification スキルが .claude/harness/last-verification.json を書き出す前提。
 * ファイルが存在しない or 古すぎる場合はコミットをブロックする。
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Bash",
 *   "tool_input": { "command": "git commit ..." },
 *   "cwd": "/path/to/project"
 * }
 */

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// 検証証拠の有効期限（ミリ秒）: 2時間
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const command = input?.tool_input?.command || "";

  // git commit 以外はスキップ
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0);
  }

  // --allow-empty や --amend 等のメンテナンス操作もスキップしない（すべての commit をガード）

  const cwd = input?.cwd || process.cwd();
  const evidencePath = resolve(cwd, ".claude/harness/last-verification.json");

  let stat;
  try {
    stat = statSync(evidencePath);
  } catch {
    console.error(
      `[harness] 検証証拠が見つかりません。\n` +
      `verification スキル（/verification）を実行してからコミットしてください。\n` +
      `期待されるファイル: .claude/harness/last-verification.json`,
    );
    process.exit(2);
  }

  // 古すぎる検証証拠はブロック
  const age = Date.now() - stat.mtimeMs;
  if (age > MAX_AGE_MS) {
    const hoursAgo = Math.round(age / (60 * 60 * 1000));
    console.error(
      `[harness] 検証証拠が古すぎます（${hoursAgo}時間前）。\n` +
      `verification スキル（/verification）を再実行してからコミットしてください。`,
    );
    process.exit(2);
  }

  // 検証結果を確認
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, "utf-8"));
    if (evidence.status === "FAIL") {
      console.error(
        `[harness] 検証が FAIL のままです。\n` +
        `理由: ${evidence.reason || "(不明)"}\n` +
        `問題を修正し、/verification を再実行してからコミットしてください。`,
      );
      process.exit(2);
    }
  } catch {
    // JSON パースに失敗しても、ファイルが存在し新しければ許可
  }

  process.exit(0);
} catch (err) {
  // セキュリティガードは fail-closed
  console.error(`[verification-gate] ${err.message}`);
  process.exit(2);
}
