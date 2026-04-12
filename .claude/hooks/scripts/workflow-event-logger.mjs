#!/usr/bin/env node

/**
 * workflow-event-logger.mjs
 *
 * PostToolUse (Agent) フック。
 * エージェント dispatch 完了時に .claude/harness/workflow-events.jsonl にイベントを記録する。
 *
 * 消費者:
 * - session-verifier エージェント（ワークフロー実行履歴の確認）
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Agent",
 *   "tool_input": {
 *     "description": "TDD実装",
 *     "subagent_type": "implementer"
 *   },
 *   "session_id": "...",
 *   "cwd": "/project/root"
 * }
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// agent_type → ワークフローステップのマッピングテーブル
const WORKFLOW_STEP_MAP = {
  "requirements-analyst": "[1] 要件理解",
  "design-reviewer": "[2] 設計",
  "planner": "[3] 計画",
  "plan-reviewer": "[3] 計画",
  "implementer": "[4] 実装",
  "test-runner": "[5] テスト",
  "simplifier": "[6] リファクタ",
  "test-quality-engineer": "[7] 品質テスト",
  "quality-reviewer": "[8] レビュー",
  "security-reviewer": "[8] レビュー",
  "spec-compliance-reviewer": "[8] レビュー",
  "verifier": "[9] 完了検証",
  "cleanup-agent": "[10] 整理",
  "doc-maintainer": "[10] 整理",
  "session-verifier": "[12] 振り返り",
  "improvement-proposer": "[12] 振り返り",
  "review-memory-curator": "(補助)",
};

/**
 * ログファイルから同一 agent_type の dispatch 回数を数える。
 * @param {string} logPath
 * @param {string|null} agentType
 * @returns {number}
 */
function countDispatch(logPath, agentType) {
  if (!existsSync(logPath) || !agentType) return 0;
  const lines = readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  return lines.filter((line) => {
    try {
      const entry = JSON.parse(line);
      return entry.agent_type === agentType;
    } catch {
      return false;
    }
  }).length;
}

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const description = input?.tool_input?.description ?? null;
  const subagentType = input?.tool_input?.subagent_type ?? null;

  const cwd = input.cwd || process.cwd();
  const logDir = resolve(cwd, ".claude/harness");
  const logPath = resolve(logDir, "workflow-events.jsonl");

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // dispatch_count: このエントリを追加する前の同一 agent_type の出現回数 + 1
  const dispatchCount = countDispatch(logPath, subagentType) + 1;

  // workflow_step: マッピングテーブルから取得。該当なしは "unknown"
  const workflowStep = subagentType
    ? WORKFLOW_STEP_MAP[subagentType] ?? "unknown"
    : "unknown";

  const entry = {
    timestamp: new Date().toISOString(),
    event_type: "agent_completed",
    agent_type: subagentType,
    workflow_step: workflowStep,
    dispatch_count: dispatchCount,
    description: description,
    session_id: input.session_id || null,
    tool_name: input.tool_name || "Agent",
  };

  appendFileSync(logPath, JSON.stringify(entry) + "\n");
} catch (err) {
  console.error(`[workflow-event-logger] ${err.message}`);
  process.exit(0);
}
