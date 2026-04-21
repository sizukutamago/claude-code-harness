/**
 * migrate-review-findings.test.mjs
 *
 * TDD テスト: scripts/migrate-review-findings.mjs の初回マイグレーション機能
 *
 * テストケース 1-8 は全て AC 由来（Task-6 の指定テストケース）
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";

import { migrate } from "../migrate-review-findings.mjs";
import { createTmpContext } from "./_helpers.mjs";

// --- テスト用ヘルパー ---

const ctx = createTmpContext();
const setup = ctx.setup;
const teardown = ctx.teardown;
const tmpPath = ctx.tmpPath;

// --- TC-1: findings 基本マイグレーション ---

describe("migrate: findings basic migration", () => {
  before(setup);
  after(teardown);

  it("TC-1: assigns rf-001/rf-002/rf-003 and cluster_id=null to 3 entries without id/cluster_id", async () => {
    const findingsPath = tmpPath("findings-basic.jsonl");
    const conventionsPath = tmpPath("conventions-basic.md");

    const entries = [
      { date: "2026-01-01", project: "test", reviewer: "quality", severity: "MUST", category: "cat-a", pattern: "pattern-a", suggestion: "fix-a", file: "a.ts" },
      { date: "2026-01-02", project: "test", reviewer: "security", severity: "SHOULD", category: "cat-b", pattern: "pattern-b", suggestion: "fix-b", file: "b.ts" },
      { date: "2026-01-03", project: "test", reviewer: "spec", severity: "CONSIDER", category: "cat-c", pattern: "pattern-c", suggestion: "fix-c", file: "c.ts" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "");

    const result = await migrate({ findingsPath, conventionsPath });

    assert.equal(result.findingsMigrated, 3);

    const content = await readFile(findingsPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((l) => JSON.parse(l));

    assert.equal(parsed[0].id, "rf-001");
    assert.equal(parsed[1].id, "rf-002");
    assert.equal(parsed[2].id, "rf-003");
    assert.equal(parsed[0].cluster_id, null);
    assert.equal(parsed[1].cluster_id, null);
    assert.equal(parsed[2].cluster_id, null);
  });
});

// --- TC-2: 既存の id を保持 ---

describe("migrate: preserves existing ids", () => {
  before(setup);
  after(teardown);

  it("TC-2: does not overwrite existing ids; new ids start from max+1", async () => {
    const findingsPath = tmpPath("findings-existing-id.jsonl");
    const conventionsPath = tmpPath("conventions-existing-id.md");

    const entries = [
      { id: "rf-002", date: "2026-01-01", project: "test", reviewer: "quality", severity: "MUST", category: "cat-a", pattern: "pattern-a", suggestion: "fix-a", file: "a.ts" },
      { date: "2026-01-02", project: "test", reviewer: "security", severity: "SHOULD", category: "cat-b", pattern: "pattern-b", suggestion: "fix-b", file: "b.ts" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "");

    await migrate({ findingsPath, conventionsPath });

    const content = await readFile(findingsPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((l) => JSON.parse(l));

    // rf-002 は保持され、新規は rf-003 から採番される
    assert.equal(parsed[0].id, "rf-002");
    assert.equal(parsed[1].id, "rf-003");
  });
});

// --- TC-3: findings が存在しない ---

describe("migrate: findings file does not exist", () => {
  before(setup);
  after(teardown);

  it("TC-3: skips without error when findings file does not exist", async () => {
    const findingsPath = tmpPath("nonexistent-findings.jsonl");
    const conventionsPath = tmpPath("conventions-nonexistent-findings.md");
    await writeFile(conventionsPath, "");

    const result = await migrate({ findingsPath, conventionsPath });

    assert.equal(result.findingsMigrated, 0);
    // ファイルが作成されていないことを確認
    let exists = false;
    try {
      await readFile(findingsPath, "utf-8");
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false);
  });
});

// --- TC-4: conventions マーカー追加 ---

describe("migrate: conventions marker insertion", () => {
  before(setup);
  after(teardown);

  it("TC-4: inserts MANUAL/AUTO markers and preserves existing content in MANUAL section", async () => {
    const findingsPath = tmpPath("findings-markers.jsonl");
    const conventionsPath = tmpPath("conventions-markers.md");

    const existingContent = "# Review Conventions\n\n## Some Rule\n\n- Rule 1\n";
    await writeFile(findingsPath, "");
    await writeFile(conventionsPath, existingContent);

    const result = await migrate({ findingsPath, conventionsPath });

    assert.equal(result.conventionsMigrated, true);

    const content = await readFile(conventionsPath, "utf-8");
    assert.ok(content.includes("<!-- MANUAL:START -->"), "should contain MANUAL:START");
    assert.ok(content.includes("<!-- MANUAL:END -->"), "should contain MANUAL:END");
    assert.ok(content.includes("<!-- AUTO:START -->"), "should contain AUTO:START");
    assert.ok(content.includes("<!-- AUTO:END -->"), "should contain AUTO:END");

    // 既存コンテンツが MANUAL セクション内に保持される
    const manualStart = content.indexOf("<!-- MANUAL:START -->") + "<!-- MANUAL:START -->".length;
    const manualEnd = content.indexOf("<!-- MANUAL:END -->");
    const manualContent = content.slice(manualStart, manualEnd);
    assert.ok(manualContent.includes("# Review Conventions"), "existing title in MANUAL");
    assert.ok(manualContent.includes("## Some Rule"), "existing section in MANUAL");
    assert.ok(manualContent.includes("- Rule 1"), "existing rule in MANUAL");
  });
});

// --- TC-5: 既にマーカーがある場合の冪等性 ---

describe("migrate: conventions idempotency when markers already present", () => {
  before(setup);
  after(teardown);

  it("TC-5: does not modify conventions.md when markers already present", async () => {
    const findingsPath = tmpPath("findings-idempotent-conv.jsonl");
    const conventionsPath = tmpPath("conventions-idempotent.md");

    const markedContent = "<!-- MANUAL:START -->\n# Existing\n<!-- MANUAL:END -->\n\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n";
    await writeFile(findingsPath, "");
    await writeFile(conventionsPath, markedContent);

    const result = await migrate({ findingsPath, conventionsPath });

    assert.equal(result.conventionsMigrated, false);

    const afterContent = await readFile(conventionsPath, "utf-8");
    assert.equal(afterContent, markedContent, "content should be byte-identical");
  });
});

// --- TC-6: findings 冪等性 ---

describe("migrate: findings idempotency", () => {
  before(setup);
  after(teardown);

  it("TC-6: does not change findings when all entries already have id and cluster_id", async () => {
    const findingsPath = tmpPath("findings-idempotent.jsonl");
    const conventionsPath = tmpPath("conventions-idempotent-findings.md");

    const entries = [
      { id: "rf-001", cluster_id: null, date: "2026-01-01", project: "test", reviewer: "quality", severity: "MUST", category: "cat-a", pattern: "pattern-a", suggestion: "fix-a", file: "a.ts" },
      { id: "rf-002", cluster_id: "c-001", date: "2026-01-02", project: "test", reviewer: "security", severity: "SHOULD", category: "cat-b", pattern: "pattern-b", suggestion: "fix-b", file: "b.ts" },
    ];
    const originalContent = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(findingsPath, originalContent);
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    const result = await migrate({ findingsPath, conventionsPath });

    assert.equal(result.findingsMigrated, 0);

    const afterContent = await readFile(findingsPath, "utf-8");
    assert.equal(afterContent, originalContent, "findings content should be byte-identical");
  });
});

// --- TC-7: conventions が存在しない ---

describe("migrate: conventions file does not exist", () => {
  before(setup);
  after(teardown);

  it("TC-7: skips conventions without error when file does not exist", async () => {
    const findingsPath = tmpPath("findings-nonexistent-conv.jsonl");
    const conventionsPath = tmpPath("nonexistent-conventions.md");
    await writeFile(findingsPath, "");

    const result = await migrate({ findingsPath, conventionsPath });

    assert.equal(result.conventionsMigrated, false);
    // ファイルが作成されていないことを確認
    let exists = false;
    try {
      await readFile(conventionsPath, "utf-8");
      exists = true;
    } catch {
      exists = false;
    }
    assert.equal(exists, false);
  });
});

// --- TC-8: 内容保持 ---

describe("migrate: field preservation after migration", () => {
  before(setup);
  after(teardown);

  it("TC-8: all existing fields are preserved after migration", async () => {
    const findingsPath = tmpPath("findings-preserve-fields.jsonl");
    const conventionsPath = tmpPath("conventions-preserve-fields.md");

    const originalEntry = {
      date: "2026-03-15",
      project: "my-project",
      reviewer: "quality",
      severity: "MUST",
      category: "error-handling",
      pattern: "missing null check",
      suggestion: "add null guard",
      file: "src/utils/parser.ts",
    };
    await writeFile(findingsPath, JSON.stringify(originalEntry) + "\n");
    await writeFile(conventionsPath, "");

    await migrate({ findingsPath, conventionsPath });

    const content = await readFile(findingsPath, "utf-8");
    const parsed = JSON.parse(content.trim());

    assert.equal(parsed.date, originalEntry.date);
    assert.equal(parsed.project, originalEntry.project);
    assert.equal(parsed.reviewer, originalEntry.reviewer);
    assert.equal(parsed.severity, originalEntry.severity);
    assert.equal(parsed.category, originalEntry.category);
    assert.equal(parsed.pattern, originalEntry.pattern);
    assert.equal(parsed.suggestion, originalEntry.suggestion);
    assert.equal(parsed.file, originalEntry.file);
    // 新規フィールドも付与されている
    assert.equal(parsed.id, "rf-001");
    assert.equal(parsed.cluster_id, null);
  });
});
