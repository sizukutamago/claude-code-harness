#!/usr/bin/env node

/**
 * coordinator-write-guard.mjs
 *
 * PreToolUse (Edit|Write) フック。
 * 不変制約「メインセッションはコードを書かない」を構造的に強制する。
 *
 * - サブエージェントからの Edit/Write → 許可
 * - coordinator からの Edit/Write → ホワイトリスト一致なら許可、それ以外はブロック
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Edit" | "Write",
 *   "tool_input": { "file_path": "/absolute/path/to/file" },
 *   "agent_id": "subagent-id (optional)",
 *   "agent_type": "agent-name (optional)"
 * }
 */

import { readFileSync } from "node:fs";

// coordinator が直接編集してよいファイルパターン
const WHITELIST = [
  /\/\.claude\/harness\//,  // .claude/harness/ 配下（session-feedback.jsonl 等の運用ファイル）
  /\/HANDOVER\.md$/,      // HANDOVER.md
  /\/CLAUDE\.md$/,        // CLAUDE.md
  /\/requirements\//,     // requirements/ 配下（要件ドキュメントはメインセッションの責務）
];

try {
  const input = JSON.parse(readFileSync(0, "utf-8"));

  // サブエージェントからの呼び出しは許可
  if (input.agent_id || input.agent_type) {
    process.exit(0);
  }

  const filePath = input?.tool_input?.file_path || "";

  // ホワイトリストに一致するファイルは許可
  if (WHITELIST.some((pattern) => pattern.test(filePath))) {
    process.exit(0);
  }

  // coordinator がコードを書こうとしている → ブロック
  console.error(
    `[harness] コーディネーターは直接コードを書けません。implementer エージェントにディスパッチしてください。\n対象ファイル: ${filePath}`,
  );
  process.exit(2);
} catch (err) {
  console.error(`[coordinator-write-guard] ${err.message}`);
  process.exit(0);
}
