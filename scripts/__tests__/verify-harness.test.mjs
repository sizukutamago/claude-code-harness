/**
 * verify-harness.test.mjs
 *
 * TDD テスト: scripts/verify-harness.mjs の各チェック項目の正常系・異常系
 *
 * AC-C1: hooks が全て settings.json に定義されているか
 * AC-C2: hook スクリプトが全て存在するか
 * AC-C3: エージェント定義が最低18個存在するか
 * AC-C4: スキル定義ディレクトリが存在するか
 * AC-C5: ルール定義が存在するか
 * AC-C6: review-memory が初期化されているか
 * AC-C7: last-verification.json が存在し必須フィールドを持つか
 * AC-C8: 全チェック通過で status: "PASS" を出力
 * AC-C9: チェック失敗で status: "FAIL" を出力し failures に列挙
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const verifyHarnessScript = resolve(process.cwd(), "scripts/verify-harness.mjs");

async function runVerifyHarness(projectRoot) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [verifyHarnessScript], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.end();
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

/**
 * テスト用の最小限 .claude/ 構造を作成する。
 * 全チェックが PASS するための完全セット。
 */
async function createMinimalHarness(root) {
  // .claude/settings.json with all expected hooks
  await mkdir(join(root, ".claude"), { recursive: true });
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Edit|Write|MultiEdit|NotebookEdit",
          hooks: [
            { type: "command", command: "node .claude/hooks/scripts/coordinator-write-guard.mjs" },
            { type: "command", command: "node .claude/hooks/scripts/secret-scanner.mjs" },
          ],
        },
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: "node .claude/hooks/scripts/verification-gate.mjs" },
            { type: "command", command: "node .claude/hooks/scripts/post-verification-scan.mjs" },
            { type: "command", command: "node .claude/hooks/scripts/feedback-staleness-check.mjs" },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write|MultiEdit|NotebookEdit",
          hooks: [
            { type: "command", command: "node .claude/hooks/scripts/post-tool-log.mjs" },
          ],
        },
        {
          matcher: "Agent",
          hooks: [
            { type: "command", command: "node .claude/hooks/scripts/workflow-event-logger.mjs" },
          ],
        },
      ],
      PermissionDenied: [
        {
          hooks: [
            { type: "command", command: "node .claude/hooks/scripts/permission-denied-recorder.mjs" },
          ],
        },
      ],
      SessionEnd: [
        {
          hooks: [
            { type: "command", command: "node .claude/hooks/scripts/session-end-retrospective.mjs" },
          ],
        },
      ],
    },
  };
  await writeFile(join(root, ".claude", "settings.json"), JSON.stringify(settings, null, 2));

  // hook スクリプトのスタブ
  const scriptsDir = join(root, ".claude", "hooks", "scripts");
  await mkdir(scriptsDir, { recursive: true });
  const expectedScripts = [
    "coordinator-write-guard.mjs",
    "secret-scanner.mjs",
    "verification-gate.mjs",
    "post-verification-scan.mjs",
    "feedback-staleness-check.mjs",
    "post-tool-log.mjs",
    "workflow-event-logger.mjs",
    "permission-denied-recorder.mjs",
    "session-end-retrospective.mjs",
  ];
  for (const script of expectedScripts) {
    await writeFile(join(scriptsDir, script), "// stub");
  }

  // エージェント定義（20個 + README）
  const agentsDir = join(root, ".claude", "agents");
  await mkdir(agentsDir, { recursive: true });
  const agentNames = [
    "planner", "test-runner", "verifier", "implementer", "simplifier",
    "test-quality-engineer", "spec-compliance-reviewer", "security-reviewer",
    "quality-reviewer", "plan-reviewer", "roadmap-planner", "cleanup-agent",
    "design-reviewer", "docs-integrity-reviewer", "requirements-analyst",
    "review-memory-curator", "doc-maintainer", "improvement-proposer",
    "product-user-reviewer", "harness-user-reviewer",
  ];
  for (const name of agentNames) {
    await writeFile(join(agentsDir, `${name}.md`), `# ${name}`);
  }
  await writeFile(join(agentsDir, "README.md"), "# Agents");

  // スキル定義
  const skillsDir = join(root, ".claude", "skills");
  await mkdir(join(skillsDir, "tdd"), { recursive: true });
  await writeFile(join(skillsDir, "tdd", "SKILL.md"), "# TDD");

  // ルール定義
  const rulesDir = join(root, ".claude", "rules");
  await mkdir(rulesDir, { recursive: true });
  await writeFile(join(rulesDir, "workflow.md"), "# Workflow");

  // review-memory 初期化
  const reviewMemoryDir = join(root, ".claude", "harness", "review-memory");
  await mkdir(reviewMemoryDir, { recursive: true });
  await writeFile(join(reviewMemoryDir, "review-conventions.md"), "# Conventions");
  await writeFile(join(reviewMemoryDir, "review-findings.jsonl"), "");

  // last-verification.json
  const harnessDir = join(root, ".claude", "harness");
  const lastVerification = {
    status: "PASS",
    timestamp: "2026-04-12T00:00:00.000Z",
    req_path: "requirements/REQ-001/",
  };
  await writeFile(
    join(harnessDir, "last-verification.json"),
    JSON.stringify(lastVerification),
  );
}

