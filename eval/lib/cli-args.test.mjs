/**
 * cli-args.test.mjs
 *
 * TDD テスト: eval/lib/cli-args.mjs の動作検証
 *
 * AC-2: --k オプション追加後のテスト（既存テストも含む）
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "./cli-args.mjs";

// --- 既存: --concurrency ---

describe("parseCliArgs: --concurrency オプション", () => {
  it("--concurrency が指定された場合、その値を返す", () => {
    const result = parseCliArgs(["--concurrency", "5", "foo.yaml"], 3);
    assert.equal(result.concurrency, 5);
    assert.deepEqual(result.positional, ["foo.yaml"]);
  });

  it("--concurrency が未指定の場合、defaultConcurrency を返す", () => {
    const result = parseCliArgs(["foo.yaml"], 3);
    assert.equal(result.concurrency, 3);
    assert.deepEqual(result.positional, ["foo.yaml"]);
  });

  it("ポジション引数なしの場合、positional は空配列", () => {
    const result = parseCliArgs([], 3);
    assert.equal(result.concurrency, 3);
    assert.deepEqual(result.positional, []);
  });

  it("複数ポジション引数を正しく返す", () => {
    const result = parseCliArgs(["a.yaml", "b.yaml"], 3);
    assert.deepEqual(result.positional, ["a.yaml", "b.yaml"]);
  });
});

// --- 新規: --k オプション（AC-2）---

describe("parseCliArgs: --k オプション", () => {
  it("--k が指定された場合、その値を返す", () => {
    const result = parseCliArgs(["--k", "5", "foo.yaml"], 3, 3);
    assert.equal(result.k, 5);
    assert.deepEqual(result.positional, ["foo.yaml"]);
  });

  it("--k が未指定の場合、defaultK を返す", () => {
    const result = parseCliArgs(["foo.yaml"], 3, 3);
    assert.equal(result.k, 3);
    assert.deepEqual(result.positional, ["foo.yaml"]);
  });

  it("--k のデフォルト値が 3 である", () => {
    const result = parseCliArgs(["foo.yaml"], 3);
    assert.equal(result.k, 3);
  });

  it("--k と --concurrency を両方指定できる", () => {
    const result = parseCliArgs(["--k", "5", "--concurrency", "2", "foo.yaml"], 3, 3);
    assert.equal(result.k, 5);
    assert.equal(result.concurrency, 2);
    assert.deepEqual(result.positional, ["foo.yaml"]);
  });

  it("--k と --concurrency を逆順に指定できる", () => {
    const result = parseCliArgs(["--concurrency", "2", "--k", "5", "foo.yaml"], 3, 3);
    assert.equal(result.k, 5);
    assert.equal(result.concurrency, 2);
    assert.deepEqual(result.positional, ["foo.yaml"]);
  });

  it("--k 1 は有効（最小正の整数）", () => {
    const result = parseCliArgs(["--k", "1", "foo.yaml"], 3, 3);
    assert.equal(result.k, 1);
  });
});

// --- 新規: バリデーション（SHOULD-4）---

describe("parseCliArgs: --k / --concurrency のバリデーション", () => {
  it("--k 0 は TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--k", "0", "foo.yaml"], 3, 3),
      TypeError,
    );
  });

  it("--k -1 は TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--k", "-1", "foo.yaml"], 3, 3),
      TypeError,
    );
  });

  it("--k abc は TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--k", "abc", "foo.yaml"], 3, 3),
      TypeError,
    );
  });

  it("--concurrency 0 は TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--concurrency", "0", "foo.yaml"], 3),
      TypeError,
    );
  });

  it("--concurrency -1 は TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--concurrency", "-1", "foo.yaml"], 3),
      TypeError,
    );
  });

  it("--concurrency abc は TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--concurrency", "abc", "foo.yaml"], 3),
      TypeError,
    );
  });

  it("--k を値なしで末尾指定した場合 TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--k"], 3, 3),
      TypeError,
    );
  });

  it("--concurrency を値なしで末尾指定した場合 TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--concurrency"], 3),
      TypeError,
    );
  });

  it("--k の直後に別フラグがある場合 TypeError を投げる", () => {
    assert.throws(
      () => parseCliArgs(["--k", "--concurrency", "4"], 3, 3),
      TypeError,
    );
  });
});
