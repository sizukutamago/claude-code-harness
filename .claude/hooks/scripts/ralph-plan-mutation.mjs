#!/usr/bin/env node

/**
 * ralph-plan-mutation.mjs — PostToolUse フック
 *
 * Autonomous mode 時に plan.md への非チェックボックス変更をブロックする。
 *
 * - exit 0: 許可
 * - exit 2: ブロック（RALPH_PLAN_MUTATION_VIOLATION）
 */

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

/**
 * パスをシンボリックリンクを解決した絶対パスに正規化する。
 * ファイルが存在しない場合は親ディレクトリを解決してから basename を結合する。
 *
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  const resolved = resolve(p);
  try {
    return realpathSync(resolved);
  } catch {
    // ファイルが存在しない場合、親ディレクトリを解決して basename を結合する
    try {
      return resolve(realpathSync(dirname(resolved)), basename(resolved));
    } catch {
      return resolved;
    }
  }
}

/**
 * old_string と new_string の差異がチェックボックスのトグルのみかを検証する。
 * [ ] と [x] を同一に正規化して比較する。
 *
 * @param {string} oldStr
 * @param {string} newStr
 * @returns {boolean} チェックボックスのみの変更なら true
 */
function onlyCheckboxChanges(oldStr, newStr) {
  const normalize = (s) => s.replace(/\[[ x]\]/g, "[_]");
  return normalize(oldStr) === normalize(newStr);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(readFileSync(0, "utf-8"));

    const cwd = process.cwd();
    const configPath = resolve(cwd, ".ralph/config.json");

    if (!existsSync(configPath)) {
      process.exit(0);
    }

    let config;
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      process.exit(0);
    }

    if (config.mode !== "autonomous") {
      process.exit(0);
    }

    const planRelPath = config?.references?.plan;
    if (!planRelPath) {
      process.exit(0);
    }

    const planAbsPath = normalizePath(resolve(cwd, planRelPath));
    const filePath = input?.tool_input?.file_path || "";
    const fileAbsPath = normalizePath(filePath);

    if (fileAbsPath !== planAbsPath) {
      process.exit(0);
    }

    const toolName = input?.tool_name || "";

    if (toolName === "Write") {
      console.error("RALPH_PLAN_MUTATION_VIOLATION: plan.md への Write 操作は禁止されています");
      process.exit(2);
    }

    if (toolName === "Edit") {
      const oldStr = input?.tool_input?.old_string || "";
      const newStr = input?.tool_input?.new_string || "";
      if (!onlyCheckboxChanges(oldStr, newStr)) {
        console.error("RALPH_PLAN_MUTATION_VIOLATION: plan.md のチェックボックス以外の変更は禁止されています");
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(`[ralph-plan-mutation] ${err.message}`);
    process.exit(0);
  }
}
