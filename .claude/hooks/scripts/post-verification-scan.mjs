#!/usr/bin/env node

/**
 * post-verification-scan.mjs
 *
 * PreToolUse (Bash) フック。
 * git commit 実行前に不要ファイルが残っていないか検出する。
 *
 * cleanup スキル（step [10]）が完了した後にコミットする想定。
 * 一時ファイルやデバッグコードの残留を検出して警告する。
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Bash",
 *   "tool_input": { "command": "git commit ..." },
 *   "cwd": "/path/to/project"
 * }
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// 検出対象の一時ファイルパターン
const STALE_PATTERNS = [
  /\.tmp$/,
  /\.bak$/,
  /\.orig$/,
  /~$/,
  /\.swp$/,
  /\.debug\.[jt]sx?$/,
];

// 検出対象のディレクトリ名
const STALE_DIRS = ["tmp", "temp", ".temp"];

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const command = input?.tool_input?.command || "";

  // git commit 以外はスキップ
  if (!/\bgit\s+commit\b/.test(command)) {
    process.exit(0);
  }

  const cwd = input?.cwd || process.cwd();
  const warnings = [];

  // git staging area のファイルをチェック（staged files のみ）
  // ここでは簡易的にワーキングディレクトリの直下をスキャン
  try {
    const entries = readdirSync(cwd);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      // 一時ディレクトリの検出
      if (STALE_DIRS.includes(entry.toLowerCase())) {
        try {
          const s = statSync(join(cwd, entry));
          if (s.isDirectory()) {
            warnings.push(`一時ディレクトリ: ${entry}/`);
          }
        } catch { /* ignore */ }
        continue;
      }

      // 一時ファイルパターンの検出
      for (const pattern of STALE_PATTERNS) {
        if (pattern.test(entry)) {
          warnings.push(`一時ファイル: ${entry}`);
          break;
        }
      }
    }
  } catch { /* cwd 読み取り失敗は無視 */ }

  if (warnings.length > 0) {
    // 警告のみ（ブロックしない）— cleanup スキルで対処可能
    console.error(
      `[harness] 不要ファイルの可能性を検出しました:\n` +
      warnings.map((w) => `  - ${w}`).join("\n") +
      `\ncleanup スキル（/cleanup）で整理してからコミットすることを推奨します。`,
    );
    // exit(0) で許可（警告のみ）
  }

  process.exit(0);
} catch (err) {
  // スキャンエラーはブロックしない（コミットの邪魔をしない）
  console.error(`[post-verification-scan] ${err.message}`);
  process.exit(0);
}
