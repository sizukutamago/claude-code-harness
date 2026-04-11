#!/usr/bin/env node

/**
 * review-memory.mjs
 *
 * review-findings.jsonl の読み書き基盤ユーティリティ。
 * Node.js 標準モジュールのみ使用（外部依存なし）。
 *
 * 提供する関数:
 * - readFindings(findingsPath)         — JSONL を読んで配列を返す
 * - appendFinding(findingsPath, finding) — エントリを1行追記
 * - writeFindingsAtomic(findingsPath, findings) — 配列全体をアトミックに書き出す
 * - writeFileAtomic(targetPath, content) — ファイルをアトミックに書き込む共通ヘルパー
 * - nextFindingId(findingsPath)        — 次の rf-NNN ID を採番
 * - nextClusterId(findingsPath)        — 次の c-NNN ID を採番
 * - findPromotable(findingsPath)       — 昇格対象クラスタ一覧を返す
 * - getClusterRepresentatives(findingsPath) — クラスタ代表エントリ一覧を返す
 * - promoteCluster(...)               — cluster_id を指定してクラスタを昇格（サイドカー state 更新）
 * - rebuildConventions(...)           — conventions.md を MANUAL/AUTO に再構築（カテゴリ別フォーマット）
 */

import { readFile, appendFile, writeFile, rename, unlink, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { parseArgs } from "node:util";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

// --- マーカー定数 ---

export const MANUAL_START = "<!-- MANUAL:START -->";
export const MANUAL_END = "<!-- MANUAL:END -->";
export const AUTO_START = "<!-- AUTO:START -->";
export const AUTO_END = "<!-- AUTO:END -->";

// --- 内部ヘルパー ---

/**
 * ファイルが存在するかチェックする
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * id フィールドの最大番号を計算する共通ヘルパー。
 * rf-NNN / c-NNN どちらにも対応できる汎用実装。
 *
 * @param {object[]} findings
 * @param {string} field — 参照するフィールド名（"id" or "cluster_id"）
 * @param {string} prefix — "rf" or "c"
 * @returns {number}
 */
export function computeMaxIdNum(findings, field, prefix) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const f of findings) {
    const value = f[field];
    if (typeof value !== "string") continue;
    const match = value.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return max;
}

// --- 公開 API ---

/**
 * ファイルをアトミックに書き込む共通ヘルパー。
 * tmpfile に書いてから rename で置換する。
 * tmpfile パスに randomBytes を使って予測不能にする（TOCTOU 対策）。
 *
 * @param {string} targetPath
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function writeFileAtomic(targetPath, content) {
  const tmpPath = `${targetPath}.tmp.${process.pid}.${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, targetPath);
  } catch (err) {
    try { await unlink(tmpPath); } catch {}
    throw err;
  }
}

/**
 * JSONL ファイルを読んで配列を返す。
 * - 存在しない場合は [] を返す
 * - 空ファイル・末尾改行を許容
 * - 不正な JSON 行はスキップして stderr に警告を出す
 *
 * @param {string} findingsPath
 * @returns {Promise<object[]>}
 */
export async function readFindings(findingsPath) {
  if (!(await fileExists(findingsPath))) {
    return [];
  }

  const content = await readFile(findingsPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  const results = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      results.push(JSON.parse(lines[i]));
    } catch {
      process.stderr.write(
        `Warning: failed to parse JSONL line ${i + 1} in ${findingsPath}, skipping\n`,
      );
    }
  }

  return results;
}

/**
 * エントリを JSONL ファイルに1行追記する。
 * ファイルが存在しない場合は新規作成される。
 *
 * @param {string} findingsPath
 * @param {object} finding
 * @returns {Promise<void>}
 */
export async function appendFinding(findingsPath, finding) {
  const line = JSON.stringify(finding) + "\n";
  await appendFile(findingsPath, line, "utf-8");
}

/**
 * 配列全体を JSONL でアトミックに書き出す。
 * tmpfile に書いてから rename で置換する。
 *
 * @param {string} findingsPath
 * @param {object[]} findings
 * @returns {Promise<void>}
 */
export async function writeFindingsAtomic(findingsPath, findings) {
  const lines = findings.map((f) => JSON.stringify(f));
  const content = lines.length > 0 ? lines.join("\n") + "\n" : "";
  await writeFileAtomic(findingsPath, content);
}

/**
 * 次の rf-NNN ID を採番する。
 * 既存の最大値 + 1 を3桁ゼロパディングで返す。
 * 空の場合は rf-001 を返す。
 *
 * @param {string} findingsPath
 * @returns {Promise<string>}
 */
