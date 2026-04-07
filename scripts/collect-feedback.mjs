#!/usr/bin/env node

/**
 * collect-feedback.mjs
 *
 * .claude/harness/session-feedback.jsonl からフィードバックを収集・分析するスクリプト。
 * LLM を使わない決定的処理のみ。
 *
 * 機能:
 * - status: open のフィードバックをフィルタ
 * - manual-edit の人手修正判定（git diff との突き合わせ）
 * - 過去 applied との再発チェック（種別 + 反映先の一致）
 * - 結果を JSON で stdout に出力
 *
 * Usage:
 *   node scripts/collect-feedback.mjs [--feedback-file path]
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    feedbackFile: resolve(ROOT, ".claude/harness/session-feedback.jsonl"),
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--feedback-file" && args[i + 1]) {
      opts.feedbackFile = resolve(args[++i]);
    }
  }
  return opts;
}

// --- JSONL 読み込み ---

function readFeedbackFile(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const lines = readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(`Warning: failed to parse line ${i + 1}`);
      return null;
    }
  }).filter(Boolean);
}

// --- Claude が触ったファイルを取得（session-tool-log.jsonl から） ---

function getClaudeChangedFiles() {
  const toolLogPath = resolve(ROOT, ".claude/harness/session-tool-log.jsonl");
  if (!existsSync(toolLogPath)) {
    return [];
  }
  const lines = readFileSync(toolLogPath, "utf-8").split("\n").filter(Boolean);
  const files = lines
    .map((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.file || null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return [...new Set(files)];
}

// --- 人手修正の判定 ---

function classifyManualEdits(entries, claudeFiles) {
  return entries.map((entry) => {
    if (entry.type !== "manual-edit") return entry;

    const affected = entry.affected || "";
    const claudeTouched = claudeFiles.some(
      (f) => f === affected || affected.endsWith(f) || f.endsWith(affected),
    );

    if (claudeTouched) {
      return { ...entry, type: "correction", manual_edit_classified: true };
    }
    return { ...entry, type: "unrelated", manual_edit_classified: true };
  });
}

// --- 再発チェック ---

function checkRecurrence(openEntries, appliedEntries) {
  return openEntries.map((entry) => {
    const recurring = appliedEntries.find(
      (a) =>
        a.category === entry.category &&
        a.affected === entry.affected &&
        a.id !== entry.id,
    );
    if (recurring) {
      return { ...entry, recurring: true, recurring_ref: recurring.id };
    }
    return { ...entry, recurring: false };
  });
}

// --- メイン ---

function main() {
  const opts = parseArgs();
  const allEntries = readFeedbackFile(opts.feedbackFile);

  if (allEntries.length === 0) {
    const result = {
      total: 0,
      open: 0,
      applied: 0,
      entries: [],
      needs_classification: [],
      skipped: [],
      recurring_count: 0,
    };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const openEntries = allEntries.filter((e) => e.status === "open");
  const appliedEntries = allEntries.filter((e) => e.status === "applied");

  // 人手修正の判定
  const claudeFiles = getClaudeChangedFiles();
  const classified = classifyManualEdits(openEntries, claudeFiles);

  // unrelated を除外
  const relevant = classified.filter((e) => e.type !== "unrelated");
  const skipped = classified.filter((e) => e.type === "unrelated");

  // 再発チェック
  const withRecurrence = checkRecurrence(relevant, appliedEntries);

  // 未分類（category がないもの）を抽出 → LLM で分類が必要
  const needsClassification = withRecurrence.filter((e) => !e.category);
  const alreadyClassified = withRecurrence.filter((e) => e.category);

  const result = {
    total: allEntries.length,
    open: openEntries.length,
    applied: appliedEntries.length,
    entries: alreadyClassified,
    needs_classification: needsClassification,
    skipped: skipped.map((e) => ({ id: e.id, affected: e.affected, reason: "Claude未操作" })),
    recurring_count: withRecurrence.filter((e) => e.recurring).length,
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
