/**
 * ralph-scope-enforce.mjs のテスト
 *
 * PreToolUse hook。Autonomous mode 時に scope.allowed_paths / forbidden_paths を enforce する。
 * - 終了コード 0: 許可
 * - 終了コード 2: ブロック
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../ralph-scope-enforce.mjs");

// テスト用の一時ディレクトリ（.ralph/config.json を置く）
let tmpDir;

function setupConfig(config) {
  const ralphDir = join(tmpDir, ".ralph");
  mkdirSync(ralphDir, { recursive: true });
  writeFileSync(join(ralphDir, "config.json"), JSON.stringify(config));
}

function removeConfig() {
  const configPath = join(tmpDir, ".ralph", "config.json");
  if (existsSync(configPath)) rmSync(configPath);
  const ralphDir = join(tmpDir, ".ralph");
  if (existsSync(ralphDir)) rmSync(ralphDir, { recursive: true });
}

function runEnforce(input, cwd = tmpDir) {
  const result = spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf-8",
    cwd,
  });
  return result.status;
}

const AUTONOMOUS_CONFIG = {
  schema_version: "1.0",
  plan_id: "test",
  branch_name: "ralph/test",
  mode: "autonomous",
  references: {
    requirements: "requirements/REQ-001/requirements.md",
    design: "docs/design/test.md",
    plan: "docs/plans/test-plan.md",
  },
  scope: {
    allowed_paths: ["src/**", "tests/**"],
    forbidden_paths: [".claude/**", "docs/decisions/**"],
    max_files_changed: 30,
  },
  stop_conditions: { max_iter: 10, no_progress_iter: 3, same_error_iter: 5, test_only_ratio_threshold: 0.3, time_budget_seconds: 7200 },
  gates: { quality: ["00-test.sh"], reviewers: ["spec-compliance"], enforce_review_memory_hot: true },
  exit_signal: { required: true, marker: "EXIT_SIGNAL" },
};

before(() => {
  tmpDir = join(tmpdir(), `ralph-scope-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

after(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

// --- config なし ---

describe("config なし（非 Autonomous）", () => {
  before(() => removeConfig());

  it(".ralph/config.json が存在しない場合は許可（exit 0）", () => {
    const status = runEnforce({
      tool_name: "Write",
      tool_input: { file_path: join(tmpDir, "anywhere/file.ts") },
    });
    assert.equal(status, 0);
  });
});

// --- Interactive mode ---

describe("Interactive mode", () => {
  before(() => setupConfig({ ...AUTONOMOUS_CONFIG, mode: "interactive" }));

  it("mode が interactive の場合は許可（exit 0）", () => {
    const status = runEnforce({
      tool_name: "Write",
      tool_input: { file_path: join(tmpDir, "src/app.ts") },
    });
    assert.equal(status, 0);
  });
});

// --- Autonomous: allowed path ---

describe("Autonomous mode — allowed_paths に一致", () => {
  before(() => setupConfig(AUTONOMOUS_CONFIG));

  it("src/ 配下への書き込みは許可（exit 0）", () => {
    const status = runEnforce({
      tool_name: "Write",
      tool_input: { file_path: join(tmpDir, "src/components/App.ts") },
    });
    assert.equal(status, 0);
  });

  it("tests/ 配下への書き込みは許可（exit 0）", () => {
    const status = runEnforce({
      tool_name: "Edit",
      tool_input: { file_path: join(tmpDir, "tests/app.test.ts") },
    });
    assert.equal(status, 0);
  });
});

// --- Autonomous: forbidden path ---

describe("Autonomous mode — forbidden_paths に一致", () => {
  before(() => setupConfig(AUTONOMOUS_CONFIG));

  it(".claude/ 配下への書き込みはブロック（exit 2）", () => {
    const status = runEnforce({
      tool_name: "Write",
      tool_input: { file_path: join(tmpDir, ".claude/settings.json") },
    });
    assert.equal(status, 2);
  });

  it("docs/decisions/ 配下への書き込みはブロック（exit 2）", () => {
    const status = runEnforce({
      tool_name: "Edit",
      tool_input: { file_path: join(tmpDir, "docs/decisions/0001-foo.md") },
    });
    assert.equal(status, 2);
  });
});

// --- Autonomous: outside allowed_paths ---

describe("Autonomous mode — allowed_paths の外", () => {
  before(() => setupConfig(AUTONOMOUS_CONFIG));

  it("allowed_paths に含まれないパスへの書き込みはブロック（exit 2）", () => {
    const status = runEnforce({
      tool_name: "Write",
      tool_input: { file_path: join(tmpDir, "docs/design/foo.md") },
    });
    assert.equal(status, 2);
  });
});

// --- 不正 JSON config ---

describe("不正 JSON config", () => {
  before(() => {
    const ralphDir = join(tmpDir, ".ralph");
    mkdirSync(ralphDir, { recursive: true });
    writeFileSync(join(ralphDir, "config.json"), "not-valid-json");
  });

  it(".ralph/config.json が不正 JSON の場合はブロック（exit 2、fail-closed）", () => {
    const status = runEnforce({
      tool_name: "Write",
      tool_input: { file_path: join(tmpDir, "src/app.ts") },
    });
    assert.equal(status, 2);
  });
});