export async function nextFindingId(findingsPath) {
  const findings = await readFindings(findingsPath);
  const maxNum = computeMaxIdNum(findings, "id", "rf");
  return `rf-${String(maxNum + 1).padStart(3, "0")}`;
}

/**
 * 次の c-NNN ID を採番する。
 * 既存の最大値 + 1 を3桁ゼロパディングで返す。
 * null/undefined の cluster_id はスキップする。
 * 空の場合は c-001 を返す。
 *
 * @param {string} findingsPath
 * @returns {Promise<string>}
 */
export async function nextClusterId(findingsPath) {
  const findings = await readFindings(findingsPath);
  const maxNum = computeMaxIdNum(findings, "cluster_id", "c");
  return `c-${String(maxNum + 1).padStart(3, "0")}`;
}

// --- Task-2 実装 ---

/**
 * cluster_id 別にグループ化し、エントリ数が2以上のクラスタを返す。
 * cluster_id が null/undefined のエントリは除外する。
 *
 * @param {string} findingsPath
 * @returns {Promise<{cluster_id: string, entries: object[]}[]>}
 */
export async function findPromotable(findingsPath) {
  const findings = await readFindings(findingsPath);

  const groups = new Map();
  for (const entry of findings) {
    if (entry.cluster_id == null) continue;
    if (!groups.has(entry.cluster_id)) {
      groups.set(entry.cluster_id, []);
    }
    groups.get(entry.cluster_id).push(entry);
  }

  const result = [];
  for (const [cluster_id, entries] of groups) {
    if (entries.length >= 2) {
      result.push({ cluster_id, entries });
    }
  }

  return result;
}

/**
 * 各クラスタの最初のエントリ（最古）を代表として返す。
 * cluster_id が null/undefined のエントリは除外する。
 * 返り値には cluster_id, category, pattern, suggestion のみ含む。
 *
 * @param {string} findingsPath
 * @returns {Promise<{cluster_id: string, category: string, pattern: string, suggestion: string}[]>}
 */
export async function getClusterRepresentatives(findingsPath) {
  const findings = await readFindings(findingsPath);

  const firstByCluster = new Map();
  for (const entry of findings) {
    if (entry.cluster_id == null) continue;
    if (!firstByCluster.has(entry.cluster_id)) {
      firstByCluster.set(entry.cluster_id, entry);
    }
  }

  const result = [];
  for (const [cluster_id, entry] of firstByCluster) {
    result.push({
      cluster_id,
      category: entry.category,
      pattern: entry.pattern,
      suggestion: entry.suggestion,
    });
  }

  return result;
}

/**
 * サイドカー state ファイルのパスを返す。
 * conventions.md と同じディレクトリの conventions-state.jsonl。
 *
 * @param {string} conventionsPath
 * @returns {string}
 */
function conventionsStatePath(conventionsPath) {
  return join(dirname(conventionsPath), "conventions-state.jsonl");
}

/**
 * サイドカー state ファイルを読んで配列を返す。
 * ファイルが存在しない場合は空配列を返す。
 *
 * @param {string} conventionsPath
 * @returns {Promise<Array<{cluster_id: string, category: string, pattern: string, suggestion: string, size: number}>>}
 */
async function readConventionsState(conventionsPath) {
  const statePath = conventionsStatePath(conventionsPath);
  if (!(await fileExists(statePath))) {
    return [];
  }
  const content = await readFile(statePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l));
}

/**
 * サイドカー state ファイルをアトミックに書き込む。
 *
 * @param {string} conventionsPath
 * @param {Array<{cluster_id: string, category: string, pattern: string, suggestion: string, size: number}>} entries
 * @returns {Promise<void>}
 */
async function writeConventionsState(conventionsPath, entries) {
  const statePath = conventionsStatePath(conventionsPath);
  const content = entries.length > 0
    ? entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
    : "";
  await writeFileAtomic(statePath, content);
}

/**
 * cluster_id を指定してクラスタを昇格する（原子的3段階）。
 *
 * 1. archive に append（冪等: id で重複チェック）
 * 2. conventions.md AUTO セクション更新（冪等: cluster_id で重複チェック）
 * 3. findings.jsonl から削除
 *
 * 存在しない cluster_id の場合は no-op で 0 を返す。
 *
 * @param {string} findingsPath
 * @param {string} archivePath
 * @param {string} conventionsPath
 * @param {string} clusterId
 * @returns {Promise<number>} 削除したエントリ数（no-op の場合は 0）
 */
