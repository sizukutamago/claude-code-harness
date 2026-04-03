import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateTotal } from "../src/utils.js";

describe("calculateTotal", () => {
  it("正の値の合計を返す", () => {
    const items = [{ amount: 100 }, { amount: 200 }, { amount: 300 }];
    assert.strictEqual(calculateTotal(items), 600);
  });

  it("空配列は0を返す", () => {
    assert.strictEqual(calculateTotal([]), 0);
  });

  // BUG: 負の値が混じると合計が負になるケースがある
  it("負の値を含む配列の合計", () => {
    const items = [{ amount: 100 }, { amount: -50 }];
    assert.strictEqual(calculateTotal(items), 50);
  });
});
