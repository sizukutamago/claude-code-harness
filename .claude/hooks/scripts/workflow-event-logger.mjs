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

  const entry = {
    timestamp: new Date().toISOString(),
    event_type: "agent_completed",
    agent_type: subagentType,
    description: description,
    session_id: input.session_id || null,
    tool_name: input.tool_name || "Agent",
  };

  appendFileSync(logPath, JSON.stringify(entry) + "\n");
} catch (err) {
  console.error(`[workflow-event-logger] ${err.message}`);
  process.exit(0);
}