export async function promoteCluster(findingsPath, archivePath, conventionsPath, clusterId) {
  // 対象クラスタのエントリを取得
  const allFindings = await readFindings(findingsPath);
  const targetEntries = allFindings.filter((e) => e.cluster_id === clusterId);

  // 存在しない cluster_id の場合は no-op
  if (targetEntries.length === 0) {
    return 0;
  }

  // ステップ1: archive に append（冪等: id で重複チェック）
  const existingArchive = await readFindings(archivePath);
  const existingArchiveIds = new Set(existingArchive.map((e) => e.id).filter(Boolean));

  for (const entry of targetEntries) {
    const isDuplicate = entry.id != null
      ? existingArchiveIds.has(entry.id)
      : existingArchive.some(
          (a) => a.category === entry.category && a.pattern === entry.pattern && a.file === entry.file,
        );

    if (!isDuplicate) {
      await appendFinding(archivePath, entry);
      if (entry.id != null) {
        existingArchiveIds.add(entry.id);
      }
    }
  }

  // ステップ2: conventions.md AUTO セクション更新（サイドカー state が SSOT）
  const existingStateEntries = await readConventionsState(conventionsPath);

  // 対象クラスタが既に state に存在するかチェック（冪等: cluster_id で重複チェック）
  const alreadyInState = existingStateEntries.some((e) => e.cluster_id === clusterId);

  // 代表エントリ（最初のエントリ）から autoEntry を構築
  const representative = targetEntries[0];
  const newAutoEntry = {
    cluster_id: clusterId,
    category: representative.category,
    pattern: representative.pattern,
    suggestion: representative.suggestion,
    size: targetEntries.length,
  };

  // state のエントリを更新（存在すれば置き換え、なければ追加）
  const updatedStateEntries = alreadyInState
    ? existingStateEntries.map((e) => (e.cluster_id === clusterId ? newAutoEntry : e))
    : [...existingStateEntries, newAutoEntry];

  // サイドカー state を更新してから Markdown を再生成
  await writeConventionsState(conventionsPath, updatedStateEntries);
  await rebuildConventions(conventionsPath, updatedStateEntries);

  // ステップ3: findings.jsonl から削除
  const remainingFindings = allFindings.filter((e) => e.cluster_id !== clusterId);
  await writeFindingsAtomic(findingsPath, remainingFindings);

  return targetEntries.length;
}

/**
 * conventions.md を MANUAL/AUTO セクションに分けて再構築する。
 *
 * - MANUAL セクション（<!-- MANUAL:START --> と <!-- MANUAL:END --> の間）をバイト一致で保持
 * - AUTO セクション（<!-- AUTO:START --> と <!-- AUTO:END --> の間）を autoEntries から再生成
 * - マーカーが存在しない場合は自動マイグレーション: 既存全文を MANUAL に入れ AUTO を末尾に追加
 * - 書き込みは atomic (tmpfile → rename)
 *
 * @param {string} conventionsPath
 * @param {Array<{cluster_id: string, category: string, pattern: string, suggestion: string, size: number}>} autoEntries
 * @returns {Promise<void>}
 */
export async function rebuildConventions(conventionsPath, autoEntries) {

  const existingContent = (await fileExists(conventionsPath))
    ? await readFile(conventionsPath, "utf-8")
    : "";

  const hasManualMarkers =
    existingContent.includes(MANUAL_START) && existingContent.includes(MANUAL_END);

  let manualContent = "";

  if (hasManualMarkers) {
    // MANUAL セクションの内容をバイト一致で抽出
    const manualStartIdx = existingContent.indexOf(MANUAL_START) + MANUAL_START.length;
    const manualEndIdx = existingContent.indexOf(MANUAL_END);
    manualContent = existingContent.slice(manualStartIdx, manualEndIdx);
  } else {
    // マーカーが存在しない場合は既存全文を MANUAL セクションに移行
    manualContent = existingContent;
  }

  // AUTO セクションのコンテンツを生成
  const autoSectionContent = buildAutoSection(autoEntries);

  // ファイル全体を再構築
  const newContent =
    `${MANUAL_START}${manualContent}${MANUAL_END}\n` +
    `\n` +
    `${AUTO_START}\n${autoSectionContent}${AUTO_END}\n`;

  await writeFileAtomic(conventionsPath, newContent);
}

