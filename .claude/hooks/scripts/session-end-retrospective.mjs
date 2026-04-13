#!/usr/bin/env node

/**
 * session-end-retrospective.mjs
 *
 * SessionEnd フック。セッション終了時に retrospective スキルの実行リマインダーを表示する。
 * スキル自体の自動実行ではなく、ユーザーへのリマインダー。
 *
 * 条件: session-tool-log.jsonl または workflow-events.jsonl にエントリがある場合のみ。
 * 注意: これらのファイルは append-only で複数セッションをまたいで蓄積される。
 * 前セッションの残存エントリがある場合、コード変更がなくてもリマインダーが表示される。
 * stderr → ユーザへのメッセージとして表示される。
 */

import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  let cwd = process.cwd();
  try {
    const input = JSON.parse(readFileSync(0, "utf-8"));
    cwd = input.cwd || cwd;
  } catch {
    // stdin が提供されない場合は process.cwd() を使用
  }

  const toolLogFile = resolve(cwd, ".claude/harness/session-tool-log.jsonl");
  const workflowEventsFile = resolve(cwd, ".claude/harness/workflow-events.jsonl");

  const hasToolLog = existsSync(toolLogFile) && statSync(toolLogFile).size > 0;
  const hasWorkflowEvents = existsSync(workflowEventsFile) && statSync(workflowEventsFile).size > 0;

  if (!hasToolLog && !hasWorkflowEvents) {
    process.exit(0);
  }

  console.error(
    "[harness] セッション終了: retrospective スキルを実行してワークフロー遵守の振り返りを行ってください。",
  );
} catch (err) {
  console.error(`[session-end-retrospective] ${err.message}`);
  process.exit(0);
}
