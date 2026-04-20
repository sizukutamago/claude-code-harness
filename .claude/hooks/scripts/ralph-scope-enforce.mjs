#!/usr/bin/env node

/**
 * ralph-scope-enforce.mjs — PreToolUse フック
 *
 * Autonomous mode 時に scope.allowed_paths / forbidden_paths を enforce する。
 * - exit 0: 許可
 * - exit 2: ブロック（scope 違反）
 */

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ファイルパスを realpath で正規化する。
 * ファイルが存在しない場合（新規作成）は、存在する最も近い祖先ディレクトリを
 * realpath 解決してから残りのパスを結合する。
 *
 * @param {string} filePath - 絶対または相対ファイルパス
 * @param {string} cwd - プロジェクトルート（相対パスの基準）
 * @returns {string} realpath 正規化されたファイルパス
 */
function normalizeFilePath(filePath, cwd) {
  if (!filePath) return "";
  const abs = resolve(cwd, filePath);
  if (existsSync(abs)) {
    return realpathSync(abs);
  }
  // 存在しない場合は親ディレクトリを辿る
  const parts = abs.split("/");
  for (let i = parts.length - 1; i > 0; i--) {
    const ancestor = parts.slice(0, i).join("/") || "/";
    if (existsSync(ancestor)) {
      const realAncestor = realpathSync(ancestor);
      return realAncestor + "/" + parts.slice(i).join("/");
    }
  }
  return abs;
}

/**
 * glob パターンをファイルパスに対してマッチする。
 * パターンは .ralph/config.json の scope エントリ（相対パス）。
 * ファイルパスは絶対パス。
 *
 * サポートするパターン:
 *   dir/**   → dir 以下の全ファイル
 *   dir/*    → dir 直下のファイル（サブディレクトリ除く）
 *   file.ext → 特定ファイル
 *
 * @param {string} pattern - 相対 glob パターン（例: "src/**"）
 * @param {string} filePath - 絶対ファイルパス
 * @param {string} cwd - プロジェクトルート（パターンの解決基準）
 * @returns {boolean}
 */
function matchGlobPattern(pattern, filePath, cwd) {
  if (pattern.endsWith("/**")) {
    const prefix = resolve(cwd, pattern.slice(0, -3));
    return filePath === prefix || filePath.startsWith(prefix + "/");
  }
  if (pattern.endsWith("/*")) {
    const dir = resolve(cwd, pattern.slice(0, -2));
    const parent = filePath.substring(0, filePath.lastIndexOf("/"));
    return parent === dir;
  }
  return filePath === resolve(cwd, pattern);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(readFileSync(0, "utf-8"));

    const cwd = realpathSync(process.cwd());
    const configPath = resolve(cwd, ".ralph/config.json");

    if (!existsSync(configPath)) {
      process.exit(0);
    }

    let config;
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error("[ralph-scope-enforce] .ralph/config.json の JSON パースに失敗しました");
      process.exit(2);
    }

    if (config.mode !== "autonomous") {
      process.exit(0);
    }

    const rawFilePath = input?.tool_input?.file_path || "";
    // symlink を解決して cwd と同じ基準で比較する。
    // ファイルが存在しない（新規作成）場合は親ディレクトリを realpath 解決してファイル名を結合する。
    const filePath = normalizeFilePath(rawFilePath, cwd);
    const scope = config.scope || {};
    const allowedPaths = scope.allowed_paths || [];
    const forbiddenPaths = scope.forbidden_paths || [];

    if (forbiddenPaths.some((p) => matchGlobPattern(p, filePath, cwd))) {
      console.error(`[ralph-scope-enforce] forbidden_paths に一致するため書き込みをブロックします: ${filePath}`);
      process.exit(2);
    }

    if (allowedPaths.length > 0 && !allowedPaths.some((p) => matchGlobPattern(p, filePath, cwd))) {
      console.error(`[ralph-scope-enforce] allowed_paths に含まれないため書き込みをブロックします: ${filePath}`);
      process.exit(2);
    }

    process.exit(0);
  } catch (err) {
    console.error(`[ralph-scope-enforce] stdin パースエラー: ${err.message}`);
    process.exit(0);
  }
}
