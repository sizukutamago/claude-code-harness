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
 * 設計上の位置づけ:
 * - これは workflow guardrail であり、security boundary ではない（ADR-0008）
 * - agent_id / agent_type はフレームワーク注入フィールド（LLM 操作不可）
 * - Bash 経由の書き込み（echo > file, sed -i 等）はガード対象外
 *   → Bash 書き込みの制御は CLAUDE.md ルールとスキルの tools 制限に委ねる
 *
 * 期待される stdin JSON:
 * {
 *   "tool_name": "Edit" | "Write",
 *   "tool_input": { "file_path": "/absolute/path/to/file" },
 *   "agent_id": "subagent-id (framework-injected, optional)",
 *   "agent_type": "agent-name (framework-injected, optional)"
 * }
 */

import { readFileSync } from "node:fs";

// coordinator が直接編集してよいファイルパターン
export const WHITELIST = [
  /\/\.claude\/harness\//,  // .claude/harness/ 配下（session-feedback.jsonl 等の運用ファイル）
  /\/HANDOVER\.md$/,      // HANDOVER.md
  /\/CLAUDE\.md$/,        // CLAUDE.md
  /\/requirements\//,     // requirements/ 配下（要件ドキュメントはメインセッションの責務）
  // design/planning スキルがメインセッションに書かせる指示になっているため
  /\/docs\/design\//,     // docs/design/ 配下（design.md はメインセッションの責務）
  /\/docs\/decisions\//,  // docs/decisions/ 配下（ADR はメインセッションの責務）
  /\/docs\/plans\//,      // docs/plans/ 配下（plan.md はメインセッションの責務）
  /\/\.ralph\/config\.json$/,  // .ralph/config.json（planning スキルが Autonomous mode 時に生成）
];

if (import.meta.url === `file://${process.argv[1]}`) {
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
    const hints = [
      "docs/plans/", "docs/design/", "docs/decisions/",
      "requirements/", ".claude/harness/", ".ralph/config.json",
    ].filter((p) => filePath.includes(p.replace(/\/$/, "")));
    const hintMsg = hints.length > 0
      ? `\nヒント: ${hints[0]} への書き込みはホワイトリスト済みです。パスを確認してください。`
      : "\nヒント: docs/plans/, docs/design/, requirements/ 等はホワイトリスト済みです。";
    console.error(
      `[harness] コーディネーターは直接コードを書けません。implementer エージェントにディスパッチしてください。\n対象ファイル: ${filePath}${hintMsg}`,
    );
    process.exit(2);
  } catch (err) {
    console.error(`[coordinator-write-guard] ${err.message}`);
    process.exit(2);
  }
}
