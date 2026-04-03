import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processOrder } from "../src/order.js";

const validOrder = {
  customer: { name: "太郎", email: "taro@example.com" },
  items: [{ name: "りんご", quantity: 2, price: 100 }],
};

describe("processOrder", () => {
  it("有効な注文を処理できる", () => {
    const result = processOrder(validOrder);
    assert.strictEqual(result.status, "confirmed");
    assert.strictEqual(result.subtotal, 200);
    assert.strictEqual(result.tax, 20);
    assert.strictEqual(result.total, 220);
  });

  it("注文がないとエラー", () => {
    assert.throws(() => processOrder(null), /order is required/);
  });

  it("商品がないとエラー", () => {
    assert.throws(
      () => processOrder({ customer: { email: "a@b.com" }, items: [] }),
      /items required/,
    );
  });

  it("メールが不正だとエラー", () => {
    assert.throws(
      () => processOrder({ customer: { email: "invalid" }, items: [{ name: "a", quantity: 1, price: 100 }] }),
      /invalid email/,
    );
  });
});
