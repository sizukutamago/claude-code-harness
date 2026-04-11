#!/usr/bin/env node

/**
 * migrate-review-findings.mjs
 *
 * 初回マイグレーション専用スクリプト。
 * Node.js 標準モジュールのみ使用（外部依存なし）。
 *
 * 機能:
 * 1. review-findings.jsonl の各エントリに id と cluster_id を付与（冪等）
 * 2. review-conventions.md に MANUAL/AUTO マーカーを挿入（冪等）
 */

import { readFile, writeFile, rename } from "node:fs/promises";

import {
  readFindings,
  writeFindingsAtomic,
  fileExists,
  computeMaxIdNum,
  MANUAL_START,
  MANUAL_END,
  AUTO_START,
  AUTO_END,
} from "./review-memory.mjs";

// --- 公開 API ---

/**
 * マイグレーションを実行する。
 *
 * 1. findings.jsonl の各エントリに id と cluster_id を付与（冪等）
 * 2. conventions.md に MANUAL/AUTO マーカーを挿入（冪等）
 *
 * @param {object} options
 * @param {string} [options.findingsPath] - findings.jsonl のパス
 * @param {string} [options.conventionsPath] - conventions.md のパス
 * @returns {Promise<{findingsMigrated: number, conventionsMigrated: boolean}>}
 */
export async function migrate(options = {}) {
  const {
    findingsPath = ".claude/harness/review-memory/review-findings.jsonl",
    conventionsPath = ".claude/harness/review-memory/review-conventions.md",
  } = options;

  const findingsMigrated = await migrateFindings(findingsPath);
  const conventionsMigrated = await migrateConventions(conventionsPath);

  return { findingsMigrated, conventionsMigrated };
}

/**
 * findings.jsonl にマイグレーションを適用する。
 * - id がないエントリに rf-NNN を採番する
 * - cluster_id フィールドがないエントリに null を付与する
 * - 冪等: 既に id がある場合はスキップ、既に cluster_id フィールドがある場合もスキップ
 *
 * @param {string} findingsPath
 * @returns {Promise<number>} マイグレーションされたエントリ数
 */
async function migrateFindings(findingsPath) {
  if (!(await fileExists(findingsPath))) {
    return 0;
  }

  const findings = await readFindings(findingsPath);
  if (findings.length === 0) {
    return 0;
  }

  // 現在の最大 id 番号を取得（既存の id を考慮した採番）
  let maxNum = computeMaxIdNum(findings, "id", "rf");

  let migratedCount = 0;
  const updatedFindings = findings.map((entry) => {
    const needsId = !("id" in entry);
    const needsClusterId = !("cluster_id" in entry);

    if (!needsId && !needsClusterId) {
      return entry;
    }

    migratedCount++;
    const updated = { ...entry };

    if (needsId) {
      maxNum++;
      updated.id = `rf-${String(maxNum).padStart(3, "0")}`;
    }

    if (needsClusterId) {
      updated.cluster_id = null;
    }

    return updated;
  });

  if (migratedCount === 0) {
    return 0;
  }

  await writeFindingsAtomic(findingsPath, updatedFindings);
  return migratedCount;
}

/**
 * conventions.md にマイグレーションを適用する。
 * - マーカーが存在しない場合: 既存全文を MANUAL セクションに入れ、末尾に空の AUTO セクションを追加
 * - 既にマーカーがある場合: スキップ（冪等）
 * - ファイルが存在しない場合: スキップ
 *
 * @param {string} conventionsPath
 * @returns {Promise<boolean>} マイグレーションを実施したかどうか
 */
async function migrateConventions(conventionsPath) {
  if (!(await fileExists(conventionsPath))) {
    return false;
  }

  const content = await readFile(conventionsPath, "utf-8");

  // 既にマーカーがある場合はスキップ
  const hasManualMarkers =
    content.includes(MANUAL_START) && content.includes(MANUAL_END);
  const hasAutoMarkers =
    content.includes(AUTO_START) && content.includes(AUTO_END);

  if (hasManualMarkers && hasAutoMarkers) {
    return false;
  }

  // 既存全文を MANUAL セクションに入れ、末尾に空の AUTO セクションを追加
  const newContent =
    `${MANUAL_START}\n${content}${MANUAL_END}\n` +
    `\n` +
    `${AUTO_START}\n${AUTO_END}\n`;

  const tmpPath = `${conventionsPath}.tmp.${process.pid}`;
  await writeFile(tmpPath, newContent, "utf-8");
  await rename(tmpPath, conventionsPath);

  return true;
}

// CLI エントリポイント
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then((result) => {
    console.log(JSON.stringify(result));
  });
}
