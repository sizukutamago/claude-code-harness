/**
 * ralph-plan-mutation.mjs のテスト
 *
 * PostToolUse hook。Autonomous mode 時に plan.md の
 * チェックボックス以外の変更をブロックする。
 * - 終了コード 0: 許可
 * - 終了コード 2: ブロック（RALPH_PLAN_MUTATION_VIOLATION）
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../ralph-plan-mutation.mjs");

let tmpDir;

function setupConfig(config) {
  const ralphDir = join(tmpDir, ".ralph");
  mkdirSync(ralphDir, { recursive: true });
  writeFileSync(join(ralphDir, "config.json"), JSON.stringify(config));
}

function removeConfig() {
  const ralphDir = join(tmpDir, ".ralph");
  if (existsSync(ralphDir)) rmSync(ralphDir, { recursive: true });
}

function runMutationCheck(input, cwd = tmpDir) {
  const result = spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    cwd,
  });
  return { status: result.status, stderr: result.stderr };
}

const PLAN_REL_PATH = "docs/plans/test-plan.md";

const AUTONOMOUS_CONFIG = {
  schema_version: "1.0",
  plan_id: "test",
  branch_name: "ralph/test",
  mode: "autonomous",
  references: {
    requirements: "requirements/REQ-001/requirements.md",
    design: "docs/design/test.md",
    plan: PLAN_REL_PATH,
  },
  scope: {
    allowed_paths: ["src/**"],
    forbidden_paths: [".claude/**"],
    max_files_changed: 30,
  },
  stop_conditions: { max_iter: 10, no_progress_iter: 3, same_error_iter: 5, test_only_ratio_threshold: 0.3, time_budget_seconds: 7200 },
  gates: { quality: ["00-test.sh"], reviewers: ["spec-compliance"], enforce_review_memory_hot: true },
  exit_signal: { required: true, marker: "EXIT_SIGNAL" },
};

before(() => {
  tmpDir = join(tmpdir(), `ralph-plan-mutation-test-${Date.now()}`);
  mkdirSync(join(tmpDir, "docs/plans"), { recursive: true });
});

after(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

// --- config なし ---

describe("config なし（非 Autonomous）", () => {
  before(() => removeConfig());

  it(".ralph/config.json が存在しない場合は許可（exit 0）", () => {
    const { status } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        old_string: "# Plan\n- [ ] Task 1",
        new_string: "# New Plan\n- [x] Task 1",
      },
    });
    assert.equal(status, 0);
  });
});

// --- Interactive mode ---

describe("Interactive mode", () => {
  before(() => setupConfig({ ...AUTONOMOUS_CONFIG, mode: "interactive" }));

  it("mode が interactive の場合は許可（exit 0）", () => {
    const { status } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        old_string: "- [ ] Task 1",
        new_string: "- [x] Task 1 changed description",
      },
    });
    assert.equal(status, 0);
  });
});

// --- Autonomous: 対象外ファイル ---

describe("Autonomous mode — plan.md 以外のファイル", () => {
  before(() => setupConfig(AUTONOMOUS_CONFIG));

  it("plan.md 以外のファイルへの変更は許可（exit 0）", () => {
    const { status } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, "src/app.ts"),
        old_string: "const x = 1;",
        new_string: "const x = 2;",
      },
    });
    assert.equal(status, 0);
  });
});

// --- Autonomous: チェックボックスのみの変更 ---

describe("Autonomous mode — チェックボックスのみの変更", () => {
  before(() => setupConfig(AUTONOMOUS_CONFIG));

  it("[ ] → [x] の変更のみは許可（exit 0）", () => {
    const { status } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        old_string: "- [ ] Task 1\n- [ ] Task 2",
        new_string: "- [x] Task 1\n- [ ] Task 2",
      },
    });
    assert.equal(status, 0);
  });

  it("[x] → [ ] の変更のみは許可（exit 0）", () => {
    const { status } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        old_string: "- [x] Task 1",
        new_string: "- [ ] Task 1",
      },
    });
    assert.equal(status, 0);
  });
});

// --- Autonomous: チェックボックス以外の変更 ---

describe("Autonomous mode — チェックボックス以外の変更（ブロック）", () => {
  before(() => setupConfig(AUTONOMOUS_CONFIG));

  it("テキスト変更はブロック（exit 2）", () => {
    const { status, stderr } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        old_string: "- [ ] Task 1",
        new_string: "- [x] Task 1 — modified description",
      },
    });
    assert.equal(status, 2);
    assert.ok(stderr.includes("RALPH_PLAN_MUTATION_VIOLATION"));
  });

  it("行追加はブロック（exit 2）", () => {
    const { status, stderr } = runMutationCheck({
      tool_name: "Edit",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        old_string: "- [ ] Task 1",
        new_string: "- [ ] Task 1\n- [ ] Task 2 new",
      },
    });
    assert.equal(status, 2);
    assert.ok(stderr.includes("RALPH_PLAN_MUTATION_VIOLATION"));
  });

  it("Write 操作はブロック（exit 2）", () => {
    const { status, stderr } = runMutationCheck({
      tool_name: "Write",
      tool_input: {
        file_path: join(tmpDir, PLAN_REL_PATH),
        content: "# Rewritten Plan\n- [ ] Task 1",
      },
    });
    assert.equal(status, 2);
    assert.ok(stderr.includes("RALPH_PLAN_MUTATION_VIOLATION"));
  });
});
