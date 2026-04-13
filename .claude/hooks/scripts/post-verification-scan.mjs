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

  // staged files をチェック（git diff --cached を使用）
  try {
    const { execSync } = await import("node:child_process");
    const stagedOutput = execSync("git diff --cached --name-only", { cwd, encoding: "utf-8" });
    const stagedFiles = stagedOutput.trim().split("\n").filter(Boolean);

    for (const filePath of stagedFiles) {
      const fileName = filePath.split("/").pop() || "";

      // 一時ファイルパターンの検出
      for (const pattern of STALE_PATTERNS) {
        if (pattern.test(fileName)) {
          warnings.push(`一時ファイル（staged）: ${filePath}`);
          break;
        }
      }
    }
  } catch { /* git コマンド失敗は無視 */ }

  // ワーキングディレクトリ直下の一時ディレクトリも検出
  try {
    const entries = readdirSync(cwd);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      if (STALE_DIRS.includes(entry.toLowerCase())) {
        try {
          const s = statSync(join(cwd, entry));
          if (s.isDirectory()) {
            warnings.push(`一時ディレクトリ: ${entry}/`);
          }
        } catch { /* ignore */ }
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
