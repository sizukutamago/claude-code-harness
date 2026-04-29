#!/usr/bin/env node

/**
 * artifact-guard.mjs
 *
 * SessionStart 時 (warning) と PreToolUse Bash (git commit) 時 (block) に
 * untracked artifact が一定数を超えていないかチェックする。
 *
 * 観察ログ「untracked PNG / artifacts」(22 occurrences, 5 critical) への構造的対処。
 *
 * 動作:
 * - mode=warn (SessionStart): untracked artifact が 5 件以上で warning を stdout に出す
 * - mode=block (PreToolUse on git commit): 20 件以上で commit をブロック (exit 2)
 *
 * 対象パターン:
 * - リポジトリルートの *.png
 * - .ralph/*.png や .playwright-mcp/ 配下
 * - test-results/ playwright-report/ の untracked
 *
 * 期待される stdin JSON (PreToolUse):
 * { "tool_name": "Bash", "tool_input": { "command": "git commit ..." }, "cwd": "..." }
 *
 * 期待される stdin JSON (SessionStart):
 * { "cwd": "..." } (or no input)
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const WARN_THRESHOLD = 5;
const BLOCK_THRESHOLD = 20;

function getUntrackedArtifacts(cwd) {
  try {
    const out = execSync("git status --porcelain=v1 --untracked-files=normal", {
      cwd,
      encoding: "utf-8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return out
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("?? "))
      .map((line) => line.slice(3))
      .filter((path) => {
        // PNG anywhere in repo root or under .ralph/.playwright-mcp/test-results
        if (/\.png$/i.test(path)) return true;
        if (path.startsWith(".playwright-mcp/")) return true;
        if (path.startsWith(".ralph/.playwright-mcp/")) return true;
        if (path.startsWith("test-results/")) return true;
        if (path.startsWith("playwright-report/")) return true;
        return false;
      });
  } catch {
    return [];
  }
}

function readInput() {
  try {
    const raw = readFileSync(0, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const input = readInput();
const cwd = input?.cwd || process.cwd();
const command = input?.tool_input?.command || "";
const isCommit = /\bgit\s+commit\b/.test(command);
const mode = process.argv[2] || (isCommit ? "block" : "warn");

const artifacts = getUntrackedArtifacts(cwd);

if (mode === "block" && artifacts.length >= BLOCK_THRESHOLD) {
  console.error(
    `[harness] untracked artifact が ${artifacts.length} 件あります（block 閾値 ${BLOCK_THRESHOLD}）。\n` +
    `git status で確認し、以下のいずれかで対処してください:\n` +
    `  1. 必要なファイルを git add\n` +
    `  2. 不要なファイルを rm\n` +
    `  3. パターンを .gitignore に追加\n` +
    `先頭 5 件: ${artifacts.slice(0, 5).join(", ")}`,
  );
  process.exit(2);
}

if (artifacts.length >= WARN_THRESHOLD) {
  console.error(
    `[harness] untracked artifact が ${artifacts.length} 件あります（warning 閾値 ${WARN_THRESHOLD}）。\n` +
    `先頭 3 件: ${artifacts.slice(0, 3).join(", ")}\n` +
    `commit 前に整理することを推奨。`,
  );
  // warn は exit 0 で続行
  process.exit(0);
}

process.exit(0);
