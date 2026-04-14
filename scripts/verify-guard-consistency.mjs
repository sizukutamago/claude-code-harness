#!/usr/bin/env node

/**
 * verify-guard-consistency.mjs
 *
 * スキル指示と coordinator-write-guard.mjs の WHITELIST の整合性を検証する。
 *
 * 動作:
 * 1. .claude/hooks/scripts/coordinator-write-guard.mjs から WHITELIST を import
 * 2. .claude/skills/**\/SKILL.md と .claude/agents/*.md を全て読む
 * 3. キーワード検索で「メインセッションが〜を書く」系の指示を含む行を抽出
 * 4. 既知のパス候補を各行から抽出
 * 5. 抽出したパスが WHITELIST のいずれかの正規表現にマッチするか確認
 * 6. マッチしないパスがあれば stderr に出力 + exit 1
 *
 * キーワード（これを含む行のみ対象）:
 *   - メインセッションが
 *   - coordinator が
 *   - メインセッションで直接書く
 *   - メインセッションが直接書く
 *
 * 既知パス候補:
 *   requirements/, docs/design/, docs/decisions/, docs/plans/,
 *   docs/guides/, .claude/harness/, HANDOVER.md, CLAUDE.md
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

// キーワード: これを含む行のみ検査対象
const TRIGGER_KEYWORDS = [
  "メインセッションが",
  "coordinator が",
  "メインセッションで直接書く",
  "メインセッションが直接書く",
];

// 既知パス候補: 行から抽出するパスパターン
const KNOWN_PATH_CANDIDATES = [
  "requirements/",
  "docs/design/",
  "docs/decisions/",
  "docs/plans/",
  "docs/guides/",
  ".claude/harness/",
  "HANDOVER.md",
  "CLAUDE.md",
];

/**
 * ファイルパスを再帰的に列挙する（*.md のみ）。
 *
 * @param {string} dir - 検索対象ディレクトリ
 * @returns {Promise<string[]>} - ファイルパスの配列
 */
async function findMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];

  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMarkdownFiles(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * テキスト内のキーワード含む行から既知パス候補を抽出する。
 *
 * @param {string} text - ファイル内容
 * @returns {string[]} - 抽出されたパス候補の配列
 */
function extractPathsFromText(text) {
  const lines = text.split("\n");
  const foundPaths = new Set();

  for (const line of lines) {
    // キーワードを含む行のみ対象
    const hasTrigger = TRIGGER_KEYWORDS.some((kw) => line.includes(kw));
    if (!hasTrigger) continue;

    // 行から既知パス候補を検索
    for (const candidate of KNOWN_PATH_CANDIDATES) {
      if (line.includes(candidate)) {
        foundPaths.add(candidate);
      }
    }
  }

  return [...foundPaths];
}

/**
 * パスが WHITELIST のいずれかの正規表現にマッチするかを確認する。
 * WHITELIST のエントリがパス文字列そのものを含んでいれば OK とする（前方一致）。
 *
 * @param {string} path - チェック対象のパス
 * @param {RegExp[]} whitelist - WHITELIST の正規表現配列
 * @returns {boolean}
 */
function isPathCoveredByWhitelist(path, whitelist) {
  // 正規表現として直接テスト（例: /\/requirements\// が requirements/REQ-001/ にマッチするか）
  // テストには絶対パス的な文字列を作って試す
  const testString = `/${path}`;
  return whitelist.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(testString);
    }
    return false;
  });
}

async function main() {
  const projectRoot = process.cwd();
  const guardPath = resolve(
    projectRoot,
    ".claude/hooks/scripts/coordinator-write-guard.mjs",
  );

  // WHITELIST を import
  let whitelist;
  try {
    const guardModule = await import(pathToFileURL(guardPath).href);
    whitelist = guardModule.WHITELIST;

    if (!Array.isArray(whitelist)) {
      process.stderr.write(
        `[verify-guard-consistency] WHITELIST が配列ではありません: ${typeof whitelist}\n`,
      );
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(
      `[verify-guard-consistency] coordinator-write-guard.mjs の読み込みに失敗しました: ${err.message}\n`,
    );
    process.exit(1);
  }

  // スキルとエージェント定義を収集
  const skillsDir = resolve(projectRoot, ".claude/skills");
  const agentsDir = resolve(projectRoot, ".claude/agents");

  const [skillFiles, agentFiles] = await Promise.all([
    findMarkdownFiles(skillsDir),
    findMarkdownFiles(agentsDir),
  ]);

  const allFiles = [...skillFiles, ...agentFiles];

  // 各ファイルからパスを抽出して WHITELIST と照合
  const violations = [];
  let totalChecked = 0;

  for (const filePath of allFiles) {
    const content = await readFile(filePath, "utf-8");
    const extractedPaths = extractPathsFromText(content);

    for (const path of extractedPaths) {
      totalChecked++;
      if (!isPathCoveredByWhitelist(path, whitelist)) {
        // プロジェクトルートからの相対パス
        const relativeFilePath = filePath.replace(projectRoot + "/", "");
        violations.push({ filePath: relativeFilePath, path });
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write("✗ 以下のパスが WHITELIST にありません:\n");
    for (const { filePath, path } of violations) {
      process.stderr.write(`  - ${filePath} で '${path}' を書く指示があるが WHITELIST 未登録\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `✓ すべての指示先パスが WHITELIST に含まれています (${totalChecked} 件チェック)\n`,
  );
  process.exit(0);
}

main();