describe("verify-harness: 全チェック PASS", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "verify-harness-pass-"));
    await createMinimalHarness(tmpDir);
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  // AC-C8: 全チェック通過で status: "PASS"
  it("AC-C8: 全チェック通過時に status: 'PASS' を stdout に出力する", async () => {
    const result = await runVerifyHarness(tmpDir);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "PASS");
    assert.deepEqual(output.failures, []);
  });

  it("AC-C8: 出力に checks 配列が含まれる", async () => {
    const result = await runVerifyHarness(tmpDir);
    const output = JSON.parse(result.stdout);
    assert.ok(Array.isArray(output.checks), "checks は配列である");
    assert.ok(output.checks.length > 0, "checks に要素がある");
  });
});

describe("verify-harness: settings.json の hooks チェック", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "verify-harness-hooks-"));
    await createMinimalHarness(tmpDir);
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  // AC-C1: 期待 hooks が全て settings.json に定義されているか
  it("AC-C1: 期待される hook スクリプト名が全て settings.json に含まれる場合は PASS", async () => {
    const result = await runVerifyHarness(tmpDir);
    const output = JSON.parse(result.stdout);
    const hooksCheck = output.checks.find((c) => c.name === "hooks_defined");
    assert.ok(hooksCheck, "hooks_defined チェックが存在する");
    assert.equal(hooksCheck.status, "PASS");
  });

  it("AC-C1: 期待される hook スクリプトが欠けている場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-missing-hook-"));
    try {
      await createMinimalHarness(badDir);
      // post-tool-log を含まない settings.json に差し替え
      const brokenSettings = {
        hooks: {
          PreToolUse: [],
          PostToolUse: [],
          PermissionDenied: [],
          SessionEnd: [],
        },
      };
      await writeFile(
        join(badDir, ".claude", "settings.json"),
        JSON.stringify(brokenSettings),
      );
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
      assert.ok(output.failures.some((f) => f.includes("post-tool-log")), "failures に post-tool-log が含まれる");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});

describe("verify-harness: hook スクリプトの存在チェック", () => {
  // AC-C2: hook スクリプトが全て存在するか
  it("AC-C2: hook スクリプトファイルが欠けている場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-missing-script-"));
    try {
      await createMinimalHarness(badDir);
      // post-tool-log.mjs を削除
      await rm(join(badDir, ".claude", "hooks", "scripts", "post-tool-log.mjs"));
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
      assert.ok(
        output.failures.some((f) => f.includes("post-tool-log")),
        "failures に post-tool-log が含まれる",
      );
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});

describe("verify-harness: エージェント定義チェック", () => {
  // AC-C3: エージェント定義が最低18個
  it("AC-C3: エージェント定義が18個以上の場合は PASS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-harness-agents-pass-"));
    try {
      await createMinimalHarness(dir);
      const result = await runVerifyHarness(dir);
      const output = JSON.parse(result.stdout);
      const agentsCheck = output.checks.find((c) => c.name === "agents_count");
      assert.ok(agentsCheck, "agents_count チェックが存在する");
      assert.equal(agentsCheck.status, "PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC-C3: エージェント定義が19個以下の場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-agents-fail-"));
    try {
      await createMinimalHarness(badDir);
      // 1つ削除して19個にする
      await rm(join(badDir, ".claude", "agents", "planner.md"));
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
      assert.ok(
        output.failures.some((f) => f.includes("agents")),
        "failures にエージェント関連が含まれる",
      );
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});

