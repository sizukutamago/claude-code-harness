/**
 * 日付文字列をパースして Date オブジェクトを返す。
 * 不正な入力には null を返す。
 *
 * 既知のバグ: ハイフン区切り以外の日付（スラッシュ等）で null を返すことがある。
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 数値の配列の合計を返す。
 * 既知のバグ: 負の値を Math.abs で絶対値にしてしまう。
 */
export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + Math.abs(item.amount), 0);
}
