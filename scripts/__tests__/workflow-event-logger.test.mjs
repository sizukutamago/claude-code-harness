/**
 * workflow-event-logger.test.mjs
 *
 * TDD テスト: .claude/hooks/scripts/workflow-event-logger.mjs の拡張機能検証
 *
 * AC-B1: timestampフィールドがISO 8601形式で追加される（既存）
 * AC-B2: agent_type → workflow_step マッピングが正しく記録される
 * AC-B3: マッピングにない agent_type は workflow_step: "unknown" になる
 * AC-B4: dispatch_count がセッション内の同一 agent_type の出現回数を反映する
 * AC-B5: 既存フィールド(event_type, agent_type, description, session_id, tool_name)が維持される
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const hookScript = resolve(
  process.cwd(),
  ".claude/hooks/scripts/workflow-event-logger.mjs",
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

describe("workflow-event-logger: 拡張フィールド", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "workflow-event-logger-test-"));
    await mkdir(join(tmpDir, ".claude", "harness"), { recursive: true });
  });

  after(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  // AC-B5: 既存フィールドの維持
  it("AC-B5: 既存フィールド(event_type, agent_type, description, session_id)が維持される", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: {
        description: "TDD 実装",
        subagent_type: "implementer",
      },
      session_id: "session-001",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.event_type, "agent_completed");
    assert.equal(entry.agent_type, "implementer");
    assert.equal(entry.description, "TDD 実装");
    assert.equal(entry.session_id, "session-001");
    assert.equal(entry.tool_name, "Agent");
  });

  // AC-B1: timestamp は既存実装で既にあるが検証する
  it("AC-B1: timestampフィールドがISO 8601形式で存在する", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: {
        description: "要件分析",
        subagent_type: "requirements-analyst",
      },
      session_id: "session-002",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.ok(entry.timestamp, "timestamp フィールドが存在する");
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  // AC-B2: agent_type → workflow_step マッピング
  it("AC-B2: implementer は workflow_step '[4] 実装' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "実装", subagent_type: "implementer" },
      session_id: "session-003",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "[4] 実装");
  });

  it("AC-B2: requirements-analyst は workflow_step '[1] 要件理解' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "要件分析", subagent_type: "requirements-analyst" },
      session_id: "session-004",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "[1] 要件理解");
  });

  it("AC-B2: test-runner は workflow_step '[5] テスト' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "テスト実行", subagent_type: "test-runner" },
      session_id: "session-005",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "[5] テスト");
  });

  it("AC-B2: quality-reviewer は workflow_step '[8] レビュー' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "品質レビュー", subagent_type: "quality-reviewer" },
      session_id: "session-006",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "[8] レビュー");
  });

  it("AC-B2: verifier は workflow_step '[9] 完了検証' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "検証", subagent_type: "verifier" },
      session_id: "session-007",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "[9] 完了検証");
  });

  it("AC-B2: session-verifier は workflow_step '[12] 振り返り' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "振り返り", subagent_type: "session-verifier" },
      session_id: "session-008",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "[12] 振り返り");
  });

  it("AC-B2: review-memory-curator は workflow_step '(補助)' にマッピングされる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "レビュー記憶昇格", subagent_type: "review-memory-curator" },
      session_id: "session-009",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "(補助)");
  });

  // AC-B3: マッピングにない agent_type は "unknown"
  it("AC-B3: マッピングにない agent_type は workflow_step 'unknown' になる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "不明なエージェント", subagent_type: "unknown-agent" },
      session_id: "session-010",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "unknown");
  });

  it("AC-B3: agent_type が null の場合も workflow_step 'unknown' になる", async () => {
    const input = {
      tool_name: "Agent",
      tool_input: { description: "null エージェント" },
      session_id: "session-011",
      cwd: tmpDir,
    };
    await runHook(input, tmpDir);

    const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
    const entries = await readJsonlLines(logPath);
    const entry = entries[entries.length - 1];

    assert.equal(entry.workflow_step, "unknown");
  });

  // AC-B4: dispatch_count の検証
  it("AC-B4: 同じ agent_type の2回目 dispatch で dispatch_count が 2 になる", async () => {
    // 新しいtmpDirを使って独立したカウンタテスト
    const countTmpDir = await mkdtemp(join(tmpdir(), "dispatch-count-test-"));
    try {
      await mkdir(join(countTmpDir, ".claude", "harness"), { recursive: true });

      const input = {
        tool_name: "Agent",
        tool_input: { description: "実装1回目", subagent_type: "implementer" },
        session_id: "session-count",
        cwd: countTmpDir,
      };

      // 1回目 dispatch
      await runHook(input, countTmpDir);
      // 2回目 dispatch
      await runHook({ ...input, tool_input: { ...input.tool_input, description: "実装2回目" } }, countTmpDir);

      const logPath = join(countTmpDir, ".claude", "harness", "workflow-events.jsonl");
      const entries = await readJsonlLines(logPath);

      assert.equal(entries[0].dispatch_count, 1, "1回目は dispatch_count: 1");
      assert.equal(entries[1].dispatch_count, 2, "2回目は dispatch_count: 2");
    } finally {
      await rm(countTmpDir, { recursive: true, force: true });
    }
  });

  it("AC-B4: 異なる agent_type は独立してカウントされる", async () => {
    const countTmpDir = await mkdtemp(join(tmpdir(), "dispatch-count-separate-"));
    try {
      await mkdir(join(countTmpDir, ".claude", "harness"), { recursive: true });

      // implementer を1回
      await runHook({
        tool_name: "Agent",
        tool_input: { description: "実装", subagent_type: "implementer" },
        session_id: "s",
        cwd: countTmpDir,
      }, countTmpDir);

      // verifier を1回
      await runHook({
        tool_name: "Agent",
        tool_input: { description: "検証", subagent_type: "verifier" },
        session_id: "s",
        cwd: countTmpDir,
      }, countTmpDir);

      // implementer を2回目
      await runHook({
        tool_name: "Agent",
        tool_input: { description: "実装2回目", subagent_type: "implementer" },
        session_id: "s",
        cwd: countTmpDir,
      }, countTmpDir);

      const logPath = join(countTmpDir, ".claude", "harness", "workflow-events.jsonl");
      const entries = await readJsonlLines(logPath);

      assert.equal(entries[0].dispatch_count, 1, "implementer 1回目");
      assert.equal(entries[1].dispatch_count, 1, "verifier 1回目（独立カウント）");
      assert.equal(entries[2].dispatch_count, 2, "implementer 2回目");
    } finally {
      await rm(countTmpDir, { recursive: true, force: true });
    }
  });
});

// マッピングテーブルの完全性テスト
describe("workflow-event-logger: マッピングテーブルの完全性", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "wf-mapping-test-"));
    await mkdir(join(tmpDir, ".claude", "harness"), { recursive: true });
  });

  after(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  const EXPECTED_MAPPINGS = [
    ["requirements-analyst", "[1] 要件理解"],
    ["design-reviewer", "[2] 設計"],
    ["planner", "[3] 計画"],
    ["plan-reviewer", "[3] 計画"],
    ["implementer", "[4] 実装"],
    ["test-runner", "[5] テスト"],
    ["simplifier", "[6] リファクタ"],
    ["test-quality-engineer", "[7] 品質テスト"],
    ["quality-reviewer", "[8] レビュー"],
    ["security-reviewer", "[8] レビュー"],
    ["spec-compliance-reviewer", "[8] レビュー"],
    ["verifier", "[9] 完了検証"],
    ["cleanup-agent", "[10] 整理"],
    ["doc-maintainer", "[10] 整理"],
    ["session-verifier", "[12] 振り返り"],
    ["improvement-proposer", "[12] 振り返り"],
    ["review-memory-curator", "(補助)"],
  ];

  for (const [agentType, expectedStep] of EXPECTED_MAPPINGS) {
    it(`AC-B2: ${agentType} → '${expectedStep}'`, async () => {
      const logPath = join(tmpDir, ".claude", "harness", "workflow-events.jsonl");
      const input = {
        tool_name: "Agent",
        tool_input: { description: `${agentType} test`, subagent_type: agentType },
        session_id: "mapping-test",
        cwd: tmpDir,
      };
      await runHook(input, tmpDir);

      const entries = await readJsonlLines(logPath);
      const entry = entries[entries.length - 1];
      assert.equal(entry.workflow_step, expectedStep, `${agentType} should map to ${expectedStep}`);
    });
  }
});
