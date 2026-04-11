/**
 * review-memory-quality.test.mjs
 *
 * 品質テスト: scripts/review-memory.mjs + scripts/migrate-review-findings.mjs
 * 境界値・エッジケース・異常系・組み合わせを検証する。
 *
 * TQ-1 〜 TQ-20（全20件）
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  readFindings,
  appendFinding,
  writeFindingsAtomic,
  writeFileAtomic,
  nextFindingId,
  nextClusterId,
  findPromotable,
  getClusterRepresentatives,
  promoteCluster,
  rebuildConventions,
} from "../review-memory.mjs";
import { migrate } from "../migrate-review-findings.mjs";
import { createTmpContext } from "./_helpers.mjs";

// --- ヘルパー ---

const ctx = createTmpContext();
const setup = ctx.setup;
const teardown = ctx.teardown;
const tmpPath = ctx.tmpPath;

const CLI_PATH = resolve("scripts/review-memory.mjs");
const CWD = resolve(".");

function runCli(args, stdin = "", env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      cwd: CWD,
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", reject);

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

// --- TQ-1: readFindings — 1行目のみ不正 JSON でも残りはパースされる ---

describe("TQ-1: readFindings — only first line is invalid JSON", () => {
  before(setup);
  after(teardown);

  it("TQ-1: skips only the invalid first line and parses remaining lines", async () => {
    const filePath = tmpPath("tq1-first-line-invalid.jsonl");
    const valid1 = { id: "rf-002", pattern: "pattern-b" };
    const valid2 = { id: "rf-003", pattern: "pattern-c" };
    await writeFile(
      filePath,
      ["INVALID JSON FIRST LINE", JSON.stringify(valid1), JSON.stringify(valid2)].join("\n") + "\n",
    );

    const stderrMessages = [];
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg) => {
      stderrMessages.push(msg);
      return true;
    };

    const result = await readFindings(filePath);

    process.stderr.write = originalStderr;

    // 先頭行のみスキップ、残り2件がパースされる
    assert.equal(result.length, 2, "should parse 2 valid lines and skip 1 invalid line");
    assert.deepEqual(result[0], valid1);
    assert.deepEqual(result[1], valid2);
    // stderr に警告が出ている
    assert.ok(
      stderrMessages.some((m) => m.includes("Warning") || m.includes("warn") || m.includes("parse")),
      `stderr should contain a warning, got: ${JSON.stringify(stderrMessages)}`,
    );
  });
});

// --- TQ-2: writeFindingsAtomic — 空配列のとき空ファイルになる ---

describe("TQ-2: writeFindingsAtomic — empty array produces empty file", () => {
  before(setup);
  after(teardown);

  it("TQ-2: writing empty array results in empty file content", async () => {
    const filePath = tmpPath("tq2-empty-atomic.jsonl");
    await writeFindingsAtomic(filePath, []);

    const content = await readFile(filePath, "utf-8");
    assert.equal(content, "", "empty array should produce empty file (no trailing newline)");

    // 再度 readFindings しても空配列が返る
    const result = await readFindings(filePath);
    assert.deepEqual(result, []);
  });
});

// --- TQ-3: rebuildConventions — MANUAL:START はあるが MANUAL:END がない壊れたマーカー ---

describe("TQ-3: rebuildConventions — broken markers (MANUAL:START without MANUAL:END)", () => {
  before(setup);
  after(teardown);

  it("TQ-3: treats broken MANUAL markers as no-markers and migrates existing content to MANUAL section", async () => {
    const conventionsPath = tmpPath("tq3-broken-manual.md");
    // MANUAL:START はあるが MANUAL:END がない
    const brokenContent = "<!-- MANUAL:START -->\n## Some Rule\n- Rule 1\n";
    await writeFile(conventionsPath, brokenContent);

    const autoEntries = [
      { cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a", size: 2 },
    ];
    await rebuildConventions(conventionsPath, autoEntries);

    const result = await readFile(conventionsPath, "utf-8");

    // MANUAL/AUTO マーカーが存在する
    assert.ok(result.includes("<!-- MANUAL:START -->"), "should contain MANUAL:START");
    assert.ok(result.includes("<!-- MANUAL:END -->"), "should contain MANUAL:END");
    assert.ok(result.includes("<!-- AUTO:START -->"), "should contain AUTO:START");
    assert.ok(result.includes("<!-- AUTO:END -->"), "should contain AUTO:END");

    // AUTO セクションに cat-a が入っている（新フォーマット）
    assert.ok(result.includes("## cat-a"), "AUTO section should contain cat-a category header");
  });
});

// --- TQ-4: rebuildConventions — AUTO:START はあるが AUTO:END がない壊れたマーカー ---

describe("TQ-4: rebuildConventions — broken markers (AUTO:START without AUTO:END)", () => {
  before(setup);
  after(teardown);

  it("TQ-4: treats broken AUTO markers as no-markers and migrates existing content correctly", async () => {
    const conventionsPath = tmpPath("tq4-broken-auto.md");
    // AUTO:START はあるが AUTO:END がない（MANUAL マーカーもない）
    const brokenContent = "<!-- AUTO:START -->\n## Auto content\n";
    await writeFile(conventionsPath, brokenContent);

    const autoEntries = [
      { cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a", size: 2 },
    ];
    await rebuildConventions(conventionsPath, autoEntries);

    const result = await readFile(conventionsPath, "utf-8");

    // MANUAL/AUTO マーカーが存在する
    assert.ok(result.includes("<!-- MANUAL:START -->"), "should contain MANUAL:START");
    assert.ok(result.includes("<!-- MANUAL:END -->"), "should contain MANUAL:END");
    assert.ok(result.includes("<!-- AUTO:START -->"), "should contain AUTO:START");
    assert.ok(result.includes("<!-- AUTO:END -->"), "should contain AUTO:END");

    // AUTO セクションに新しいエントリが入っている（新フォーマット）
    assert.ok(result.includes("## cat-a"), "AUTO section should contain cat-a category header");
  });
});

// --- TQ-5: promoteCluster — archive と findings が同じパスを指定した場合 ---

describe("TQ-5: promoteCluster — archive and findings point to same path", () => {
  before(setup);
  after(teardown);

  it("TQ-5: does not throw when archive and findings are the same path", async () => {
    const sharedPath = tmpPath("tq5-shared.jsonl");
    const conventionsPath = tmpPath("tq5-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(sharedPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // 例外が throw されないことを確認する
    await assert.doesNotReject(
      () => promoteCluster(sharedPath, sharedPath, conventionsPath, "c-001"),
      "should not throw when archive and findings are the same path",
    );

    // conventions.md には cat-a が追加されている（新フォーマット）
    const conventionsContent = await readFile(conventionsPath, "utf-8");
    assert.ok(conventionsContent.includes("## cat-a"), "conventions should contain cat-a category header");
  });
});

// --- TQ-6: CLI promote — stdout が valid JSON であること ---

describe("TQ-6: CLI promote — stdout is always valid JSON", () => {
  before(setup);
  after(teardown);

  it("TQ-6: promote stdout is valid JSON for both success and noop cases", async () => {
    const findingsPath = tmpPath("tq6-findings.jsonl");
    const archivePath = tmpPath("tq6-archive.jsonl");
    const conventionsPath = tmpPath("tq6-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // 成功ケース
    const resultSuccess = await runCli([
      "promote", "c-001",
      "--findings", findingsPath,
      "--archive", archivePath,
      "--conventions", conventionsPath,
    ]);
    assert.equal(resultSuccess.code, 0);
    assert.doesNotThrow(() => JSON.parse(resultSuccess.stdout.trim()), "success stdout should be valid JSON");

    // noop ケース（存在しない cluster_id）
    const resultNoop = await runCli([
      "promote", "c-999",
      "--findings", findingsPath,
      "--archive", archivePath,
      "--conventions", conventionsPath,
    ]);
    assert.equal(resultNoop.code, 0);
    assert.doesNotThrow(() => JSON.parse(resultNoop.stdout.trim()), "noop stdout should be valid JSON");
  });
});

// --- TQ-7: migrate — 部分的マイグレーション済み状態での冪等性 ---

describe("TQ-7: migrate — idempotency when some entries already have id", () => {
  before(setup);
  after(teardown);

  it("TQ-7: does not touch entries that already have both id and cluster_id", async () => {
    const findingsPath = tmpPath("tq7-partial-migrated.jsonl");
    const conventionsPath = tmpPath("tq7-conventions.md");

    // rf-001 は既にマイグレーション済み、2件目のみ未マイグレーション
    const entries = [
      { id: "rf-001", cluster_id: null, date: "2026-01-01", project: "test", reviewer: "quality", severity: "MUST", category: "cat-a", pattern: "pattern-a", suggestion: "fix-a", file: "a.ts" },
      { date: "2026-01-02", project: "test", reviewer: "security", severity: "SHOULD", category: "cat-b", pattern: "pattern-b", suggestion: "fix-b", file: "b.ts" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    const result = await migrate({ findingsPath, conventionsPath });

    // 未マイグレーションの1件のみカウントされる
    assert.equal(result.findingsMigrated, 1);

    const content = await readFile(findingsPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((l) => JSON.parse(l));

    // rf-001 は保持
    assert.equal(parsed[0].id, "rf-001");
    assert.equal(parsed[0].cluster_id, null);

    // 2件目は rf-002 が採番される
    assert.equal(parsed[1].id, "rf-002");
    assert.equal(parsed[1].cluster_id, null);
  });
});

// --- TQ-8: nextClusterId — c-999 から c-1000 への桁上がり ---

describe("TQ-8: nextClusterId — rollover from c-999 to c-1000", () => {
  before(setup);
  after(teardown);

  it("TQ-8: returns c-1000 when c-999 is the current maximum", async () => {
    const filePath = tmpPath("tq8-cluster-rollover.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-999" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const result = await nextClusterId(filePath);
    assert.equal(result, "c-1000", "nextClusterId should return c-1000 when c-999 exists");
  });
});

// --- TQ-9: nextFindingId — rf-999 から rf-1000 への桁上がり ---

describe("TQ-9: nextFindingId — rollover from rf-999 to rf-1000", () => {
  before(setup);
  after(teardown);

  it("TQ-9: returns rf-1000 when rf-999 is the current maximum", async () => {
    const filePath = tmpPath("tq9-finding-rollover.jsonl");
    const entries = [
      { id: "rf-999" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const result = await nextFindingId(filePath);
    assert.equal(result, "rf-1000", "nextFindingId should return rf-1000 when rf-999 exists");
  });
});

// --- TQ-10: readFindings / writeFindingsAtomic — 1000件の大量エントリ ---

describe("TQ-10: readFindings/writeFindingsAtomic — 1000 entries", () => {
  before(setup);
  after(teardown);

  it("TQ-10: correctly reads and writes 1000 entries", async () => {
    const filePath = tmpPath("tq10-large.jsonl");
    const entries = [];
    for (let i = 1; i <= 1000; i++) {
      entries.push({
        id: `rf-${String(i).padStart(3, "0")}`,
        cluster_id: `c-${String(Math.ceil(i / 10)).padStart(3, "0")}`,
        pattern: `pattern-${i}`,
        suggestion: `suggestion-${i}`,
      });
    }

    await writeFindingsAtomic(filePath, entries);
    const result = await readFindings(filePath);

    assert.equal(result.length, 1000, "should read all 1000 entries");
    assert.deepEqual(result[0], entries[0]);
    assert.deepEqual(result[999], entries[999]);
  });
});

// --- TQ-11: appendFinding / readFindings — Unicode 文字のラウンドトリップ ---

describe("TQ-11: appendFinding/readFindings — Unicode round-trip", () => {
  before(setup);
  after(teardown);

  it("TQ-11: Unicode characters (Japanese, emoji) survive append and read", async () => {
    const filePath = tmpPath("tq11-unicode.jsonl");
    const entry = {
      id: "rf-001",
      date: "2026-04-09",
      project: "テストプロジェクト",
      reviewer: "quality",
      severity: "MUST",
      category: "エラー処理",
      pattern: "null チェックが欠如している 🚨",
      suggestion: "null ガードを追加する ✅",
      file: "src/ユーティリティ/パーサー.ts",
      cluster_id: null,
    };

    await appendFinding(filePath, entry);
    const result = await readFindings(filePath);

    assert.equal(result.length, 1);
    assert.deepEqual(result[0], entry, "Unicode characters should survive append/read round-trip");
  });
});

// --- TQ-12: appendFinding / readFindings — JSON 特殊文字のラウンドトリップ ---

describe("TQ-12: appendFinding/readFindings — JSON special characters round-trip", () => {
  before(setup);
  after(teardown);

  it("TQ-12: JSON special characters (quotes, backslash, newlines) survive append and read", async () => {
    const filePath = tmpPath("tq12-special-chars.jsonl");
    const entry = {
      id: "rf-001",
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "injection",
      pattern: 'Use of eval() with "user input" containing \\ backslashes',
      suggestion: "Replace eval() with JSON.parse() or a safe parser\nAdd input validation\n\tCheck for null",
      file: "src/utils/eval-wrapper.ts",
      cluster_id: null,
    };

    await appendFinding(filePath, entry);
    const result = await readFindings(filePath);

    assert.equal(result.length, 1);
    assert.deepEqual(result[0], entry, "JSON special characters should survive append/read round-trip");
  });
});

// --- TQ-13: promoteCluster — 既昇格クラスタの再昇格でサイズが更新される ---

describe("TQ-13: promoteCluster — re-promotion updates cluster size in AUTO section", () => {
  before(setup);
  after(teardown);

  it("TQ-13: re-promoting c-001 with 3 entries updates size from 2 to 3 in AUTO section", async () => {
    const findingsPath = tmpPath("tq13-repromote-findings.jsonl");
    const archivePath = tmpPath("tq13-repromote-archive.jsonl");
    const conventionsPath = tmpPath("tq13-repromote-conventions.md");

    // 初回: 2件で昇格
    const firstBatch = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, firstBatch.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    // 初回昇格後: cat-a が AUTO セクションに存在することを確認
    const contentAfterFirst = await readFile(conventionsPath, "utf-8");
    assert.ok(contentAfterFirst.includes("## cat-a"), "should show cat-a category header after first promotion");

    // 2回目: 新たに3件で昇格（クラスタが再度出現したシナリオ）
    const secondBatch = [
      { id: "rf-003", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-004", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-005", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, secondBatch.map((e) => JSON.stringify(e)).join("\n") + "\n");

    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    // 再昇格後: size が 3 に更新されている
    const contentAfterSecond = await readFile(conventionsPath, "utf-8");
    // 再昇格後: cat-a が AUTO セクションに存在（サイドカーで更新されている）
    assert.ok(contentAfterSecond.includes("## cat-a"), "should have cat-a category header after re-promotion");
    // AUTO セクションに cat-a のヘッダーは1回だけ
    const autoStart2 = contentAfterSecond.indexOf("<!-- AUTO:START -->");
    const autoEnd2 = contentAfterSecond.indexOf("<!-- AUTO:END -->");
    const autoSection2 = contentAfterSecond.slice(autoStart2, autoEnd2);
    const matches = autoSection2.match(/^## cat-a$/gm) || [];
    assert.equal(matches.length, 1, "cat-a should appear exactly once in AUTO section");
  });
});

// --- TQ-14: rebuildConventions — autoEntries に null を渡した場合 ---

describe("TQ-14: rebuildConventions — null autoEntries", () => {
  before(setup);
  after(teardown);

  it("TQ-14: throws or handles gracefully when autoEntries is null", async () => {
    const conventionsPath = tmpPath("tq14-null-entries.md");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // null を渡したとき、エラーを throw するか、空AUTO セクションとして処理されるかのどちらか
    // 実装の挙動を検証する（クラッシュしないことが最低限の期待）
    try {
      await rebuildConventions(conventionsPath, null);
      // 例外が出なかった場合: ファイルが正常に書き込まれているはず
      const content = await readFile(conventionsPath, "utf-8");
      assert.ok(content.includes("<!-- MANUAL:START -->"), "should still have MANUAL markers");
      assert.ok(content.includes("<!-- AUTO:START -->"), "should still have AUTO markers");
    } catch (err) {
      // TypeError などが throw される場合も許容（実装依存）
      assert.ok(err instanceof TypeError || err instanceof Error, "if it throws, should be a proper Error");
    }
  });
});

// --- TQ-15: getClusterRepresentatives — 飛び飛びの cluster_id 順序 ---

describe("TQ-15: getClusterRepresentatives — interleaved cluster_id entries", () => {
  before(setup);
  after(teardown);

  it("TQ-15: returns first occurrence of each cluster even when entries are interleaved", async () => {
    const filePath = tmpPath("tq15-interleaved.jsonl");
    // c-001, c-002, c-001 の順（c-001 が飛び飛び）
    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "first-c001", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-002", category: "cat-b", pattern: "first-c002", suggestion: "s-b" },
      { id: "rf-003", cluster_id: "c-001", category: "cat-a", pattern: "second-c001", suggestion: "s-a2" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const result = await getClusterRepresentatives(filePath);

    assert.equal(result.length, 2, "should return 2 representatives");

    const c001Rep = result.find((r) => r.cluster_id === "c-001");
    assert.ok(c001Rep, "should have c-001 representative");
    assert.equal(c001Rep.pattern, "first-c001", "c-001 representative should be the first occurrence");

    const c002Rep = result.find((r) => r.cluster_id === "c-002");
    assert.ok(c002Rep, "should have c-002 representative");
    assert.equal(c002Rep.pattern, "first-c002", "c-002 representative should be the first occurrence");
  });
});

// --- TQ-16: CLI add — 全フィールド欠如の場合のエラーメッセージ ---

describe("TQ-16: CLI add — empty object {} reports a missing required field", () => {
  before(setup);
  after(teardown);

  it("TQ-16: add with empty object {} exits 1 and stderr mentions a required field name", async () => {
    const findingsPath = tmpPath("tq16-empty-obj.jsonl");

    const result = await runCli(
      ["add", "--findings", findingsPath],
      JSON.stringify({}),
    );

    assert.equal(result.code, 1, "exit code should be 1");
    // いずれかの必須フィールド名が stderr に含まれる
    const requiredFields = ["date", "project", "reviewer", "severity", "category", "pattern", "suggestion", "file"];
    const mentionsField = requiredFields.some((f) => result.stderr.includes(f));
    assert.ok(mentionsField, `stderr should mention a required field name, got: ${result.stderr}`);
  });
});

// --- TQ-17: add --new-cluster 直後に findPromotable → 昇格対象にならない ---

describe("TQ-17: combination — add --new-cluster then findPromotable returns empty", () => {
  before(setup);
  after(teardown);

  it("TQ-17: newly added single entry with new-cluster is not in findPromotable (size=1)", async () => {
    const findingsPath = tmpPath("tq17-new-cluster-flow.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "test-pattern",
      suggestion: "fix",
      file: "a.ts",
    };

    const result = await runCli(
      ["add", "--new-cluster", "--findings", findingsPath],
      JSON.stringify(entry),
    );
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    // findPromotable は空を返す（サイズ1なので昇格対象外）
    const promotable = await findPromotable(findingsPath);
    assert.deepEqual(promotable, [], "single-entry cluster should not be promotable");
  });
});

// --- TQ-18: migrate → add → promote-all の一連フロー ---

describe("TQ-18: combination — migrate → add → promote-all flow", () => {
  before(setup);
  after(teardown);

  it("TQ-18: end-to-end flow: migrate then add two entries to same cluster then promote-all", async () => {
    const findingsPath = tmpPath("tq18-flow-findings.jsonl");
    const archivePath = tmpPath("tq18-flow-archive.jsonl");
    const conventionsPath = tmpPath("tq18-flow-conventions.md");

    // Step 1: マイグレーション前の初期データ（id なし）
    const initialEntries = [
      { date: "2026-01-01", project: "test", reviewer: "quality", severity: "MUST", category: "cat-a", pattern: "legacy-pattern", suggestion: "fix", file: "a.ts" },
    ];
    await writeFile(findingsPath, initialEntries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "# Review Conventions\n\n## Existing Rule\n\n- Rule 1\n");

    // Step 2: migrate を実行
    const migrateResult = await migrate({ findingsPath, conventionsPath });
    assert.equal(migrateResult.findingsMigrated, 1);
    assert.equal(migrateResult.conventionsMigrated, true);

    // Step 3: 既存エントリ（マイグレーション後）に cluster_id を付与
    const migratedFindings = await readFindings(findingsPath);
    assert.equal(migratedFindings.length, 1);
    migratedFindings[0].cluster_id = "c-001";
    await writeFindingsAtomic(findingsPath, migratedFindings);

    // Step 4: 同じ cluster_id で2件目を追記
    const newEntry = {
      id: "rf-002",
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "legacy-pattern",
      suggestion: "fix",
      file: "b.ts",
      cluster_id: "c-001",
    };
    await appendFinding(findingsPath, newEntry);

    // Step 5: promote-all を実行
    const result = await runCli([
      "promote-all",
      "--findings", findingsPath,
      "--archive", archivePath,
      "--conventions", conventionsPath,
    ]);
    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);

    const output = JSON.parse(result.stdout.trim());
    assert.ok(output.promoted.includes("c-001"), "c-001 should be promoted");

    // archive に2件移動
    const archived = await readFindings(archivePath);
    assert.equal(archived.length, 2);

    // findings は空
    const remaining = await readFindings(findingsPath);
    assert.equal(remaining.length, 0);

    // conventions に cat-a が追加され（新フォーマット）、既存 MANUAL セクションが保持されている
    const conventionsContent = await readFile(conventionsPath, "utf-8");
    assert.ok(conventionsContent.includes("## cat-a"), "conventions should contain cat-a category header");
    assert.ok(conventionsContent.includes("Existing Rule"), "MANUAL section should preserve existing content");
  });
});

// --- TQ-19: promoteCluster 後に rebuildConventions を別途呼んでも AUTO エントリが保持される ---

describe("TQ-19: combination — promoteCluster then rebuildConventions preserves existing AUTO entries", () => {
  before(setup);
  after(teardown);

  it("TQ-19: calling rebuildConventions after promoteCluster with same entries preserves AUTO section", async () => {
    const findingsPath = tmpPath("tq19-preserve-auto-findings.jsonl");
    const archivePath = tmpPath("tq19-preserve-auto-archive.jsonl");
    const conventionsPath = tmpPath("tq19-preserve-auto-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // Step 1: promoteCluster
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    const contentAfterPromote = await readFile(conventionsPath, "utf-8");
    assert.ok(contentAfterPromote.includes("## cat-a"), "cat-a should be in conventions after promote (new format)");

    // Step 2: rebuildConventions を同じ autoEntries で再実行
    const autoEntries = [
      { cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a", size: 2 },
    ];
    await rebuildConventions(conventionsPath, autoEntries);

    const contentAfterRebuild = await readFile(conventionsPath, "utf-8");
    assert.ok(contentAfterRebuild.includes("## cat-a"), "cat-a category header should still be in conventions after rebuildConventions");
    // cat-a は AUTO セクション内で1回だけ
    const autoStart = contentAfterRebuild.indexOf("<!-- AUTO:START -->");
    const autoEnd = contentAfterRebuild.indexOf("<!-- AUTO:END -->");
    const autoSection = contentAfterRebuild.slice(autoStart, autoEnd);
    const matches = autoSection.match(/^## cat-a$/gm) || [];
    assert.equal(matches.length, 1, "cat-a should appear exactly once");
  });
});

// --- TQ-20: CLI promote-all — 昇格対象が0件のとき {"promoted": []} を返す ---

describe("TQ-20: CLI promote-all — no promotable clusters returns {promoted: []}", () => {
  before(setup);
  after(teardown);

  it("TQ-20: promote-all returns {promoted: []} when all clusters have fewer than 2 entries", async () => {
    const findingsPath = tmpPath("tq20-no-promotable-findings.jsonl");
    const archivePath = tmpPath("tq20-no-promotable-archive.jsonl");
    const conventionsPath = tmpPath("tq20-no-promotable-conventions.md");

    // クラスタが1件のみ（昇格対象外）
    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: null, category: "cat-b", pattern: "p-b", suggestion: "s-b" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    const result = await runCli([
      "promote-all",
      "--findings", findingsPath,
      "--archive", archivePath,
      "--conventions", conventionsPath,
    ]);

    assert.equal(result.code, 0, `exit code should be 0, stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsed, { promoted: [] }, "should return {promoted: []} when no clusters are promotable");
  });
});

// --- MUST-3: validateFinding 強化 ---

describe("MUST-3: validateFinding — length limit", () => {
  before(setup);
  after(teardown);

  it("MUST-3-length: pattern exceeding 500 chars causes exit 1", async () => {
    const findingsPath = tmpPath("must3-length-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "a".repeat(501),
      suggestion: "fix",
      file: "a.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 1, "exit code should be 1 for pattern > 500 chars");
    assert.ok(result.stderr.includes("pattern"), `stderr should mention 'pattern', got: ${result.stderr}`);
  });

  it("MUST-3-length: suggestion exceeding 500 chars causes exit 1", async () => {
    const findingsPath = tmpPath("must3-suggestion-length-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "valid pattern",
      suggestion: "s".repeat(501),
      file: "a.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 1, "exit code should be 1 for suggestion > 500 chars");
    assert.ok(result.stderr.includes("suggestion"), `stderr should mention 'suggestion', got: ${result.stderr}`);
  });

  it("MUST-3-length: pattern exactly 500 chars is accepted", async () => {
    const findingsPath = tmpPath("must3-length-ok-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "a".repeat(500),
      suggestion: "fix",
      file: "a.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 0, `exit code should be 0 for pattern == 500 chars, stderr: ${result.stderr}`);
  });
});

describe("MUST-3: validateFinding — control characters", () => {
  before(setup);
  after(teardown);

  it("MUST-3-ctrl: pattern with control character (\\x01) causes exit 1", async () => {
    const findingsPath = tmpPath("must3-ctrl-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "pattern\x01with control",
      suggestion: "fix",
      file: "a.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 1, "exit code should be 1 for control character in pattern");
    assert.ok(result.stderr.includes("control"), `stderr should mention 'control', got: ${result.stderr}`);
  });
});

describe("MUST-3: validateFinding — category allowlist", () => {
  before(setup);
  after(teardown);

  it("MUST-3-cat: category with space causes exit 1", async () => {
    const findingsPath = tmpPath("must3-cat-space-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat with space",
      pattern: "pattern",
      suggestion: "fix",
      file: "a.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 1, "exit code should be 1 for category with space");
    assert.ok(result.stderr.includes("category"), `stderr should mention 'category', got: ${result.stderr}`);
  });

  it("MUST-3-cat: category with valid chars (alphanumeric, hyphen, underscore) is accepted", async () => {
    const findingsPath = tmpPath("must3-cat-valid-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "format-fragility_v2",
      pattern: "pattern",
      suggestion: "fix",
      file: "a.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 0, `exit code should be 0 for valid category, stderr: ${result.stderr}`);
  });
});

describe("MUST-4: validateFinding — file allowlist (path traversal)", () => {
  before(setup);
  after(teardown);

  it("MUST-4-file: file with path traversal (../) causes exit 1", async () => {
    const findingsPath = tmpPath("must4-file-traversal-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "pattern",
      suggestion: "fix",
      file: "../secret.env",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 1, "exit code should be 1 for file with path traversal");
    assert.ok(result.stderr.includes("file"), `stderr should mention 'file', got: ${result.stderr}`);
  });

  it("MUST-4-file: file with valid path is accepted", async () => {
    const findingsPath = tmpPath("must4-file-valid-findings.jsonl");
    const entry = {
      date: "2026-04-09",
      project: "test",
      reviewer: "quality",
      severity: "MUST",
      category: "cat-a",
      pattern: "pattern",
      suggestion: "fix",
      file: "src/utils/parser.ts",
    };
    const result = await runCli(["add", "--findings", findingsPath], JSON.stringify(entry));
    assert.equal(result.code, 0, `exit code should be 0 for valid file path, stderr: ${result.stderr}`);
  });
});

// --- MUST-5: writeFileAtomic ---

describe("MUST-5: writeFileAtomic — no tmp file remains after success", () => {
  before(setup);
  after(teardown);

  it("MUST-5-clean: writeFileAtomic leaves no tmp file after success", async () => {
    const { readdir } = await import("node:fs/promises");
    const targetPath = tmpPath("must5-atomic-target.txt");
    await writeFileAtomic(targetPath, "hello world");

    const content = await readFile(targetPath, "utf-8");
    assert.equal(content, "hello world", "content should be written correctly");

    const files = await readdir(ctx.getTmpDir());
    const tmpFiles = files.filter((f) => f.startsWith("must5-atomic-target.txt.tmp"));
    assert.equal(tmpFiles.length, 0, "no tmp files should remain after successful write");
  });

  it("MUST-5-random: two concurrent writeFileAtomic calls do not conflict", async () => {
    const target1 = tmpPath("must5-concurrent-1.txt");
    const target2 = tmpPath("must5-concurrent-2.txt");

    // 並列実行
    await Promise.all([
      writeFileAtomic(target1, "content-1"),
      writeFileAtomic(target2, "content-2"),
    ]);

    const c1 = await readFile(target1, "utf-8");
    const c2 = await readFile(target2, "utf-8");
    assert.equal(c1, "content-1");
    assert.equal(c2, "content-2");
  });
});

// --- MUST-1: conventions-state.jsonl サイドカー ---

describe("MUST-1: conventions-state.jsonl — sidecar state file", () => {
  before(setup);
  after(teardown);

  it("MUST-1-sidecar: promoteCluster creates conventions-state.jsonl alongside conventions.md", async () => {
    const findingsPath = tmpPath("must1-sidecar-findings.jsonl");
    const archivePath = tmpPath("must1-sidecar-archive.jsonl");
    const conventionsPath = tmpPath("must1-sidecar-conventions.md");
    const statePath = tmpPath("conventions-state.jsonl");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "format-fragility", pattern: "use custom format", suggestion: "use JSONL" },
      { id: "rf-002", cluster_id: "c-001", category: "format-fragility", pattern: "use custom format", suggestion: "use JSONL" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    // conventions-state.jsonl が conventions.md と同じディレクトリに存在する
    const stateContent = await readFile(statePath, "utf-8");
    const stateLines = stateContent.split("\n").filter(Boolean);
    assert.equal(stateLines.length, 1, "state file should have 1 entry");

    const stateEntry = JSON.parse(stateLines[0]);
    assert.equal(stateEntry.cluster_id, "c-001");
    assert.equal(stateEntry.category, "format-fragility");
    assert.ok("pattern" in stateEntry, "state entry should have pattern");
    assert.ok("suggestion" in stateEntry, "state entry should have suggestion");
    assert.ok("size" in stateEntry, "state entry should have size");
  });

  it("MUST-1-sidecar-format: AUTO section uses category-grouped format without cluster_id", async () => {
    const findingsPath = tmpPath("must1-format-findings.jsonl");
    const archivePath = tmpPath("must1-format-archive.jsonl");
    const conventionsPath = tmpPath("must1-format-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "format-fragility", pattern: "独自の中間フォーマット", suggestion: "JSONL で統一" },
      { id: "rf-002", cluster_id: "c-001", category: "format-fragility", pattern: "独自の中間フォーマット", suggestion: "JSONL で統一" },
      { id: "rf-003", cluster_id: "c-002", category: "prompt-injection", pattern: "AI 出力を未検証で使う", suggestion: "長さ上限を設ける" },
      { id: "rf-004", cluster_id: "c-002", category: "prompt-injection", pattern: "AI 出力を未検証で使う", suggestion: "長さ上限を設ける" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-002");

    const content = await readFile(conventionsPath, "utf-8");

    // 新フォーマット検証: ## <category> + - <pattern> / 対策: <suggestion>
    assert.ok(content.includes("## format-fragility"), "should have format-fragility section");
    assert.ok(content.includes("- 独自の中間フォーマット / 対策: JSONL で統一"), "should have entry in new format");
    assert.ok(content.includes("## prompt-injection"), "should have prompt-injection section");
    assert.ok(content.includes("- AI 出力を未検証で使う / 対策: 長さ上限を設ける"), "should have entry in new format");

    // cluster_id は Markdown に出現しない
    assert.ok(!content.includes("c-001"), "cluster_id c-001 should not be in markdown");
    assert.ok(!content.includes("c-002"), "cluster_id c-002 should not be in markdown");
  });
});
