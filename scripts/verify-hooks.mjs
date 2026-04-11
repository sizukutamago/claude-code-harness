#!/usr/bin/env node

/**
 * verify-hooks.mjs
 * ハーネスの hooks が正しく設定されているかを検証する。
 *
 * 使い方: node scripts/verify-hooks.mjs
 *
 * 終了コード:
 *   0: 完全に正常（settings.json OK + session-tool-log.jsonl 存在）
 *   1: 致命的エラー（settings.json 不在 or JSON 不正 or hooks セクション不在）
 *   2: 設定は正しいが session-tool-log.jsonl がまだない（次セッション待ち）
 */

import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const settingsPath = resolve(projectRoot, ".claude/settings.json");
const toolLogPath = resolve(projectRoot, ".claude/harness/session-tool-log.jsonl");
const legacyHooksPath = resolve(projectRoot, ".claude/hooks/hooks.json");

const EXPECTED_EVENTS = ["PreToolUse", "PostToolUse", "PermissionDenied", "SessionEnd"];

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const errors = [];
  const warnings = [];

  // レガシー hooks.json 警告
  if (await fileExists(legacyHooksPath)) {
    warnings.push("Legacy .claude/hooks/hooks.json still exists (not read by Claude Code). Delete it.");
  }

  // settings.json 存在確認
  if (!(await fileExists(settingsPath))) {
    errors.push(".claude/settings.json does not exist. Hooks must be defined here.");
    report(errors, warnings);
    process.exit(1);
  }

  // JSON パース
  let settings;
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf-8"));
  } catch (err) {
    errors.push(`.claude/settings.json is not valid JSON: ${err.message}`);
    report(errors, warnings);
    process.exit(1);
  }

  // hooks セクション確認
  if (!settings.hooks || typeof settings.hooks !== "object") {
    errors.push(".claude/settings.json lacks a 'hooks' section.");
    report(errors, warnings);
    process.exit(1);
  }

  // 期待イベント確認
  const definedEvents = Object.keys(settings.hooks);
  const missing = EXPECTED_EVENTS.filter((e) => !definedEvents.includes(e));
  if (missing.length > 0) {
    warnings.push(`Expected events missing: ${missing.join(", ")}`);
  }

  // session-tool-log.jsonl 確認
  if (await fileExists(toolLogPath)) {
    console.log(`[verify-hooks] OK`);
    console.log(`  settings.json has hooks`);
    console.log(`  defined events: ${definedEvents.join(", ")}`);
    console.log(`  session-tool-log.jsonl exists (post-tool-log fired)`);
    if (warnings.length > 0) {
      warnings.forEach((w) => console.warn(`  warning: ${w}`));
    }
    process.exit(0);
  }

  // settings.json は正しいが post-tool-log 未発火
  warnings.push(
    `session-tool-log.jsonl does not exist. post-tool-log.mjs has never fired. ` +
    `Hooks may not be loaded yet — restart Claude Code session.`,
  );
  console.log(`[verify-hooks] PARTIAL`);
  console.log(`  settings.json has hooks (${definedEvents.join(", ")})`);
  warnings.forEach((w) => console.warn(`  warning: ${w}`));
  process.exit(2);
}

function report(errors, warnings) {
  errors.forEach((e) => console.error(`[verify-hooks] ERROR: ${e}`));
  warnings.forEach((w) => console.warn(`[verify-hooks] WARNING: ${w}`));
}

main().catch((err) => {
  console.error(`[verify-hooks] Unexpected: ${err.message}`);
  process.exit(1);
});
