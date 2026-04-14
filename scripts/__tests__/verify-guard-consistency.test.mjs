/**
 * verify-guard-consistency.test.mjs
 *
 * TDD テスト: scripts/verify-guard-consistency.mjs
 *
 * AC-1: 正常系 — 全パスが WHITELIST に含まれる → exit 0 + 成功メッセージ
 * AC-2: 異常系 1 — skill に「docs/design/ を書く」指示があるが WHITELIST に docs/design/ がない → exit 1 + 不整合メッセージ
 * AC-3: 異常系 2 — WHITELIST が空 + skill が requirements/ を参照 → exit 1
 * AC-4: 境界値 — WHITELIST が完全一致 (requirements/) のとき skill の requirements/REQ-001/ 記述も OK 判定
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const verifyGuardScript = resolve(process.cwd(), "scripts/verify-guard-consistency.mjs");

/**
 * verify-guard-consistency.mjs をプロジェクトルートを変えて実行するヘルパー
 */
async function runVerifyGuard(projectRoot) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [verifyGuardScript], {
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
 * テスト用の最小限ディレクトリ構造を作成する。
 *
 * @param {string} root - 一時ディレクトリのルートパス
 * @param {object} options
 * @param {string[]} options.whitelist - WHITELIST に含めるパス文字列。
 *   例: ["requirements/", "docs/design/"] → /\/requirements\// などに変換される
 * @param {object} options.skills - { "skill-name": "SKILL.md の内容" } 形式
 * @param {object} options.agents - { "agent-name": "agent.md の内容" } 形式（省略可）
 */
async function createTestFixture(root, { whitelist = [], skills = {}, agents = {} }) {
  // .claude/hooks/scripts/coordinator-write-guard.mjs を作成
  const scriptsDir = join(root, ".claude", "hooks", "scripts");
  await mkdir(scriptsDir, { recursive: true });

  // パス文字列を正規表現リテラル文字列に変換する
  // 例: "requirements/" → /\/requirements\//
  const whitelistLines = whitelist
    .map((p) => {
      // スラッシュをエスケープして正規表現パターンとして埋め込む
      const escaped = p.replace(/\//g, "\\/");
      return `  new RegExp("\\/${escaped}"),`;
    })
    .join("\n");

  const guardContent = `#!/usr/bin/env node
export const WHITELIST = [
${whitelistLines}
];
// 既存の実行ロジック（スタブ）
`;
  await writeFile(join(scriptsDir, "coordinator-write-guard.mjs"), guardContent);

  // .claude/skills/ にスキルを作成
  for (const [skillName, content] of Object.entries(skills)) {
    const skillDir = join(root, ".claude", "skills", skillName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), content);
  }

  // .claude/agents/ にエージェントを作成
  const agentsDir = join(root, ".claude", "agents");
  await mkdir(agentsDir, { recursive: true });
  for (const [agentName, content] of Object.entries(agents)) {
    await writeFile(join(agentsDir, `${agentName}.md`), content);
  }
}

// AC-1: 正常系 — 全パスが WHITELIST に含まれる
describe("verify-guard-consistency: 正常系", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vgc-pass-"));
    await createTestFixture(tmpDir, {
      whitelist: ["requirements/", "docs\\/design\\/", "docs\\/decisions\\/", "docs\\/plans\\/"],
      skills: {
        design: "# Design\n\nメインセッションが docs/design/ を作成する。",
        planning: "# Planning\n\nメインセッションが docs/plans/ を作成する。",
        requirements: "# Requirements\n\nメインセッションが requirements/ を作成する。",
      },
    });
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("AC-1: 全パスが WHITELIST に含まれる場合は exit 0", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.equal(result.code, 0, `exit code が 0 であること。stderr: ${result.stderr}`);
  });

  it("AC-1: 成功時に 'すべて' を含む成功メッセージを stdout に出力する", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.ok(
      result.stdout.includes("すべて"),
      `stdout に成功メッセージが含まれること。stdout: ${result.stdout}`,
    );
  });

  it("AC-1: 成功メッセージにチェック件数が含まれる", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.match(
      result.stdout,
      /\d+\s*件/,
      `stdout にチェック件数が含まれること。stdout: ${result.stdout}`,
    );
  });
});

