/**
 * post-tool-log.test.mjs
 *
 * TDD テスト: .claude/hooks/scripts/post-tool-log.mjs の拡張フィールド検証
 *
 * AC-A1: timestampフィールドがISO 8601形式で追加される
 * AC-A2: agent_id/agent_typeがstdin JSONから取得される
 * AC-A3: agent_id/agent_typeがない場合は"coordinator"として記録される
 * AC-A4: 既存フィールド(tool, file, session_id)が維持される
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const hookScript = resolve(
  process.cwd(),
  ".claude/hooks/scripts/post-tool-log.mjs",
);

async function runHook(stdinJson, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [hookScript], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.write(JSON.stringify(stdinJson));
    child.stdin.end();
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function readJsonlLines(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

describe("post-tool-log: 拡張フィールド", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "post-tool-log-test-"));
    await mkdir(join(tmpDir, ".claude", "harness"), { recursive: true });
  });

  after(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // AC-A4: 既存フィールド (tool, file, session_id) が維持される
  it("AC-A4: 既存フィールド(tool, file, session_id)が維持される", async () => {
    const input = {
      tool_name: "Edit",
      tool_input: { file_path: "/path/to/file.ts" },
      session_id: "session-001",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "session-tool-log.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.tool, "Edit");
    assert.equal(entry.file, "/path/to/file.ts");
    assert.equal(entry.session_id, "session-001");
  });

  // AC-A1: timestampフィールドがISO 8601形式で追加される
  it("AC-A1: timestampフィールドがISO 8601形式で追加される", async () => {
    const before = new Date();
    const input = {
      tool_name: "Write",
      tool_input: { file_path: "/path/to/new-file.ts" },
      session_id: "session-002",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "session-tool-log.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.ok(entry.timestamp, "timestamp フィールドが存在する");
    const ts = new Date(entry.timestamp);
    assert.ok(!isNaN(ts.getTime()), "timestamp が有効な日時である");
    // ISO 8601 形式の確認（Zで終わる）
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    assert.ok(ts >= before, "timestamp が実行前以降である");
  });

  // AC-A2: agent_id/agent_typeがstdin JSONから取得される
  it("AC-A2: agent_id/agent_typeがstdin JSONに存在する場合は記録される", async () => {
    const input = {
      tool_name: "Edit",
      tool_input: { file_path: "/path/to/impl.ts" },
      session_id: "session-003",
      cwd: tmpDir,
      agent_id: "impl-abc123",
      agent_type: "implementer",
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "session-tool-log.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.agent_id, "impl-abc123");
    assert.equal(entry.agent_type, "implementer");
  });

  // AC-A3: agent_id/agent_typeがない場合は"coordinator"として記録される
  it("AC-A3: agent_id/agent_typeがない場合はagent_typeが'coordinator'として記録される", async () => {
    const input = {
      tool_name: "Edit",
      tool_input: { file_path: "/path/to/coord-edit.ts" },
      session_id: "session-004",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "session-tool-log.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.agent_type, "coordinator");
    assert.equal(entry.agent_id, null);
  });

  // 追加: file_pathがない場合は記録せずに終了する
  it("EXTRA-A1: file_pathがない場合はログに追記せずexit 0", async () => {
    const logPath = join(tmpDir, ".claude", "harness", "session-tool-log.jsonl");
    let beforeCount = 0;
    try {
      const entries = await readJsonlLines(logPath);
      beforeCount = entries.length;
    } catch {
      beforeCount = 0;
    }

    const input = {
      tool_name: "Edit",
      tool_input: {},
      session_id: "session-005",
      cwd: tmpDir,
    };
    const result = await runHook(input, tmpDir);
    assert.equal(result.code, 0);

    try {
      const entries = await readJsonlLines(logPath);
      assert.equal(entries.length, beforeCount, "ログが追記されていない");
    } catch {
      // ファイルが存在しない場合も問題なし
    }
  });
});
