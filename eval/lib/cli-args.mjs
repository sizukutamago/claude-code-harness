/**
 * cli-args.mjs — CLI 引数パーサ
 *
 * run-eval.mjs / run-ablation.mjs で重複していた
 * --concurrency オプション解析を共通化。
 */

/**
 * 文字列を正の整数にパースする。不正値なら TypeError を投げる。
 *
 * @param {string} raw - パース対象の文字列（undefined 不可）
 * @param {string} name - オプション名（エラーメッセージ用）
 * @returns {number}
 */
function parsePositiveInt(raw, name) {
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TypeError(`${name} must be a positive integer, got: ${raw}`);
  }
  return parsed;
}

/**
 * args 配列から名前付きオプション（例: --k）を取り出してパース・削除する。
 *
 * @param {string[]} args - 処理対象配列（破壊的変更あり）
 * @param {string} name - フラグ名（例: "--k"）
 * @param {number} defaultValue - フラグ未指定時のデフォルト値
 * @returns {number}
 * @throws {TypeError} フラグ指定あり・値なし or 値が不正の場合
 */
function extractNamedOption(args, name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;

  const raw = args[idx + 1];
  if (raw === undefined || raw.startsWith("--")) {
    throw new TypeError(`${name} requires a value`);
  }

  args.splice(idx, 2);
  return parsePositiveInt(raw, name);
}

/**
 * argv から --concurrency / --k オプションとポジション引数を解析して返す。
 *
 * @param {string[]} argv - process.argv.slice(2) 相当
 * @param {number} defaultConcurrency
 * @param {number} [defaultK=3]
 * @returns {{ concurrency: number, k: number, positional: string[] }}
 * @throws {TypeError} --k / --concurrency に値なし・NaN・0・負数が渡された場合
 */
export function parseCliArgs(argv, defaultConcurrency, defaultK = 3) {
  const args = [...argv];

  const concurrency = extractNamedOption(args, "--concurrency", defaultConcurrency);
  const k = extractNamedOption(args, "--k", defaultK);

  return { concurrency, k, positional: args };
}
