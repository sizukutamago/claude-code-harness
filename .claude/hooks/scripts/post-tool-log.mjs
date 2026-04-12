#!/usr/bin/env node

/**
 * post-tool-log.mjs
 *
 * PostToolUse (Edit|Write) フック。
 * Claude が編集したファイルを .claude/harness/session-tool-log.jsonl に記録する。
 *
 * 消費者:
 * - scripts/collect-feedback.mjs（人手修正の検知に使用）
 * - session-verifier エージェント（git diff との突き合わせ）
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Edit" | "Write",
 *   "tool_input": { "file_path": "/absolute/path/to/file" },
 *   "session_id": "...",
 *   "cwd": "/project/root",
 *   "agent_id": "subagent-id (framework-injected, optional)",
 *   "agent_type": "agent-name (framework-injected, optional)"
 * }
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const filePath = input?.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
  }

  const cwd = input.cwd || process.cwd();
  const logDir = resolve(cwd, ".claude/harness");
  const logPath = resolve(logDir, "session-tool-log.jsonl");

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // agent_type: stdin に明示的にある場合はそれを使う。
  // agent_id があるが agent_type がない場合は null。
  // どちらもない場合はコーディネーターとして "coordinator" を記録する。
  const agentType = input.agent_type ?? (input.agent_id ? null : "coordinator");

  const entry = {
    timestamp: new Date().toISOString(),
    tool: input.tool_name,
    file: filePath,
    session_id: input.session_id || null,
    agent_id: input.agent_id || null,
    agent_type: agentType,
  };

  appendFileSync(logPath, JSON.stringify(entry) + "\n");
} catch (err) {
  console.error(`[post-tool-log] ${err.message}`);
  process.exit(0);
}
