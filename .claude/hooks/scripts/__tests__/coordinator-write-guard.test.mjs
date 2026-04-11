/**
 * coordinator-write-guard.mjs のテスト
 *
 * スクリプトをサブプロセスで起動し、stdin に JSON を渡して終了コードを検証する。
 * - 終了コード 0: 許可
 * - 終了コード 2: ブロック
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../coordinator-write-guard.mjs");

/**
 * スクリプトに JSON を渡して実行し、終了コードを返す
 */
function runGuard(input) {
  const result = spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf-8",
  });
  return result.status;
}

// --- サブエージェントからの呼び出しは常に許可 ---

describe("サブエージェントからの呼び出し", () => {
  it("agent_id があれば許可（exit 0）", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/src/any-file.ts" },
      agent_id: "implementer-001",
    });
    assert.equal(status, 0);
  });

  it("agent_type があれば許可（exit 0）", () => {
    const status = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "/project/src/any-file.ts" },
      agent_type: "implementer",
    });
    assert.equal(status, 0);
  });
});

// --- coordinator（agent_id/agent_type なし）のホワイトリスト ---

describe("coordinator からの書き込み - ホワイトリスト（許可）", () => {
  it(".claude/harness/ 配下は許可", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/.claude/harness/session-feedback.jsonl" },
    });
    assert.equal(status, 0);
  });

  it("HANDOVER.md は許可", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/HANDOVER.md" },
    });
    assert.equal(status, 0);
  });

  it("CLAUDE.md は許可", () => {
    const status = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "/project/CLAUDE.md" },
    });
    assert.equal(status, 0);
  });

  it("requirements/ 配下は許可", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/requirements/REQ-001/requirements.md" },
    });
    assert.equal(status, 0);
  });

  // design/planning スキルがメインセッションに書かせる指示になっているため追加
  it("docs/design/ 配下は許可", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/docs/design/foo.md" },
    });
    assert.equal(status, 0);
  });

  it("docs/decisions/ 配下は許可", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/docs/decisions/0001-foo.md" },
    });
    assert.equal(status, 0);
  });

  it("docs/plans/ 配下は許可", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/docs/plans/foo-plan.md" },
    });
    assert.equal(status, 0);
  });
});

// --- coordinator からの書き込み - ブロック対象 ---

describe("coordinator からの書き込み - ブロック", () => {
  it("src/ 配下のコードファイルはブロック（exit 2）", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/src/index.ts" },
    });
    assert.equal(status, 2);
  });

  it(".claude/hooks/scripts/ 配下はブロック（exit 2）", () => {
    const status = runGuard({
      tool_name: "Edit",
      tool_input: { file_path: "/project/.claude/hooks/scripts/some-hook.mjs" },
    });
    assert.equal(status, 2);
  });

  it("docs/ 直下のファイルはブロック（exit 2）", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/docs/other.md" },
    });
    assert.equal(status, 2);
  });

  it("docs/guides/ 配下はブロック（exit 2）", () => {
    const status = runGuard({
      tool_name: "Write",
      tool_input: { file_path: "/project/docs/guides/getting-started.md" },
    });
    assert.equal(status, 2);
  });
});

// --- 不正入力 ---

describe("不正入力", () => {
  it("JSON パース失敗は exit 2", () => {
    const result = spawnSync("node", [SCRIPT], {
      input: "not-json",
      encoding: "utf-8",
    });
    assert.equal(result.status, 2);
  });
});
