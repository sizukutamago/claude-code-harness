#!/usr/bin/env node

/**
 * permission-denied-recorder.mjs
 *
 * PermissionDenied フック。
 * ユーザがツール実行を拒否した事実を .claude/harness/session-feedback.jsonl に自動記録する。
 *
 * feedback-recording ルール（Claude の自己申告）を補完する決定的な記録。
 * retrospective の ② 指摘収集（collect-feedback.mjs）のデータ品質を向上させる。
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Bash" | "Edit" | "Write" | ...,
 *   "tool_input": { ... },
 *   "reason": "string",
 *   "session_id": "...",
 *   "cwd": "/project/root"
 * }
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  const cwd = input.cwd || process.cwd();
  const logDir = resolve(cwd, ".claude/harness");
  const logPath = resolve(logDir, "session-feedback.jsonl");

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // 既存エントリの最大 ID を取得
  let maxId = 0;
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const num = parseInt(entry.id?.replace("fb-", ""), 10);
        if (num > maxId) maxId = num;
      } catch {
        // skip malformed lines
      }
    }
  }

  const entry = {
    id: `fb-${String(maxId + 1).padStart(3, "0")}`,
    timestamp: new Date().toISOString(),
    status: "open",
    type: "rejection",
    category: null,
    summary: `ユーザが ${input.tool_name} ツールの実行を拒否`,
    user_said: input.reason || "",
    affected: input.tool_input?.file_path || input.tool_input?.command || "",
    session_id: input.session_id || null,
  };

  appendFileSync(logPath, JSON.stringify(entry) + "\n");
} catch (err) {
  console.error(`[permission-denied-recorder] ${err.message}`);
  process.exit(0);
}