/**
 * autoEntries から AUTO セクションの内容文字列を生成する（カテゴリ別グルーピング）。
 *
 * 出力フォーマット:
 * ## <category>
 * - <pattern> / 対策: <suggestion>
 *
 * 同じ category のエントリは同一セクションにまとめる。
 * cluster_id は Markdown には出力しない（サイドカー state が SSOT）。
 *
 * @param {Array<{cluster_id: string, category: string, pattern: string, suggestion: string, size: number}>} autoEntries
 * @returns {string}
 */
function buildAutoSection(autoEntries) {
  if (autoEntries.length === 0) {
    return "";
  }

  // category 別にグルーピング（挿入順を保持）
  const categoryMap = new Map();
  for (const entry of autoEntries) {
    if (!categoryMap.has(entry.category)) {
      categoryMap.set(entry.category, []);
    }
    categoryMap.get(entry.category).push(entry);
  }

  const lines = [];
  for (const [category, entries] of categoryMap) {
    lines.push(`## ${category}`);
    for (const entry of entries) {
      lines.push(`- ${entry.pattern} / 対策: ${entry.suggestion}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- CLI エントリポイント ---

const DEFAULT_FINDINGS = ".claude/harness/review-memory/review-findings.jsonl";
const DEFAULT_ARCHIVE = ".claude/harness/review-memory/review-findings-archive.jsonl";
const DEFAULT_CONVENTIONS = ".claude/harness/review-memory/review-conventions.md";

/**
 * stdin を全て読み込んで文字列で返す。
 *
 * @returns {Promise<string>}
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

/**
 * finding エントリのバリデーション。
 * 不正な場合は Error を throw する。
 *
 * @param {object} entry
 */
function validateFinding(entry) {
  // 必須フィールドチェック
  const required = ["date", "project", "reviewer", "severity", "category", "pattern", "suggestion", "file"];
  for (const field of required) {
    if (!(field in entry) || typeof entry[field] !== "string" || entry[field].length === 0) {
      throw new Error(`Missing or invalid required field: ${field}`);
    }
  }

  // 長さ上限（プロンプトインジェクション対策 + ReDoS 対策）
  const MAX_LENGTH = 500;
  const LONG_FIELDS = ["pattern", "suggestion"];
  for (const field of LONG_FIELDS) {
    if (entry[field].length > MAX_LENGTH) {
      throw new Error(`Field ${field} exceeds max length of ${MAX_LENGTH} characters`);
    }
  }

  // 制御文字の禁止（改行・タブ含む、スペースは許可）
  const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b-\x1f\x7f]/;
  const SANITIZE_FIELDS = ["category", "pattern", "suggestion", "file"];
  for (const field of SANITIZE_FIELDS) {
    if (CONTROL_CHAR_PATTERN.test(entry[field])) {
      throw new Error(`Field ${field} contains control characters`);
    }
  }

  // category の allowlist（英数字・ハイフン・アンダースコア）
  if (!/^[a-zA-Z0-9_-]+$/.test(entry.category)) {
    throw new Error(`category must match /^[a-zA-Z0-9_-]+$/, got: ${entry.category}`);
  }

  // file の allowlist（パストラバーサル対策）
  // 使用可能文字を制限し、連続ドット（..）を禁止
  if (!/^[a-zA-Z0-9._/\-]+$/.test(entry.file) || entry.file.includes("..")) {
    throw new Error(`file must match /^[a-zA-Z0-9._\\/\\-]+$/ and must not contain '..' got: ${entry.file}`);
  }

  // マーカー文字列の禁止（conventions.md 汚染対策）
  const FORBIDDEN_MARKERS = [MANUAL_START, MANUAL_END, AUTO_START, AUTO_END];
  for (const field of LONG_FIELDS) {
    for (const marker of FORBIDDEN_MARKERS) {
      if (entry[field].includes(marker)) {
        throw new Error(`Field ${field} contains forbidden marker: ${marker}`);
      }
    }
  }

  // reviewer / severity / cluster_id チェック
  const validReviewers = ["spec", "quality", "security"];
  if (!validReviewers.includes(entry.reviewer)) {
    throw new Error(`Invalid reviewer: ${entry.reviewer}. Must be one of: ${validReviewers.join(", ")}`);
  }
  const validSeverities = ["MUST", "SHOULD", "CONSIDER"];
  if (!validSeverities.includes(entry.severity)) {
    throw new Error(`Invalid severity: ${entry.severity}. Must be one of: ${validSeverities.join(", ")}`);
  }
  if ("cluster_id" in entry && entry.cluster_id !== null && typeof entry.cluster_id !== "string") {
    throw new Error(`cluster_id must be null or string, got: ${typeof entry.cluster_id}`);
  }
  if (entry.cluster_id && !/^c-\d+$/.test(entry.cluster_id)) {
    throw new Error(`cluster_id must match /^c-\\d+$/, got: ${entry.cluster_id}`);
  }
}

const USAGE = `Usage:
  review-memory.mjs add [--findings <path>] [--new-cluster | --cluster <id>]
  review-memory.mjs representatives [--findings <path>]
  review-memory.mjs promote <cluster_id> [--findings <path>] [--archive <path>] [--conventions <path>]
  review-memory.mjs promote-all [--findings <path>] [--archive <path>] [--conventions <path>]
`;

async function main() {
  const argv = process.argv.slice(2);
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case "add": {
      const { values } = parseArgs({
        args: rest,
        options: {
          findings: { type: "string" },
          "new-cluster": { type: "boolean" },
          cluster: { type: "string" },
        },
        allowPositionals: true,
        strict: false,
      });

      const findingsPath = values.findings ?? DEFAULT_FINDINGS;
      const useNewCluster = values["new-cluster"] ?? false;
      const useCluster = values.cluster ?? null;

      if (useNewCluster && useCluster) {
        process.stderr.write("Cannot specify both --new-cluster and --cluster\n");
        process.exit(1);
      }

      const raw = await readStdin();
      if (!raw.trim()) {
        process.stderr.write("invalid JSON: stdin is empty\n");
        process.exit(1);
      }

      let entry;
      try {
        entry = JSON.parse(raw);
      } catch {
        process.stderr.write("invalid JSON: failed to parse stdin\n");
        process.exit(1);
      }

      try {
        validateFinding(entry);
      } catch (err) {
        process.stderr.write(err.message + "\n");
        process.exit(1);
      }

      if (!entry.id) {
        entry.id = await nextFindingId(findingsPath);
      }

      if (useNewCluster) {
        entry.cluster_id = await nextClusterId(findingsPath);
      } else if (useCluster) {
        entry.cluster_id = useCluster;
      }

      await appendFinding(findingsPath, entry);

      const output = { id: entry.id };
      if (useNewCluster || useCluster) {
        output.cluster_id = entry.cluster_id;
      }
      process.stdout.write(JSON.stringify(output) + "\n");
      break;
    }

    case "representatives": {
      const { values } = parseArgs({
        args: rest,
        options: {
          findings: { type: "string" },
        },
        allowPositionals: true,
        strict: false,
      });
      const findingsPath = values.findings ?? DEFAULT_FINDINGS;

      const representatives = await getClusterRepresentatives(findingsPath);
      process.stdout.write(JSON.stringify(representatives) + "\n");
      break;
    }

    case "promote": {
      const { values, positionals } = parseArgs({
        args: rest,
        options: {
          findings: { type: "string" },
          archive: { type: "string" },
          conventions: { type: "string" },
        },
        allowPositionals: true,
        strict: false,
      });

      const clusterId = positionals[0];

      if (!clusterId) {
        process.stderr.write(`Missing cluster_id argument\n\n${USAGE}`);
        process.exit(1);
      }

      const findingsPath = values.findings ?? DEFAULT_FINDINGS;
      const archivePath = values.archive ?? DEFAULT_ARCHIVE;
      const conventionsPath = values.conventions ?? DEFAULT_CONVENTIONS;

      const count = await promoteCluster(findingsPath, archivePath, conventionsPath, clusterId);

      if (count === 0) {
        process.stdout.write(JSON.stringify({ promoted: clusterId, noop: true }) + "\n");
      } else {
        process.stdout.write(JSON.stringify({ promoted: clusterId }) + "\n");
      }
      break;
    }

    case "promote-all": {
      const { values } = parseArgs({
        args: rest,
        options: {
          findings: { type: "string" },
          archive: { type: "string" },
          conventions: { type: "string" },
        },
        allowPositionals: true,
        strict: false,
      });

      const findingsPath = values.findings ?? DEFAULT_FINDINGS;
      const archivePath = values.archive ?? DEFAULT_ARCHIVE;
      const conventionsPath = values.conventions ?? DEFAULT_CONVENTIONS;

      const promotable = await findPromotable(findingsPath);
      const promoted = [];

      for (const { cluster_id } of promotable) {
        await promoteCluster(findingsPath, archivePath, conventionsPath, cluster_id);
        promoted.push(cluster_id);
      }

      process.stdout.write(JSON.stringify({ promoted }) + "\n");
      break;
    }

    default: {
      process.stderr.write(`Unknown subcommand: ${subcommand ?? "(none)"}\n\n${USAGE}`);
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(err.message + "\n");
    process.exit(1);
  });
}
