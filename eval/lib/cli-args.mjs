/**
 * cli-args.mjs — CLI 引数パーサ
 *
 * run-eval.mjs / run-ablation.mjs で重複していた
 * --concurrency オプション解析を共通化。
 */

/**
 * argv から --concurrency オプションとポジション引数を解析して返す。
 *
 * @param {string[]} argv - process.argv.slice(2) 相当
 * @param {number} defaultConcurrency
 * @returns {{ concurrency: number, positional: string[] }}
 */
export function parseCliArgs(argv, defaultConcurrency) {
  const args = [...argv];

  let concurrency = defaultConcurrency;
  const concurrencyIdx = args.indexOf("--concurrency");
  if (concurrencyIdx !== -1) {
    concurrency = parseInt(args[concurrencyIdx + 1], 10) || defaultConcurrency;
    args.splice(concurrencyIdx, 2);
  }

  return { concurrency, positional: args };
}