// AC-2: 異常系 1 — WHITELIST に docs/design/ がない
describe("verify-guard-consistency: 異常系 1 — WHITELIST 未登録パス", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vgc-fail1-"));
    await createTestFixture(tmpDir, {
      whitelist: ["requirements/"],
      // docs/design/ は WHITELIST にない
      skills: {
        design: "# Design\n\nメインセッションが docs/design/ を作成する。",
        planning: "# Planning\n\nメインセッションが docs/plans/ を作成する。",
      },
    });
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("AC-2: WHITELIST 未登録パスがある場合は exit 1", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.equal(result.code, 1, `exit code が 1 であること。stdout: ${result.stdout}`);
  });

  it("AC-2: 不整合メッセージが stderr に出力される", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.ok(
      result.stderr.length > 0,
      `stderr に出力があること。stderr: ${result.stderr}`,
    );
  });

  it("AC-2: 不整合メッセージに対象のスキルファイル名が含まれる", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.ok(
      result.stderr.includes("design") || result.stderr.includes("SKILL.md"),
      `stderr にスキルファイル名が含まれること。stderr: ${result.stderr}`,
    );
  });

  it("AC-2: 不整合メッセージに未登録のパスが含まれる", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.ok(
      result.stderr.includes("docs/design/") || result.stderr.includes("docs/plans/"),
      `stderr に未登録パスが含まれること。stderr: ${result.stderr}`,
    );
  });
});

// AC-3: 異常系 2 — WHITELIST が空で skill が requirements/ を参照
describe("verify-guard-consistency: 異常系 2 — WHITELIST が空", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vgc-fail2-"));
    await createTestFixture(tmpDir, {
      whitelist: [],
      skills: {
        requirements: "# Requirements\n\nメインセッションが requirements/ を作成する。",
      },
    });
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("AC-3: WHITELIST が空で参照パスがある場合は exit 1", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.equal(result.code, 1, `exit code が 1 であること。stdout: ${result.stdout}`);
  });

  it("AC-3: requirements/ が不整合として報告される", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.ok(
      result.stderr.includes("requirements/"),
      `stderr に requirements/ が含まれること。stderr: ${result.stderr}`,
    );
  });
});

// AC-4: 境界値 — WHITELIST が requirements/ で skill が requirements/REQ-001/ を記述
describe("verify-guard-consistency: 境界値 — プレフィックス一致", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vgc-boundary-"));
    await createTestFixture(tmpDir, {
      whitelist: ["requirements/"],
      skills: {
        requirements: "# Requirements\n\nメインセッションが requirements/REQ-001/ を作成する。",
      },
    });
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("AC-4: WHITELIST に requirements/ があれば requirements/REQ-001/ も OK 判定 → exit 0", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.equal(
      result.code,
      0,
      `exit code が 0 であること（プレフィックス一致）。stderr: ${result.stderr}`,
    );
  });
});

// 追加テスト: キーワードが含まれない行は無視される
describe("verify-guard-consistency: キーワード外の行は無視", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vgc-keyword-"));
    await createTestFixture(tmpDir, {
      whitelist: ["requirements/"],
      skills: {
        // キーワードを含まない行に docs/design/ があっても無視される
        // キーワード行: 「メインセッションが requirements/ を担当する。」（docs/design/ は含まない）
        // 非キーワード行: 「設計は docs/design/ に保存される。」（キーワードなし）
        design: [
          "# Design",
          "",
          "メインセッションが requirements/ を担当する。",
          "",
          "設計は docs/design/ に保存される。",
          "",
          "コメント: docs/unrelated/ はスコープ外。",
        ].join("\n"),
      },
    });
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("キーワードを含まない行のパスは不整合として扱われない", async () => {
    const result = await runVerifyGuard(tmpDir);
    // キーワード行（「メインセッションが requirements/ を担当する。」）には requirements/ があり WHITELIST に含まれる
    // 非キーワード行（「設計は docs/design/ に保存される。」）は対象外 → docs/design/ は無視
    assert.equal(result.code, 0, `exit code が 0 であること。stderr: ${result.stderr}`);
  });
});

// 追加テスト: agents/*.md も検索対象に含まれる
describe("verify-guard-consistency: agents/*.md も検索対象", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vgc-agents-"));
    await createTestFixture(tmpDir, {
      whitelist: ["requirements/"],
      skills: {},
      agents: {
        "test-agent": "# Test Agent\n\nメインセッションが docs/design/ に書く。",
      },
    });
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("エージェント定義の WHITELIST 未登録パスも不整合として検出される", async () => {
    const result = await runVerifyGuard(tmpDir);
    assert.equal(result.code, 1, `exit code が 1 であること。stdout: ${result.stdout}`);
    assert.ok(
      result.stderr.includes("docs/design/"),
      `stderr に docs/design/ が含まれること。stderr: ${result.stderr}`,
    );
  });
});
