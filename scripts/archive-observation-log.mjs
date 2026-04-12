#!/usr/bin/env node
/**
 * archive-observation-log.mjs
 *
 * .claude/harness/observation-log.jsonl のエントリを
 * .claude/harness/observation-log-archive.jsonl に移動する。
 *
 * 動作:
 *   1. observation-log.jsonl を読む
 *   2. 全エントリを observation-log-archive.jsonl に追記する
 *   3. observation-log.jsonl を空にする
 *   4. "Archived N entries" を stdout に出力する
 */

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const harnessDir =
  process.env.HARNESS_DIR ||
  join(process.cwd(), ".claude", "harness");

const logPath = join(harnessDir, "observation-log.jsonl");
const archivePath = join(harnessDir, "observation-log-archive.jsonl");

async function main() {
  // observation-log.jsonl を読む
  let content = "";
  try {
    content = await readFile(logPath, "utf-8");
  } catch {
    // ファイルが存在しない場合は空として扱う
    content = "";
  }

  const lines = content.split("\n").filter((line) => line.trim());

  // エントリがある場合のみ archive に追記する
  if (lines.length > 0) {
    const appendContent = lines.join("\n") + "\n";
    await appendFile(archivePath, appendContent, "utf-8");
  }

  // observation-log.jsonl を空にする
  await writeFile(logPath, "", "utf-8");

  process.stdout.write(`Archived ${lines.length} entries\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
