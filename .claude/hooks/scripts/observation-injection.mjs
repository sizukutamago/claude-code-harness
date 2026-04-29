#!/usr/bin/env node

/**
 * observation-injection.mjs
 *
 * SessionStart フック。
 * .claude/harness/observation-log.jsonl から severity=critical/warning の未解決 finding を
 * 抽出し、stdout に Markdown ブロックとして出力する。
 * Claude Code の SessionStart hook は stdout を session prompt に注入する仕様。
 *
 * .claude/rules/observation-injection.md の要求仕様に対応:
 * - 「## 前回セッションの観察結果」ブロックを生成
 * - Critical（対応必須）/ Warning（検討推奨）に分類
 * - 各カテゴリ最大 5 件まで（observation-management.md の上限ルール）
 *
 * Resolution 検出:
 * - resolve-observation.mjs CLI が追記した resolution エントリの
 *   `resolves_finding_id` フィールドが当該 finding の timestamp（id 不在のため timestamp で代用）に
 *   一致する場合、resolved とみなして除外する
 *
 * 出力:
 * - 0 件なら何も出さず exit 0
 * - 1 件以上なら markdown ブロックを stdout に出して exit 0
 * - エラー時は stderr に出して exit 0（session 起動を妨げない）
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MAX_PER_SEVERITY = 5;

function readInput() {
  try {
    const raw = readFileSync(0, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadEntries(logPath) {
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf-8").trim().split("\n");
  const entries = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function findResolvedTimestamps(entries) {
  // resolve-observation.mjs が追記する resolution エントリ:
  // { type: "resolution", resolves_finding_id: "<timestamp or id>", ... }
  const resolved = new Set();
  for (const e of entries) {
    if (e.resolves_finding_id) {
      resolved.add(e.resolves_finding_id);
    }
  }
  return resolved;
}

function shouldShow(entry, resolvedSet) {
  if (entry.type === "resolution") return false;
  // resolved_at / resolved_by が直接付いている entry はスキップ
  if (entry.resolved_at) return false;
  // resolves_finding_id が付いた resolution エントリ自身はスキップ
  if (entry.resolves_finding_id) return false;
  // timestamp が resolution の対象になっていればスキップ
  if (entry.timestamp && resolvedSet.has(entry.timestamp)) return false;
  if (entry.id && resolvedSet.has(entry.id)) return false;
  return true;
}

function formatLine(entry) {
  const reviewer = entry.reviewer || entry.observer || "unknown";
  const finding = (entry.finding || "").replace(/\n+/g, " ").slice(0, 240);
  const reco = (entry.recommendation || "").replace(/\n+/g, " ").slice(0, 240);
  if (reco) {
    return `- [${reviewer}] ${finding} → ${reco}`;
  }
  return `- [${reviewer}] ${finding}`;
}

try {
  const input = readInput();
  const cwd = input?.cwd || process.cwd();
  const logPath = resolve(cwd, ".claude/harness/observation-log.jsonl");

  const entries = loadEntries(logPath);
  if (entries.length === 0) process.exit(0);

  const resolvedSet = findResolvedTimestamps(entries);

  const critical = [];
  const warning = [];
  // 新しい順に処理（jsonl は時系列追記なので末尾が新しい）
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!shouldShow(e, resolvedSet)) continue;
    if (e.severity === "critical" && critical.length < MAX_PER_SEVERITY) {
      critical.push(e);
    } else if (e.severity === "warning" && warning.length < MAX_PER_SEVERITY) {
      warning.push(e);
    }
    if (critical.length >= MAX_PER_SEVERITY && warning.length >= MAX_PER_SEVERITY) break;
  }

  if (critical.length === 0 && warning.length === 0) process.exit(0);

  const lines = ["## 前回セッションの観察結果", ""];
  if (critical.length > 0) {
    lines.push("### Critical（対応必須）");
    for (const e of critical) lines.push(formatLine(e));
    lines.push("");
  }
  if (warning.length > 0) {
    lines.push("### Warning（検討推奨）");
    for (const e of warning) lines.push(formatLine(e));
    lines.push("");
  }
  lines.push(
    `_(observation-log.jsonl から最新 ${critical.length + warning.length} 件を表示。各 severity 最大 ${MAX_PER_SEVERITY} 件・resolution エントリで closed のものは除外)_`,
  );

  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
} catch (err) {
  console.error(`[observation-injection] ${err.message}`);
  process.exit(0);
}
