/**
 * workdir.mjs — eval 用の一時作業ディレクトリ管理
 *
 * run-eval.mjs / run-ablation.mjs で重複していた
 * prepareWorkdir / cleanupWorkdir を共通化。
 */

import { mkdirSync, cpSync, rmSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const EVAL_DIR = resolve(import.meta.dirname, "..");
const FIXTURES_DIR = resolve(EVAL_DIR, "fixtures");

/**
 * 一時作業ディレクトリを作成し、fixture をコピーして返す。
 *
 * @param {string|null} fixtureName - ケース固有 fixture 名（null でケース共通 base のみ）
 * @param {object} options
 * @param {boolean} options.withRules - false のとき .claude/rules/ を削除し CLAUDE.md を空にする
 * @param {string} options.prefix - mkdtemp のプレフィックス（デフォルト: "run-"）
 */
export function prepareWorkdir(fixtureName, { withRules = true, prefix = "run-" } = {}) {
  const workdirsRoot = resolve(EVAL_DIR, "workdirs");
  mkdirSync(workdirsRoot, { recursive: true });
  const workdir = mkdtempSync(join(workdirsRoot, prefix));

  // base fixture を先にコピー（CLAUDE.md, ルール, スキル等）
  const baseDir = resolve(FIXTURES_DIR, "base");
  try {
    cpSync(baseDir, workdir, { recursive: true });
  } catch {
    // base がなければスキップ
  }

  // ハーネスなしモード: CLAUDE.md を空にし、.claude/rules/ を削除
  if (!withRules) {
    const rulesDir = join(workdir, ".claude", "rules");
    try { rmSync(rulesDir, { recursive: true, force: true }); } catch {}
    const claudeMd = join(workdir, "CLAUDE.md");
    try { writeFileSync(claudeMd, "# Project\n"); } catch {}
  }

  // ケース固有の fixture を上書きコピー
  if (fixtureName) {
    const fixtureDir = resolve(FIXTURES_DIR, fixtureName);
    cpSync(fixtureDir, workdir, { recursive: true });
  }

  return workdir;
}

/**
 * 一時作業ディレクトリを削除する。失敗は無視する。
 */
export function cleanupWorkdir(workdir) {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // cleanup failure は無視
  }
}
