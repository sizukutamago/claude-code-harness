/**
 * stability.mjs — pass^k 安定性指標の純関数群
 *
 * LLM の確率的振る舞いに対する flakiness を数値化する。
 * 同一ケースを k 回実行して全 PASS する確率（pass^k）を計算する。
 */

/**
 * boolean[] の PASS 率（0.0〜1.0）を計算する。
 *
 * @param {boolean[]} results - 各実行の pass/fail 結果
 * @returns {number} pass^k（0.0〜1.0）
 */
export function computePassK(results) {
  if (results.length === 0) return 0.0;
  const passCount = results.filter((r) => r === true).length;
  return passCount / results.length;
}

/**
 * pass_count と k から安定性を分類する。
 *
 * @param {number} passCount - PASS した回数
 * @param {number} k - 総実行回数
 * @param {number} infraErrorCount - インフラエラーの件数（0 以上）
 * @returns {"stable_pass" | "stable_fail" | "flaky" | "infra_error"}
 */
export function classifyStability(passCount, k, infraErrorCount = 0) {
  if (infraErrorCount > 0) return "infra_error";
  if (passCount === k) return "stable_pass";
  if (passCount === 0) return "stable_fail";
  return "flaky";
}

/**
 * ケースごとの実行結果を集約して per_case と summary を返す。
 *
 * @param {Map<string, (boolean | null)[]>} runsPerCase - case_id → 各実行の pass/fail/null(infra_error)
 * @param {number} k - 総実行回数（ケースの分類に使用）
 * @param {number} totalCostUsd - 全実行の合計コスト（呼び出し側から渡す）
 * @returns {{ per_case: Array, summary: object }}
 */
export function aggregateStabilityResults(runsPerCase, k, totalCostUsd) {
  const perCase = [];
  let stablePass = 0;
  let stableFail = 0;
  let flaky = 0;
  let infraError = 0;

  for (const [caseId, results] of runsPerCase) {
    const passCount = results.filter((r) => r === true).length;
    const infraErrorCount = results.filter((r) => r === null).length;
    const passK = computePassK(results);
    const classification = classifyStability(passCount, k, infraErrorCount);

    perCase.push({
      case_id: caseId,
      pass_count: passCount,
      infra_error_count: infraErrorCount,
      pass_k: passK,
      classification,
    });

    if (classification === "stable_pass") stablePass++;
    else if (classification === "stable_fail") stableFail++;
    else if (classification === "flaky") flaky++;
    else infraError++;
  }

  return {
    per_case: perCase,
    summary: {
      total_cases: runsPerCase.size,
      stable_pass: stablePass,
      stable_fail: stableFail,
      flaky,
      infra_error: infraError,
      total_cost_usd: totalCostUsd,
    },
  };
}
