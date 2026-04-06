/**
 * 簡易 concurrency limiter
 *
 * npm パッケージ不要の Promise ベース実装。
 * mapWithConcurrency(items, fn, limit) で同時実行数を制限する。
 */

/**
 * items の各要素に fn を適用し、同時実行数を limit に制限する。
 * 結果は入力順で返る。
 *
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @param {number} limit - 最大同時実行数
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, fn, limit) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
