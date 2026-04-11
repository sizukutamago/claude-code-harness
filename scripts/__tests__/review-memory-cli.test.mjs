/**
 * review-memory-cli.test.mjs
 *
 * TDD テスト: scripts/review-memory.mjs の CLI エントリポイント
 * node:test + node:child_process の spawn を使ってCLIを実行し、
 * stdout/stderr/exit code を検証する。
 *
 * テストケース (9件) は全て AC 由来
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { createTmpContext } from "./_helpers.mjs";

// --- ヘルパー ---

const ctx = createTmpContext();
const setup = ctx.setup;
const teardown = ctx.teardown;
const tmpPath = ctx.tmpPath;

const CLI_PATH = resolve("scripts/review-memory.mjs");
const CWD = resolve(".");

/**
 * CLIを実行してstdout/stderr/exit codeを返す
 * @param {string[]} args - サブコマンドと引数
 * @param {string} stdin - stdinに渡す文字列
 * @param {object} env - 追加の環境変数
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runCli(args, stdin = "", env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      cwd: CWD,
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", reject);

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

// --- add ---

describe("CLI: add", () => {
  before(setup);
  after(teardown);

  // AC-CLI-1: stdin JSON を受け取り findings に追記、stdout で id を返す
  it("AC-CLI-1: add - reads JSON from stdin, appends to findings, returns id in stdout", async () => {
    const findingsPath = tmpPath("add-findings.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
      cluster_id: null,
    };

    const result = await runCli(
      ["add", "--findings", findingsPath],
      JSON.stringify(entry),
    );

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const parsed = JSON.parse(result.stdout.trim());
    assert.ok("id" in parsed, "stdout should contain id field");
    assert.match(parsed.id, /^rf-\d{3}$/, "id should match rf-NNN format");
  });

  // AC-CLI-2: stdin が空の場合、exit 1
  it("AC-CLI-2: add - empty stdin causes exit 1", async () => {
    const findingsPath = tmpPath("add-empty-findings.jsonl");

    const result = await runCli(["add", "--findings", findingsPath], "");

    assert.equal(result.code, 1, "exit code should be 1 for empty stdin");
    assert.ok(
      result.stderr.toLowerCase().includes("invalid json") ||
        result.stderr.toLowerCase().includes("json"),
      `stderr should mention invalid JSON, got: ${result.stderr}`,
    );
  });

  // 修正項目2: 入力バリデーション
  it("add - missing required field causes exit 1", async () => {
    const findingsPath = tmpPath("add-missing-field.jsonl");
    // 'file' フィールドが欠けている
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
    };

    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));

    assert.equal(result.code, 1, "exit code should be 1 for missing required field");
    assert.ok(result.stderr.includes("file"), `stderr should mention the missing field, got: ${result.stderr}`);
  });

  it("add - invalid reviewer causes exit 1", async () => {
    const findingsPath = tmpPath("add-invalid-reviewer.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "invalid",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
    };

    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));

    assert.equal(result.code, 1, "exit code should be 1 for invalid reviewer");
    assert.ok(result.stderr.includes("reviewer"), `stderr should mention reviewer, got: ${result.stderr}`);
  });

  it("add - invalid severity causes exit 1", async () => {
    const findingsPath = tmpPath("add-invalid-severity.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "INVALID",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
    };

    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));

    assert.equal(result.code, 1, "exit code should be 1 for invalid severity");
    assert.ok(result.stderr.includes("severity"), `stderr should mention severity, got: ${result.stderr}`);
  });

  it("add - invalid cluster_id format causes exit 1", async () => {
    const findingsPath = tmpPath("add-invalid-cluster.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
      cluster_id: "invalid-format",
    };

    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));

    assert.equal(result.code, 1, "exit code should be 1 for invalid cluster_id");
    assert.ok(result.stderr.includes("cluster_id"), `stderr should mention cluster_id, got: ${result.stderr}`);
  });

  // 修正項目3: --new-cluster オプション
  it("add --new-cluster assigns new cluster_id automatically", async () => {
    const findingsPath = tmpPath("add-new-cluster.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
      cluster_id: null,
    };

    const result = await runCli(
      ["add", "--new-cluster", "--findings", findingsPath],
      JSON.stringify(entry),
    );

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok("id" in parsed, "stdout should contain id field");
    assert.ok("cluster_id" in parsed, "stdout should contain cluster_id field");
    assert.match(parsed.cluster_id, /^c-\d{3}$/, "cluster_id should match c-NNN format");
  });

  it("add --cluster sets cluster_id to specified value", async () => {
    const findingsPath = tmpPath("add-cluster-opt.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
    };

    const result = await runCli(
      ["add", "--cluster", "c-001", "--findings", findingsPath],
      JSON.stringify(entry),
    );

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.cluster_id, "c-001", "cluster_id should be set to c-001");
  });

  it("add --new-cluster and --cluster together causes exit 1", async () => {
    const findingsPath = tmpPath("add-both-cluster-opts.jsonl");
    const entry = {
      date: "2026-04-11",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "test-cat",
      pattern: "test",
      suggestion: "fix",
      file: "a.ts",
    };

    const result = await runCli(
      ["add", "--new-cluster", "--cluster", "c-001", "--findings", findingsPath],
      JSON.stringify(entry),
    );

    assert.equal(result.code, 1, "exit code should be 1 when both --new-cluster and --cluster are specified");
  });
});

// --- representatives ---

describe("CLI: representatives", () => {
  before(setup);
  after(teardown);

  // AC-CLI-3: クラスタが0件なら [] を返す
  it("AC-CLI-3: representatives - returns [] when no clusters exist", async () => {
    const findingsPath = tmpPath("reps-empty.jsonl");
    await writeFile(findingsPath, "");

    const result = await runCli(["representatives", "--findings", findingsPath]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, []);
  });

  // AC-CLI-4: --findings でパス指定が効く
  it("AC-CLI-4: representatives - --findings option allows custom path", async () => {
    const findingsPath = tmpPath("reps-custom.jsonl");
    const entries = [
      {
        id: "rf-001",
        cluster_id: "c-001",
        category: "cat-a",
        pattern: "p-a",
        suggestion: "s-a",
      },
    ];
    await writeFile(
      findingsPath,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );

    const result = await runCli(["representatives", "--findings", findingsPath]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].cluster_id, "c-001");
  });
});

// --- promote ---

describe("CLI: promote", () => {
  before(setup);
  after(teardown);

  // AC-CLI-5: 指定した cluster_id を昇格、stdout で {"promoted": "c-XXX"} を返す
  it("AC-CLI-5: promote - promotes specified cluster and returns {promoted: id} in stdout", async () => {
    const findingsPath = tmpPath("promote-findings.jsonl");
    const archivePath = tmpPath("promote-archive.jsonl");
    const conventionsPath = tmpPath("promote-conventions.md");

    const entries = [
      {
        id: "rf-001",
        cluster_id: "c-001",
        category: "cat-a",
        pattern: "p-a",
        suggestion: "s-a",
      },
      {
        id: "rf-002",
        cluster_id: "c-001",
        category: "cat-a",
        pattern: "p-a",
        suggestion: "s-a",
      },
    ];
    await writeFile(
      findingsPath,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    await writeFile(
      conventionsPath,
      "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n",
    );

    const result = await runCli([
      "promote",
      "c-001",
      "--findings",
      findingsPath,
      "--archive",
      archivePath,
      "--conventions",
      conventionsPath,
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, { promoted: "c-001" });
  });

  // AC-CLI-6: 存在しない cluster_id で exit 0（no-op）、noop: true を返す
  it("AC-CLI-6: promote - nonexistent cluster_id returns {promoted, noop: true} with exit 0", async () => {
    const findingsPath = tmpPath("promote-noop-findings.jsonl");
    const archivePath = tmpPath("promote-noop-archive.jsonl");
    const conventionsPath = tmpPath("promote-noop-conventions.md");

    await writeFile(findingsPath, "");
    await writeFile(
      conventionsPath,
      "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n",
    );

    const result = await runCli([
      "promote",
      "c-999",
      "--findings",
      findingsPath,
      "--archive",
      archivePath,
      "--conventions",
      conventionsPath,
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, { promoted: "c-999", noop: true });
  });

  // AC-CLI-7: cluster_id 未指定で exit 1
  it("AC-CLI-7: promote - missing cluster_id causes exit 1", async () => {
    const result = await runCli(["promote"]);

    assert.equal(result.code, 1, "exit code should be 1 when cluster_id is missing");
    assert.ok(result.stderr.length > 0, "stderr should have usage message");
  });

  // 修正項目1: parseArgs を使った positional 引数パース
  it("promote --findings /path c-001 correctly identifies clusterId", async () => {
    const findingsPath = tmpPath("promote-parseargs-findings.jsonl");
    const archivePath = tmpPath("promote-parseargs-archive.jsonl");
    const conventionsPath = tmpPath("promote-parseargs-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(
      conventionsPath,
      "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n",
    );

    // --findings の前に option 値があっても clusterId は c-001 に解釈される
    const result = await runCli([
      "promote",
      "--findings",
      findingsPath,
      "c-001",
      "--archive",
      archivePath,
      "--conventions",
      conventionsPath,
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, { promoted: "c-001" });
  });

  it("promote c-001 --findings /path correctly identifies clusterId", async () => {
    const findingsPath = tmpPath("promote-parseargs2-findings.jsonl");
    const archivePath = tmpPath("promote-parseargs2-archive.jsonl");
    const conventionsPath = tmpPath("promote-parseargs2-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(
      conventionsPath,
      "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n",
    );

    const result = await runCli([
      "promote",
      "c-001",
      "--findings",
      findingsPath,
      "--archive",
      archivePath,
      "--conventions",
      conventionsPath,
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, { promoted: "c-001" });
  });
});

// --- promote-all ---

describe("CLI: promote-all", () => {
  before(setup);
  after(teardown);

  // AC-CLI-8: 複数クラスタを一括昇格、stdout で配列を返す
  it("AC-CLI-8: promote-all - promotes all promotable clusters and returns array in stdout", async () => {
    const findingsPath = tmpPath("promote-all-findings.jsonl");
    const archivePath = tmpPath("promote-all-archive.jsonl");
    const conventionsPath = tmpPath("promote-all-conventions.md");

    const entries = [
      {
        id: "rf-001",
        cluster_id: "c-001",
        category: "cat-a",
        pattern: "p-a",
        suggestion: "s-a",
      },
      {
        id: "rf-002",
        cluster_id: "c-001",
        category: "cat-a",
        pattern: "p-a",
        suggestion: "s-a",
      },
      {
        id: "rf-003",
        cluster_id: "c-002",
        category: "cat-b",
        pattern: "p-b",
        suggestion: "s-b",
      },
      {
        id: "rf-004",
        cluster_id: "c-002",
        category: "cat-b",
        pattern: "p-b",
        suggestion: "s-b",
      },
    ];
    await writeFile(
      findingsPath,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    await writeFile(
      conventionsPath,
      "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n",
    );

    const result = await runCli([
      "promote-all",
      "--findings",
      findingsPath,
      "--archive",
      archivePath,
      "--conventions",
      conventionsPath,
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.ok("promoted" in parsed, "stdout should contain promoted field");
    assert.ok(Array.isArray(parsed.promoted), "promoted should be an array");
    assert.equal(parsed.promoted.length, 2);
    const sortedPromoted = [...parsed.promoted].sort();
    assert.deepEqual(sortedPromoted, ["c-001", "c-002"]);
  });
});

// --- 不正引数 ---

describe("CLI: invalid arguments", () => {
  // AC-CLI-9: 不明なサブコマンドで exit 1
  it("AC-CLI-9: unknown subcommand causes exit 1", async () => {
    const result = await runCli(["unknown"]);

    assert.equal(result.code, 1, "exit code should be 1 for unknown subcommand");
    assert.ok(result.stderr.length > 0, "stderr should have usage message");
  });
});
