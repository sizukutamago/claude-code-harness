#!/usr/bin/env node

/**
 * session-end-retrospective.mjs
 *
 * SessionEnd フック。セッション終了時に retrospective スキルの実行を促す。
 * retrospective SKILL.md の「セッション終了時に自動起動」を実現。
 *
 * 条件: session-tool-log.jsonl にエントリがある場合のみ（= セッション中に Edit/Write があった）
 * stderr → ユーザへのメッセージとして表示される。
 */

import { existsSync, statSync } from "node:fs";

try {
  const logFile = ".harness/session-tool-log.jsonl";

  if (!existsSync(logFile) || statSync(logFile).size === 0) {
    process.exit(0);
  }

  console.error(
    "[harness] セッション終了: retrospective スキルを実行してワークフロー遵守の振り返りを行ってください。",
  );
} catch (err) {
  console.error(`[session-end-retrospective] ${err.message}`);
  process.exit(0);
}
