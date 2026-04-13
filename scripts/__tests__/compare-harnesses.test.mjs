/**
 * compare-harnesses.test.mjs
 *
 * TDD テスト: scripts/compare-harnesses.mjs の動作検証
 *
 * AC-1: 両方に eval エントリがある場合、各指標の勝者が判定される
 * AC-2: tests が多い方が winner になる
 * AC-3: src_loc が少ない方が winner になる（同 stories_done の場合）
 * AC-4: 片方が空の場合、もう片方が全勝
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const compareHarnessesScript = resolve(process.cwd(), "scripts/compare-harnesses.mjs");

/**
 * compare-harnesses.mjs を実行する。
 *
 * @param {string} evalA
 * @param {string} evalB
 * @param {string} [outputJsonl]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function runCompareHarnesses(evalA, evalB, outputJsonl) {
  return new Promise((resolvePromise) => {
    const args = [compareHarnessesScript, evalA, evalB];
    if (outputJsonl) args.push(outputJsonl);

    const child = spawn(process.execPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.end();
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

/** eval エントリを JSONL ファイルに書く */
async function writeEvalJsonl(path, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(path, lines, "utf-8");
}

describe("compare-harnesses: 両方に eval エントリがある場合", () => {
  let tmpDir;
  let evalA;
  let evalB;
  let outputJsonl;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "compare-harnesses-both-"));
    evalA = join(tmpDir, "eval-a.jsonl");
    evalB = join(tmpDir, "eval-b.jsonl");
    outputJsonl = join(tmpDir, "comparison-report.jsonl");

    await writeEvalJsonl(evalA, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "claude-code-harness",
      tests: 230,
      test_files: 20,
      src_files: 15,
      src_loc: 1000,
      test_loc: 800,
      test_code_ratio: 0.8,
      stories_done: 10,
      total_commits: 50,
    }]);

    await writeEvalJsonl(evalB, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "blueprint",
      tests: 180,
      test_files: 18,
      src_files: 20,
      src_loc: 1200,
      test_loc: 900,
      test_code_ratio: 0.75,
      stories_done: 8,
      total_commits: 45,
    }]);
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  // AC-1: 各指標の勝者が判定される
  it("AC-1: 比較結果が comparison-report.jsonl に追記される", async () => {
    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok(entry.timestamp, "timestamp フィールドが存在する");
    assert.ok(entry.quantitative, "quantitative フィールドが存在する");
  });

  // AC-2: tests が多い方が winner になる
  it("AC-2: tests が多い A が勝者になる", async () => {
    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.quantitative.tests.winner, "a", "tests が多い A が winner");
    assert.equal(entry.quantitative.tests.a, 230);
    assert.equal(entry.quantitative.tests.b, 180);
  });

  // AC-3: src_loc が少ない方が winner になる（同 stories_done の場合）
  it("AC-3: src_loc が少ない A が winner になる（A=1000, B=1200）", async () => {
    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.quantitative.src_loc.winner, "a", "src_loc が少ない A が winner");
  });

  it("AC-1: stdout に人間可読なサマリが出力される", async () => {
    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    assert.ok(result.stdout.includes("Synthesis Report"), "stdout に Synthesis Report が含まれる");
    assert.ok(result.stdout.includes("tests"), "stdout に tests が含まれる");
  });

  it("AC-1: test_code_ratio が高い方が winner になる", async () => {
    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    // A=0.8 > B=0.75 なので A が winner
    assert.equal(entry.quantitative.test_code_ratio.winner, "a", "test_code_ratio が高い A が winner");
  });

  it("AC-1: stories_done が多い方が winner になる", async () => {
    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    // A=10 > B=8
    assert.equal(entry.quantitative.stories_done.winner, "a", "stories_done が多い A が winner");
  });
});

describe("compare-harnesses: src_loc 比較（stories_done が同じ場合）", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "compare-harnesses-srcloc-"));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("AC-3: stories_done が同じとき src_loc が多い B が loser になる", async () => {
    const evalA = join(tmpDir, "eval-a-same.jsonl");
    const evalB = join(tmpDir, "eval-b-same.jsonl");
    const outputJsonl = join(tmpDir, "report-same.jsonl");

    await writeEvalJsonl(evalA, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "a",
      tests: 100,
      test_files: 10,
      src_files: 10,
      src_loc: 500,
      test_loc: 400,
      test_code_ratio: 0.8,
      stories_done: 5,
      total_commits: 20,
    }]);

    await writeEvalJsonl(evalB, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "b",
      tests: 100,
      test_files: 10,
      src_files: 15,
      src_loc: 800,
      test_loc: 400,
      test_code_ratio: 0.5,
      stories_done: 5,
      total_commits: 20,
    }]);

    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    // stories_done が同じ(5=5)なので src_loc が少ない A が winner
    assert.equal(entry.quantitative.src_loc.winner, "a");
  });
});

describe("compare-harnesses: 片方が空の場合", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "compare-harnesses-empty-"));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  // AC-4: 片方が空の場合、もう片方が全勝
  it("AC-4: eval-b が空の場合、A が全指標で winner になる", async () => {
    const evalA = join(tmpDir, "eval-a-full.jsonl");
    const evalB = join(tmpDir, "eval-b-empty.jsonl");
    const outputJsonl = join(tmpDir, "report-empty.jsonl");

    await writeEvalJsonl(evalA, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "a",
      tests: 100,
      test_files: 10,
      src_files: 5,
      src_loc: 400,
      test_loc: 300,
      test_code_ratio: 0.75,
      stories_done: 5,
      total_commits: 20,
    }]);

    // B は空ファイル
    await writeFile(evalB, "", "utf-8");

    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.quantitative.tests.winner, "a", "tests: A が winner");
    assert.equal(entry.quantitative.stories_done.winner, "a", "stories_done: A が winner");
  });

  it("AC-4: 両方が空の場合、tie が返される", async () => {
    const evalA = join(tmpDir, "eval-a-both-empty.jsonl");
    const evalB = join(tmpDir, "eval-b-both-empty.jsonl");
    const outputJsonl = join(tmpDir, "report-both-empty.jsonl");

    await writeFile(evalA, "", "utf-8");
    await writeFile(evalB, "", "utf-8");

    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.overall_winner, "tie", "両方空の場合は tie");
  });
});

describe("compare-harnesses: lint_errors が少ない方が winner になる", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "compare-harnesses-lint-"));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("lint_errors が少ない B が winner になる", async () => {
    const evalA = join(tmpDir, "eval-a-lint.jsonl");
    const evalB = join(tmpDir, "eval-b-lint.jsonl");
    const outputJsonl = join(tmpDir, "report-lint.jsonl");

    await writeEvalJsonl(evalA, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "a",
      tests: 100,
      test_files: 5,
      src_files: 5,
      src_loc: 500,
      test_loc: 400,
      test_code_ratio: 0.8,
      stories_done: 5,
      total_commits: 20,
      lint_errors: 10,
    }]);

    await writeEvalJsonl(evalB, [{
      timestamp: "2026-04-12T00:00:00.000Z",
      harness: "b",
      tests: 80,
      test_files: 4,
      src_files: 5,
      src_loc: 500,
      test_loc: 350,
      test_code_ratio: 0.7,
      stories_done: 5,
      total_commits: 18,
      lint_errors: 2,
    }]);

    const result = await runCompareHarnesses(evalA, evalB, outputJsonl);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.quantitative.lint_errors.winner, "b", "lint_errors が少ない B が winner");
  });
});