describe("verify-harness: スキル定義チェック", () => {
  // AC-C4: スキル定義ディレクトリが存在するか
  it("AC-C4: skills ディレクトリが存在する場合は PASS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-harness-skills-pass-"));
    try {
      await createMinimalHarness(dir);
      const result = await runVerifyHarness(dir);
      const output = JSON.parse(result.stdout);
      const skillsCheck = output.checks.find((c) => c.name === "skills_exist");
      assert.ok(skillsCheck, "skills_exist チェックが存在する");
      assert.equal(skillsCheck.status, "PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC-C4: skills ディレクトリが存在しない場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-skills-fail-"));
    try {
      await createMinimalHarness(badDir);
      await rm(join(badDir, ".claude", "skills"), { recursive: true });
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});

describe("verify-harness: ルール定義チェック", () => {
  // AC-C5: ルール定義が存在するか
  it("AC-C5: rules/*.md が存在する場合は PASS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-harness-rules-pass-"));
    try {
      await createMinimalHarness(dir);
      const result = await runVerifyHarness(dir);
      const output = JSON.parse(result.stdout);
      const rulesCheck = output.checks.find((c) => c.name === "rules_exist");
      assert.ok(rulesCheck, "rules_exist チェックが存在する");
      assert.equal(rulesCheck.status, "PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC-C5: rules ディレクトリが存在しない場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-rules-fail-"));
    try {
      await createMinimalHarness(badDir);
      await rm(join(badDir, ".claude", "rules"), { recursive: true });
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});

describe("verify-harness: review-memory 初期化チェック", () => {
  // AC-C6: review-memory が初期化されているか
  it("AC-C6: review-conventions.md と review-findings.jsonl が存在する場合は PASS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-harness-rm-pass-"));
    try {
      await createMinimalHarness(dir);
      const result = await runVerifyHarness(dir);
      const output = JSON.parse(result.stdout);
      const rmCheck = output.checks.find((c) => c.name === "review_memory_initialized");
      assert.ok(rmCheck, "review_memory_initialized チェックが存在する");
      assert.equal(rmCheck.status, "PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC-C6: review-conventions.md が欠けている場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-rm-fail-"));
    try {
      await createMinimalHarness(badDir);
      await rm(join(badDir, ".claude", "harness", "review-memory", "review-conventions.md"));
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});

describe("verify-harness: last-verification.json チェック", () => {
  // AC-C7: last-verification.json が必須フィールドを持つか
  it("AC-C7: 必須フィールド(status, timestamp, req_path)が揃っている場合は PASS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-harness-lv-pass-"));
    try {
      await createMinimalHarness(dir);
      const result = await runVerifyHarness(dir);
      const output = JSON.parse(result.stdout);
      const lvCheck = output.checks.find((c) => c.name === "last_verification");
      assert.ok(lvCheck, "last_verification チェックが存在する");
      assert.equal(lvCheck.status, "PASS");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("AC-C7: last-verification.json が存在しない場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-lv-missing-"));
    try {
      await createMinimalHarness(badDir);
      await rm(join(badDir, ".claude", "harness", "last-verification.json"));
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });

  it("AC-C7: last-verification.json に必須フィールドが欠けている場合は FAIL になる", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-lv-invalid-"));
    try {
      await createMinimalHarness(badDir);
      // status フィールドのない JSON
      await writeFile(
        join(badDir, ".claude", "harness", "last-verification.json"),
        JSON.stringify({ timestamp: "2026-04-12T00:00:00.000Z" }),
      );
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });

  // AC-C9: FAIL 時に failures に列挙
  it("AC-C9: FAIL 時に failures 配列に失敗理由が記載される", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "verify-harness-failures-"));
    try {
      await createMinimalHarness(badDir);
      await rm(join(badDir, ".claude", "harness", "last-verification.json"));
      const result = await runVerifyHarness(badDir);
      const output = JSON.parse(result.stdout);
      assert.equal(output.status, "FAIL");
      assert.ok(Array.isArray(output.failures), "failures は配列");
      assert.ok(output.failures.length > 0, "failures に要素がある");
    } finally {
      await rm(badDir, { recursive: true, force: true });
    }
  });
});
