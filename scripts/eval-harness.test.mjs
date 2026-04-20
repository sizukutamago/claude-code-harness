/**
 * eval-harness.test.mjs (scripts/ 直下)
 *
 * TDD テスト: scripts/eval-harness.mjs の --stability / --stability-case オプション動作検証
 *
 * AC-3:
 *   - --stability 指定時に stability_pass_k が JSONL に追記される
 *   - --stability 未指定時は stability_pass_k が付かない（回帰テスト）
 *   - 存在しない workspace でも CLI エラーが出る（既存動作）
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const evalHarnessScript = resolve(process.cwd(), "scripts/eval-harness.mjs");

/**
 * eval-harness.mjs を引数指定で実行する。
 *
 * @param {string[]} args - process.argv.slice(2) 相当
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function runEvalHarnessWithArgs(args) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [evalHarnessScript, ...args], {
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

// --- --stability オプションのテスト ---

describe("eval-harness: --stability オプション", () => {
  let tmpDir;
  let outputJsonl;
  let summaryJsonPath;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "eval-harness-stability-"));
    outputJsonl = join(tmpDir, "eval-results.jsonl");

    // workspace の src/ ディレクトリ
    const srcDir = join(tmpDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "app.ts"), "const x = 1;\n");
    await writeFile(join(srcDir, "app.test.ts"), "// test\n");

    // package.json（npm test 用）
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({
      name: "test-project",
      type: "module",
      scripts: { test: "echo 'Tests: 3 passed'" },
    }));

    // summary.json を作成（stability ランの結果）
    summaryJsonPath = join(tmpDir, "summary.json");
    const summaryData = {
      run_id: "stability-test",
      k: 3,
      case_files: ["tdd-behavior.yaml"],
      timestamp: new Date().toISOString(),
      per_case: [
        {
          case_id: "tdd-behavior/write test first",
          pass_count: 3,
          pass_k: 1.0,
          classification: "stable_pass",
        },
        {
          case_id: "tdd-behavior/red green refactor",
          pass_count: 2,
          pass_k: 0.6666666666666666,
          classification: "flaky",
        },
      ],
      summary: {
        total_cases: 2,
        stable_pass: 1,
        stable_fail: 0,
        flaky: 1,
        total_cost_usd: 0.05,
      },
    };
    await writeFile(summaryJsonPath, JSON.stringify(summaryData, null, 2));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("--stability と --stability-case が指定された場合、stability_pass_k が JSONL に追記される", async () => {
    const result = await runEvalHarnessWithArgs([
      tmpDir,
      outputJsonl,
      "test-harness",
      "--stability", summaryJsonPath,
      "--stability-case", "tdd-behavior/write test first",
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok("stability_pass_k" in entry, "stability_pass_k フィールドが存在する");
    assert.strictEqual(entry.stability_pass_k, 1.0, "stability_pass_k は 1.0 であるべき");
  });

  it("--stability-case が flaky なケースを指定した場合、正しい pass_k が追記される", async () => {
    const result = await runEvalHarnessWithArgs([
      tmpDir,
      outputJsonl,
      "test-harness",
      "--stability", summaryJsonPath,
      "--stability-case", "tdd-behavior/red green refactor",
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok("stability_pass_k" in entry, "stability_pass_k フィールドが存在する");
    assert.ok(
      Math.abs(entry.stability_pass_k - 0.6666666666666666) < 1e-10,
      `stability_pass_k is ~0.667, got ${entry.stability_pass_k}`,
    );
  });

  it("--stability 未指定時は stability_pass_k が JSONL に付かない（回帰テスト）", async () => {
    const noStabilityJsonl = join(tmpDir, "no-stability.jsonl");
    const result = await runEvalHarnessWithArgs([
      tmpDir,
      noStabilityJsonl,
      "test-harness",
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(noStabilityJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok(
      !("stability_pass_k" in entry),
      `stability_pass_k should NOT be present when --stability is not given, got: ${JSON.stringify(entry)}`,
    );
  });

  it("--stability-case が存在しない case_id の場合、stability_pass_k は null になる", async () => {
    const result = await runEvalHarnessWithArgs([
      tmpDir,
      outputJsonl,
      "test-harness",
      "--stability", summaryJsonPath,
      "--stability-case", "nonexistent-case-id",
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok("stability_pass_k" in entry, "stability_pass_k フィールドが存在する");
    assert.strictEqual(entry.stability_pass_k, null, "存在しない case_id は null を返す");
  });
});

// --- 既存動作の回帰テスト ---

describe("eval-harness: 存在しない workspace でも CLI エラーが出る（既存動作）", () => {
  it("存在しない workspace でも exit 1 する", async () => {
    const fakeWorkspace = "/nonexistent/path/stability-test";
    const outputJsonl = join(tmpdir(), "stability-no-workspace.jsonl");

    const result = await runEvalHarnessWithArgs([fakeWorkspace, outputJsonl]);

    assert.equal(result.code, 1, `exit code should be 1, got: ${result.code}`);
    assert.ok(result.stderr.length > 0, "stderr should contain error message");
  });
});
