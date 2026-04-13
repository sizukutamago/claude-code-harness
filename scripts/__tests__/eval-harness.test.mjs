/**
 * eval-harness.test.mjs
 *
 * TDD テスト: scripts/eval-harness.mjs の動作検証
 *
 * AC-1: workspace にテストファイルがある場合、test_files/src_files が正しくカウントされる
 * AC-2: progress.txt がある場合、stories_done が正しくカウントされる
 * AC-3: 出力 JSONL に必須フィールド（timestamp, harness, tests, src_loc）が含まれる
 * AC-4: workspace が存在しない場合、エラーメッセージを出して exit 1
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const evalHarnessScript = resolve(process.cwd(), "scripts/eval-harness.mjs");

/**
 * eval-harness.mjs を実行する。
 *
 * @param {string} workspacePath
 * @param {string} outputJsonl
 * @param {string} [harnessName]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function runEvalHarness(workspacePath, outputJsonl, harnessName = "test-harness") {
  return new Promise((resolvePromise) => {
    const args = [evalHarnessScript, workspacePath, outputJsonl, harnessName];
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

describe("eval-harness: workspace にテストファイルがある場合", () => {
  let tmpDir;
  let outputJsonl;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "eval-harness-test-"));
    outputJsonl = join(tmpDir, "eval-results.jsonl");

    // src/ ディレクトリを作成
    const srcDir = join(tmpDir, "src");
    await mkdir(srcDir, { recursive: true });

    // ソースファイル（テスト以外）
    await writeFile(join(srcDir, "app.ts"), "const x = 1;\n");
    await writeFile(join(srcDir, "utils.ts"), "export function add(a: number, b: number) { return a + b; }\n");

    // テストファイル
    await writeFile(join(srcDir, "app.test.ts"), "import { describe, it } from 'node:test';\ndescribe('app', () => { it('works', () => {}); });\n");
    await writeFile(join(srcDir, "utils.test.ts"), "import { describe, it } from 'node:test';\ndescribe('utils', () => { it('works', () => {}); });\n");

    // progress.txt
    await writeFile(join(tmpDir, "progress.txt"), "# Stories\n- [x] Story 1\n- [x] Story 2\n- [ ] Story 3\n");

    // package.json（npm test 用）
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({
      name: "test-project",
      type: "module",
      scripts: { test: "echo 'Tests: 5 passed'" },
    }));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  // AC-1: test_files/src_files が正しくカウントされる
  it("AC-1: test_files と src_files が正しくカウントされる", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "claude-code-harness");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.test_files, 2, "test_files should be 2");
    assert.equal(entry.src_files, 2, "src_files should be 2");
  });

  // AC-2: stories_done が正しくカウントされる
  it("AC-2: progress.txt がある場合、stories_done が正しくカウントされる", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "claude-code-harness");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.stories_done, 2, "stories_done should be 2 (only [x] items)");
  });

  // AC-3: 必須フィールドが含まれる
  it("AC-3: 出力 JSONL に必須フィールド（timestamp, harness, tests, src_loc）が含まれる", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "claude-code-harness");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok(entry.timestamp, "timestamp フィールドが存在する");
    assert.ok(entry.harness, "harness フィールドが存在する");
    assert.ok(entry.src_loc !== undefined, "src_loc フィールドが存在する");
    // tests は null の可能性あり（テストスクリプトが parse できない場合）
    assert.ok("tests" in entry, "tests フィールドが存在する");
  });

  it("AC-3: harness フィールドに渡した harness 名が入る", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "my-harness");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.harness, "my-harness");
  });

  it("AC-3: timestamp が ISO8601 形式である", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "claude-code-harness");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(entry.timestamp),
      `timestamp should be ISO8601, got: ${entry.timestamp}`,
    );
  });

  it("AC-3: 追記モードで複数回実行すると JSONL に複数エントリが追加される", async () => {
    const appendJsonl = join(tmpDir, "eval-results-append.jsonl");

    await runEvalHarness(tmpDir, appendJsonl, "harness-a");
    await runEvalHarness(tmpDir, appendJsonl, "harness-b");

    const content = await readFile(appendJsonl, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    assert.equal(lines.length, 2, "2回実行したので2エントリ存在する");

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.harness, "harness-a");
    assert.equal(second.harness, "harness-b");
  });
});

describe("eval-harness: workspace が存在しない場合", () => {
  // AC-4: workspace が存在しない場合、エラーメッセージを出して exit 1
  it("AC-4: workspace が存在しない場合はエラーメッセージを stderr に出力して exit 1 する", async () => {
    const fakeWorkspace = "/nonexistent/path/that/does/not/exist";
    const outputJsonl = join(tmpdir(), "eval-harness-no-workspace.jsonl");

    const result = await runEvalHarness(fakeWorkspace, outputJsonl);

    assert.equal(result.code, 1, `exit code should be 1, got: ${result.code}`);
    assert.ok(
      result.stderr.length > 0,
      `stderr should contain error message, got: "${result.stderr}"`,
    );
  });
});

describe("eval-harness: src/ がない workspace の場合", () => {
  let tmpDir;
  let outputJsonl;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "eval-harness-nosrc-"));
    outputJsonl = join(tmpDir, "eval-results.jsonl");

    // src/ なし、progress.txt なし
    await writeFile(join(tmpDir, "package.json"), JSON.stringify({
      name: "empty-project",
      type: "module",
      scripts: { test: "echo '0 tests'" },
    }));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("src/ がない場合、test_files と src_files が 0 になる", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "empty");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.test_files, 0, "test_files should be 0");
    assert.equal(entry.src_files, 0, "src_files should be 0");
  });

  it("progress.txt がない場合、stories_done が 0 になる", async () => {
    const result = await runEvalHarness(tmpDir, outputJsonl, "empty");
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const content = await readFile(outputJsonl, "utf-8");
    const entry = JSON.parse(content.trim().split("\n").at(-1));

    assert.equal(entry.stories_done, 0, "stories_done should be 0");
  });
});
