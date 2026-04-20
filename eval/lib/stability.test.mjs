/**
 * stability.test.mjs
 *
 * TDD テスト: eval/lib/stability.mjs の純関数検証
 *
 * AC-1: computePassK / classifyStability / aggregateStabilityResults の動作検証
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePassK,
  classifyStability,
  aggregateStabilityResults,
} from "./stability.mjs";

// --- computePassK ---

describe("computePassK: true/false の配列からパス率を計算する", () => {
  it("全 PASS の場合は 1.0 を返す", () => {
    assert.strictEqual(computePassK([true, true, true]), 1.0);
  });

  it("2/3 PASS の場合は約 0.667 を返す", () => {
    const result = computePassK([true, false, true]);
    assert.ok(
      Math.abs(result - 2 / 3) < 1e-10,
      `Expected ~0.667, got ${result}`,
    );
  });

  it("全 FAIL の場合は 0.0 を返す", () => {
    assert.strictEqual(computePassK([false, false, false]), 0.0);
  });

  it("k=1 で PASS の場合は 1.0 を返す", () => {
    assert.strictEqual(computePassK([true]), 1.0);
  });

  it("k=1 で FAIL の場合は 0.0 を返す", () => {
    assert.strictEqual(computePassK([false]), 0.0);
  });

  it("空配列の場合は 0.0 を返す", () => {
    assert.strictEqual(computePassK([]), 0.0);
  });
});

// --- classifyStability ---

describe("classifyStability: pass_count と k から安定性を分類する", () => {
  it("passCount === k の場合は 'stable_pass' を返す", () => {
    assert.strictEqual(classifyStability(3, 3), "stable_pass");
  });

  it("passCount === 0 の場合は 'stable_fail' を返す", () => {
    assert.strictEqual(classifyStability(0, 3), "stable_fail");
  });

  it("passCount が 0 より大きく k より小さい場合は 'flaky' を返す (2/3)", () => {
    assert.strictEqual(classifyStability(2, 3), "flaky");
  });

  it("passCount が 0 より大きく k より小さい場合は 'flaky' を返す (1/3)", () => {
    assert.strictEqual(classifyStability(1, 3), "flaky");
  });

  it("k=1 で passCount=1 なら 'stable_pass' を返す", () => {
    assert.strictEqual(classifyStability(1, 1), "stable_pass");
  });

  it("k=1 で passCount=0 なら 'stable_fail' を返す", () => {
    assert.strictEqual(classifyStability(0, 1), "stable_fail");
  });

  // AC-infra_error: infraErrorCount が 1 以上のとき 'infra_error' を返す
  it("infraErrorCount=1 の場合は 'infra_error' を返す (passCount=0)", () => {
    assert.strictEqual(classifyStability(0, 3, 1), "infra_error");
  });

  it("infraErrorCount=1 の場合は 'infra_error' を返す (passCount=2 でも優先)", () => {
    assert.strictEqual(classifyStability(2, 3, 1), "infra_error");
  });

  it("infraErrorCount=0 の場合、既存の分類が維持される (passCount=3)", () => {
    assert.strictEqual(classifyStability(3, 3, 0), "stable_pass");
  });
});

// --- aggregateStabilityResults ---

describe("aggregateStabilityResults: per_case と summary を返す", () => {
  it("全 PASS の場合、summary.stable_pass=1, flaky=0, stable_fail=0", () => {
    const runsPerCase = new Map([["case-a", [true, true, true]]]);
    const { per_case, summary } = aggregateStabilityResults(runsPerCase, 3, 0);

    assert.equal(per_case.length, 1);
    assert.equal(per_case[0].case_id, "case-a");
    assert.equal(per_case[0].pass_count, 3);
    assert.strictEqual(per_case[0].pass_k, 1.0);
    assert.equal(per_case[0].classification, "stable_pass");

    assert.equal(summary.total_cases, 1);
    assert.equal(summary.stable_pass, 1);
    assert.equal(summary.stable_fail, 0);
    assert.equal(summary.flaky, 0);
  });

  it("全 FAIL の場合、summary.stable_fail=1", () => {
    const runsPerCase = new Map([["case-b", [false, false, false]]]);
    const { per_case, summary } = aggregateStabilityResults(runsPerCase, 3, 0);

    assert.equal(per_case[0].classification, "stable_fail");
    assert.equal(summary.stable_fail, 1);
  });

  it("flaky の場合、summary.flaky=1", () => {
    const runsPerCase = new Map([["case-c", [true, false, true]]]);
    const { per_case, summary } = aggregateStabilityResults(runsPerCase, 3, 0);

    assert.equal(per_case[0].classification, "flaky");
    assert.equal(summary.flaky, 1);
  });

  it("複数ケースを集約する", () => {
    const runsPerCase = new Map([
      ["stable-pass", [true, true, true]],
      ["stable-fail", [false, false, false]],
      ["flaky-case", [true, false, true]],
    ]);
    const { per_case, summary } = aggregateStabilityResults(runsPerCase, 3, 0.05);

    assert.equal(per_case.length, 3);
    assert.equal(summary.total_cases, 3);
    assert.equal(summary.stable_pass, 1);
    assert.equal(summary.stable_fail, 1);
    assert.equal(summary.flaky, 1);
    assert.strictEqual(summary.total_cost_usd, 0.05);
  });

  it("total_cost_usd が呼び出し側から渡される", () => {
    const runsPerCase = new Map([["case-a", [true, true]]]);
    const { summary } = aggregateStabilityResults(runsPerCase, 2, 1.2345);
    assert.strictEqual(summary.total_cost_usd, 1.2345);
  });

  // AC-infra_error: null を含む結果が infra_error に分類される
  it("null を含むケースは infra_error に分類され per_case に infra_error_count が付く", () => {
    const runsPerCase = new Map([["case-infra", [null, null, null]]]);
    const { per_case, summary } = aggregateStabilityResults(runsPerCase, 3, 0);

    assert.equal(per_case[0].classification, "infra_error");
    assert.equal(per_case[0].infra_error_count, 3);
    assert.equal(summary.infra_error, 1);
    assert.equal(summary.stable_pass, 0);
    assert.equal(summary.stable_fail, 0);
    assert.equal(summary.flaky, 0);
  });

  it("pass と null が混在する場合も infra_error が優先される", () => {
    const runsPerCase = new Map([["case-mixed", [true, null, true]]]);
    const { per_case, summary } = aggregateStabilityResults(runsPerCase, 3, 0);

    assert.equal(per_case[0].classification, "infra_error");
    assert.equal(per_case[0].infra_error_count, 1);
    assert.equal(summary.infra_error, 1);
  });

  // AC-invariant: stable_pass + stable_fail + flaky + infra_error === total_cases
  it("stable_pass + stable_fail + flaky + infra_error === total_cases のインバリアントが成立する", () => {
    const runsPerCase = new Map([
      ["case-pass", [true, true, true]],
      ["case-fail", [false, false, false]],
      ["case-flaky", [true, false, true]],
      ["case-infra", [null, true, false]],
    ]);
    const { summary } = aggregateStabilityResults(runsPerCase, 3, 0);

    const sumCategories =
      summary.stable_pass + summary.stable_fail + summary.flaky + summary.infra_error;
    assert.equal(
      sumCategories,
      summary.total_cases,
      `stable_pass(${summary.stable_pass}) + stable_fail(${summary.stable_fail}) + flaky(${summary.flaky}) + infra_error(${summary.infra_error}) !== total_cases(${summary.total_cases})`,
    );
  });
});
