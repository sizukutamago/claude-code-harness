/**
 * review-memory.test.mjs
 *
 * TDD テスト: scripts/review-memory.mjs の JSONL 読み書き基盤 + 関数スケルトン
 *
 * テスト番号 1-20 は全て AC 由来（Task-1 の指定テストケース）
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";

import {
  readFindings,
  appendFinding,
  writeFindingsAtomic,
  nextFindingId,
  nextClusterId,
  findPromotable,
  getClusterRepresentatives,
  promoteCluster,
  rebuildConventions,
} from "../review-memory.mjs";
import { createTmpContext } from "./_helpers.mjs";

// --- テスト用ヘルパー ---

const ctx = createTmpContext();
const setup = ctx.setup;
const teardown = ctx.teardown;
const tmpPath = ctx.tmpPath;

// --- readFindings ---

describe("readFindings", () => {
  before(setup);
  after(teardown);

  // TC-1: 存在しないファイルで空配列を返す
  it("TC-1: returns empty array for non-existent file", async () => {
    const result = await readFindings(tmpPath("nonexistent.jsonl"));
    assert.deepEqual(result, []);
  });

  // TC-2: 空ファイルで空配列を返す
  it("TC-2: returns empty array for empty file", async () => {
    const filePath = tmpPath("empty.jsonl");
    await writeFile(filePath, "");
    const result = await readFindings(filePath);
    assert.deepEqual(result, []);
  });

  // TC-3: 有効な JSONL（3件）をパースして配列で返す
  it("TC-3: parses valid JSONL with 3 entries", async () => {
    const filePath = tmpPath("valid3.jsonl");
    const entries = [
      { id: "rf-001", pattern: "pattern-a", cluster_id: "c-001" },
      { id: "rf-002", pattern: "pattern-b", cluster_id: "c-001" },
      { id: "rf-003", pattern: "pattern-c", cluster_id: "c-002" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"));
    const result = await readFindings(filePath);
    assert.deepEqual(result, entries);
  });

  // TC-4: 末尾改行ありのファイルも正しくパースできる
  it("TC-4: parses JSONL with trailing newline", async () => {
    const filePath = tmpPath("trailing-newline.jsonl");
    const entries = [
      { id: "rf-001", pattern: "pattern-a" },
      { id: "rf-002", pattern: "pattern-b" },
    ];
    await writeFile(
      filePath,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const result = await readFindings(filePath);
    assert.deepEqual(result, entries);
  });

  // TC-5: 不正な JSON 行をスキップして警告を出す（配列には含めない）
  it("TC-5: skips invalid JSON lines and warns to stderr", async () => {
    const filePath = tmpPath("with-invalid.jsonl");
    const validEntry = { id: "rf-001", pattern: "pattern-a" };
    await writeFile(
      filePath,
      [JSON.stringify(validEntry), "INVALID JSON", JSON.stringify({ id: "rf-002" })].join("\n"),
    );

    const stderrMessages = [];
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg) => {
      stderrMessages.push(msg);
      return true;
    };

    const result = await readFindings(filePath);

    process.stderr.write = originalStderr;

    assert.equal(result.length, 2);
    assert.deepEqual(result[0], validEntry);
    assert.deepEqual(result[1], { id: "rf-002" });
    assert.ok(
      stderrMessages.some((m) => m.includes("Warning") || m.includes("warn") || m.includes("skip") || m.includes("parse")),
      `stderr should contain a warning, got: ${JSON.stringify(stderrMessages)}`,
    );
  });
});

// --- appendFinding ---

describe("appendFinding", () => {
  before(setup);
  after(teardown);

  // TC-6: 存在しないファイルに追記して新規作成される
  it("TC-6: creates new file when appending to non-existent path", async () => {
    const filePath = tmpPath("new-append.jsonl");
    const finding = { id: "rf-001", pattern: "test-pattern" };
    await appendFinding(filePath, finding);

    const content = await readFile(filePath, "utf-8");
    assert.ok(content.length > 0);
    const parsed = JSON.parse(content.trim());
    assert.deepEqual(parsed, finding);
  });

  // TC-7: 既存ファイルに追記して行数が増える
  it("TC-7: appends to existing file and increases line count", async () => {
    const filePath = tmpPath("existing-append.jsonl");
    const first = { id: "rf-001", pattern: "first" };
    const second = { id: "rf-002", pattern: "second" };
    await writeFile(filePath, JSON.stringify(first) + "\n");
    await appendFinding(filePath, second);

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    assert.equal(lines.length, 2);
  });

  // TC-8: 追記後の各行が valid JSONL である
  it("TC-8: each line after append is valid JSON", async () => {
    const filePath = tmpPath("valid-jsonl-after-append.jsonl");
    const entries = [
      { id: "rf-001", pattern: "a" },
      { id: "rf-002", pattern: "b" },
      { id: "rf-003", pattern: "c" },
    ];
    for (const entry of entries) {
      await appendFinding(filePath, entry);
    }

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    assert.equal(lines.length, 3);
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });
});

// --- writeFindingsAtomic ---

describe("writeFindingsAtomic", () => {
  before(setup);
  after(teardown);

  // TC-9: 既存ファイルを全置換する
  it("TC-9: overwrites existing file with new entries", async () => {
    const filePath = tmpPath("atomic-overwrite.jsonl");
    const oldEntry = { id: "rf-001", pattern: "old" };
    await writeFile(filePath, JSON.stringify(oldEntry) + "\n");

    const newEntries = [
      { id: "rf-010", pattern: "new-a" },
      { id: "rf-011", pattern: "new-b" },
    ];
    await writeFindingsAtomic(filePath, newEntries);

    const result = await readFindings(filePath);
    assert.deepEqual(result, newEntries);
  });

  // TC-10: 書き込み後に tmpfile が残らない（クリーンアップされる）
  it("TC-10: no tmpfile remains after write", async () => {
    const filePath = tmpPath("atomic-clean.jsonl");
    const entries = [{ id: "rf-001", pattern: "test" }];
    await writeFindingsAtomic(filePath, entries);

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(ctx.getTmpDir());
    const tmpFiles = files.filter(
      (f) => f.startsWith("atomic-clean.jsonl.tmp"),
    );
    assert.equal(tmpFiles.length, 0);
  });
});

// --- nextFindingId ---

describe("nextFindingId", () => {
  before(setup);
  after(teardown);

  // TC-11: 空ファイルで rf-001 を返す
  it("TC-11: returns rf-001 for empty file", async () => {
    const filePath = tmpPath("empty-finding-id.jsonl");
    await writeFile(filePath, "");
    const result = await nextFindingId(filePath);
    assert.equal(result, "rf-001");
  });

  // TC-12: rf-001〜rf-003 が存在する状態で rf-004 を返す
  it("TC-12: returns rf-004 when rf-001 to rf-003 exist", async () => {
    const filePath = tmpPath("sequential-finding-id.jsonl");
    const entries = [
      { id: "rf-001" },
      { id: "rf-002" },
      { id: "rf-003" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"));
    const result = await nextFindingId(filePath);
    assert.equal(result, "rf-004");
  });

  // TC-13: 歯抜けの状態（rf-001, rf-003）で rf-004 を返す（ギャップ埋めではなく最大+1）
  it("TC-13: returns max+1 with gaps (rf-001, rf-003 → rf-004)", async () => {
    const filePath = tmpPath("gap-finding-id.jsonl");
    const entries = [{ id: "rf-001" }, { id: "rf-003" }];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"));
    const result = await nextFindingId(filePath);
    assert.equal(result, "rf-004");
  });
});

// --- nextClusterId ---

describe("nextClusterId", () => {
  before(setup);
  after(teardown);

  // TC-14: 空ファイルで c-001 を返す
  it("TC-14: returns c-001 for empty file", async () => {
    const filePath = tmpPath("empty-cluster-id.jsonl");
    await writeFile(filePath, "");
    const result = await nextClusterId(filePath);
    assert.equal(result, "c-001");
  });

  // TC-15: c-001〜c-003 が存在する状態で c-004 を返す
  it("TC-15: returns c-004 when c-001 to c-003 exist", async () => {
    const filePath = tmpPath("sequential-cluster-id.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-001" },
      { id: "rf-002", cluster_id: "c-002" },
      { id: "rf-003", cluster_id: "c-003" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"));
    const result = await nextClusterId(filePath);
    assert.equal(result, "c-004");
  });

  // TC-16: cluster_id が null のエントリを含む場合、null をスキップして採番する
  it("TC-16: skips null cluster_id entries when computing next id", async () => {
    const filePath = tmpPath("null-cluster-id.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-001" },
      { id: "rf-002", cluster_id: null },
      { id: "rf-003", cluster_id: "c-002" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n"));
    const result = await nextClusterId(filePath);
    assert.equal(result, "c-003");
  });
});

// --- findPromotable ---

describe("findPromotable", () => {
  before(setup);
  after(teardown);

  // AC: 空ファイルで空配列を返す
  it("findPromotable: returns empty array for empty file", async () => {
    const filePath = tmpPath("promotable-empty.jsonl");
    await writeFile(filePath, "");
    const result = await findPromotable(filePath);
    assert.deepEqual(result, []);
  });

  // AC: 全エントリが cluster_id=null の場合、空配列を返す
  it("findPromotable: returns empty array when all entries have null cluster_id", async () => {
    const filePath = tmpPath("promotable-null-clusters.jsonl");
    const entries = [
      { id: "rf-001", pattern: "a", cluster_id: null },
      { id: "rf-002", pattern: "b", cluster_id: null },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await findPromotable(filePath);
    assert.deepEqual(result, []);
  });

  // AC: c-001 が1件だけの場合、空配列を返す（サイズ1は除外）
  it("findPromotable: returns empty array when cluster has only 1 entry", async () => {
    const filePath = tmpPath("promotable-single.jsonl");
    const entries = [{ id: "rf-001", pattern: "a", cluster_id: "c-001" }];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await findPromotable(filePath);
    assert.deepEqual(result, []);
  });

  // AC: c-001 が2件ある場合、[{cluster_id: "c-001", entries: [2件]}] を返す
  it("findPromotable: returns cluster with 2 entries", async () => {
    const filePath = tmpPath("promotable-two.jsonl");
    const entries = [
      { id: "rf-001", pattern: "a", cluster_id: "c-001" },
      { id: "rf-002", pattern: "b", cluster_id: "c-001" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await findPromotable(filePath);
    assert.equal(result.length, 1);
    assert.equal(result[0].cluster_id, "c-001");
    assert.equal(result[0].entries.length, 2);
  });

  // AC: c-001 が3件、c-002 が1件ある場合、c-001 のみ返す
  it("findPromotable: returns only clusters with 2+ entries when mixed sizes exist", async () => {
    const filePath = tmpPath("promotable-mixed.jsonl");
    const entries = [
      { id: "rf-001", pattern: "a", cluster_id: "c-001" },
      { id: "rf-002", pattern: "b", cluster_id: "c-001" },
      { id: "rf-003", pattern: "c", cluster_id: "c-001" },
      { id: "rf-004", pattern: "d", cluster_id: "c-002" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await findPromotable(filePath);
    assert.equal(result.length, 1);
    assert.equal(result[0].cluster_id, "c-001");
    assert.equal(result[0].entries.length, 3);
  });

  // AC: 複数クラスタ（c-001, c-002 それぞれ2件以上）がある場合、全て返す
  it("findPromotable: returns all clusters with 2+ entries", async () => {
    const filePath = tmpPath("promotable-multi.jsonl");
    const entries = [
      { id: "rf-001", pattern: "a", cluster_id: "c-001" },
      { id: "rf-002", pattern: "b", cluster_id: "c-001" },
      { id: "rf-003", pattern: "c", cluster_id: "c-002" },
      { id: "rf-004", pattern: "d", cluster_id: "c-002" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await findPromotable(filePath);
    assert.equal(result.length, 2);
    const clusterIds = result.map((r) => r.cluster_id).sort();
    assert.deepEqual(clusterIds, ["c-001", "c-002"]);
  });

  // AC: cluster_id=null のエントリは対象外（他のクラスタには影響しない）
  it("findPromotable: null cluster_id entries do not affect valid clusters", async () => {
    const filePath = tmpPath("promotable-with-null.jsonl");
    const entries = [
      { id: "rf-001", pattern: "a", cluster_id: "c-001" },
      { id: "rf-002", pattern: "b", cluster_id: null },
      { id: "rf-003", pattern: "c", cluster_id: "c-001" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await findPromotable(filePath);
    assert.equal(result.length, 1);
    assert.equal(result[0].cluster_id, "c-001");
    assert.equal(result[0].entries.length, 2);
  });
});

// --- getClusterRepresentatives ---

describe("getClusterRepresentatives", () => {
  before(setup);
  after(teardown);

  // AC: 空ファイルで空配列を返す
  it("getClusterRepresentatives: returns empty array for empty file", async () => {
    const filePath = tmpPath("representatives-empty.jsonl");
    await writeFile(filePath, "");
    const result = await getClusterRepresentatives(filePath);
    assert.deepEqual(result, []);
  });

  // AC: 全エントリが cluster_id=null の場合、空配列を返す
  it("getClusterRepresentatives: returns empty array when all entries have null cluster_id", async () => {
    const filePath = tmpPath("representatives-null.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: null, category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: null, category: "cat-b", pattern: "p-b", suggestion: "s-b" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await getClusterRepresentatives(filePath);
    assert.deepEqual(result, []);
  });

  // AC: c-001 が3件ある場合、最初のエントリを代表として返す
  it("getClusterRepresentatives: returns first entry as representative for cluster", async () => {
    const filePath = tmpPath("representatives-first.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "first-pattern", suggestion: "first-suggestion" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "second-pattern", suggestion: "second-suggestion" },
      { id: "rf-003", cluster_id: "c-001", category: "cat-a", pattern: "third-pattern", suggestion: "third-suggestion" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await getClusterRepresentatives(filePath);
    assert.equal(result.length, 1);
    assert.equal(result[0].pattern, "first-pattern");
  });

  // AC: 返される代表エントリに cluster_id, category, pattern, suggestion が含まれる
  it("getClusterRepresentatives: representative entry contains required fields", async () => {
    const filePath = tmpPath("representatives-fields.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a", date: "2026-01-01", file: "some/file.ts" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await getClusterRepresentatives(filePath);
    assert.equal(result.length, 1);
    assert.ok("cluster_id" in result[0], "should have cluster_id");
    assert.ok("category" in result[0], "should have category");
    assert.ok("pattern" in result[0], "should have pattern");
    assert.ok("suggestion" in result[0], "should have suggestion");
    assert.ok(!("id" in result[0]), "should not have id");
    assert.ok(!("date" in result[0]), "should not have date");
  });

  // AC: 複数クラスタ（c-001, c-002）がある場合、各1件ずつ返す（計2件）
  it("getClusterRepresentatives: returns one representative per cluster for multiple clusters", async () => {
    const filePath = tmpPath("representatives-multi.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a2", suggestion: "s-a2" },
      { id: "rf-003", cluster_id: "c-002", category: "cat-b", pattern: "p-b", suggestion: "s-b" },
      { id: "rf-004", cluster_id: "c-002", category: "cat-b", pattern: "p-b2", suggestion: "s-b2" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await getClusterRepresentatives(filePath);
    assert.equal(result.length, 2);
    const clusterIds = result.map((r) => r.cluster_id).sort();
    assert.deepEqual(clusterIds, ["c-001", "c-002"]);
  });

  // AC: cluster_id=null のエントリは対象外
  it("getClusterRepresentatives: excludes null cluster_id entries", async () => {
    const filePath = tmpPath("representatives-exclude-null.jsonl");
    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: null, category: "cat-b", pattern: "p-b", suggestion: "s-b" },
    ];
    await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const result = await getClusterRepresentatives(filePath);
    assert.equal(result.length, 1);
    assert.equal(result[0].cluster_id, "c-001");
  });
});

// --- promoteCluster ---

describe("promoteCluster", () => {
  before(setup);
  after(teardown);

  // TC-P1: 基本動作 - findings に2件ある c-001 を昇格
  it("TC-P1: promotes c-001 cluster: appends 2 entries to archive, adds to conventions AUTO, removes from findings", async () => {
    const findingsPath = tmpPath("promote-basic-findings.jsonl");
    const archivePath = tmpPath("promote-basic-archive.jsonl");
    const conventionsPath = tmpPath("promote-basic-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "format-fragility", pattern: "独自フォーマット使用", suggestion: "JSONL で統一する" },
      { id: "rf-002", cluster_id: "c-001", category: "format-fragility", pattern: "独自フォーマット使用", suggestion: "JSONL で統一する" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    const count = await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    // archive に2件 append されている
    const archived = await readFindings(archivePath);
    assert.equal(archived.length, 2);
    assert.ok(archived.every((e) => e.cluster_id === "c-001"));

    // conventions.md AUTO セクションに format-fragility のエントリが追加されている（新フォーマット）
    const conventionsContent = await readFile(conventionsPath, "utf-8");
    assert.ok(conventionsContent.includes("## format-fragility"), "conventions should contain format-fragility category header");
    assert.ok(conventionsContent.includes("独自フォーマット使用"), "conventions should contain pattern");

    // findings から c-001 の2件が削除されている
    const remaining = await readFindings(findingsPath);
    assert.equal(remaining.length, 0);

    // 返り値は削除件数 2
    assert.equal(count, 2);
  });

  // TC-P2: archive.jsonl が存在しない場合も正常動作（新規作成）
  it("TC-P2: creates new archive.jsonl when it does not exist", async () => {
    const findingsPath = tmpPath("promote-new-archive-findings.jsonl");
    const archivePath = tmpPath("promote-new-archive-archive.jsonl");
    const conventionsPath = tmpPath("promote-new-archive-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // archivePath は存在しない状態でテスト
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    const archived = await readFindings(archivePath);
    assert.equal(archived.length, 2);
  });

  // TC-P3: conventions.md が存在しない場合、新規作成して AUTO セクションに追加
  it("TC-P3: creates new conventions.md when it does not exist", async () => {
    const findingsPath = tmpPath("promote-new-conv-findings.jsonl");
    const archivePath = tmpPath("promote-new-conv-archive.jsonl");
    const conventionsPath = tmpPath("promote-new-conv-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

    // conventionsPath は存在しない状態でテスト
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    const content = await readFile(conventionsPath, "utf-8");
    assert.ok(content.includes("<!-- AUTO:START -->"), "should create AUTO section");
    assert.ok(content.includes("## cat-a"), "should contain cat-a category entry");
  });

  // TC-P4: 冪等性 - 同じ cluster_id を2回昇格しても archive と conventions に重複しない
  it("TC-P4: idempotent: re-running promoteCluster does not duplicate entries in archive or conventions", async () => {
    const findingsPath = tmpPath("promote-idempotent-findings.jsonl");
    const archivePath = tmpPath("promote-idempotent-archive.jsonl");
    const conventionsPath = tmpPath("promote-idempotent-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // 1回目の昇格
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    // findings に同じエントリを再度書き込んで2回目実行（ステップ3失敗後の再実行シミュレーション）
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    // archive には重複なし（id ベースで比較するので rf-001, rf-002 がそれぞれ1件ずつ）
    const archived = await readFindings(archivePath);
    const ids = archived.map((e) => e.id);
    assert.equal(ids.filter((id) => id === "rf-001").length, 1, "rf-001 should appear once");
    assert.equal(ids.filter((id) => id === "rf-002").length, 1, "rf-002 should appear once");

    // conventions.md AUTO セクションに cat-a は1回だけ
    const content = await readFile(conventionsPath, "utf-8");
    const autoStart = content.indexOf("<!-- AUTO:START -->");
    const autoEnd = content.indexOf("<!-- AUTO:END -->");
    const autoContent = content.slice(autoStart, autoEnd);
    // cat-a の ## ヘッダーが1回だけ存在すること
    const catMatches = autoContent.match(/^## cat-a$/gm) || [];
    assert.equal(catMatches.length, 1, "cat-a should appear once in AUTO section");
  });

  // TC-P5: 存在しない cluster_id を指定しても no-op で正常終了
  it("TC-P5: returns 0 and does nothing when cluster_id does not exist", async () => {
    const findingsPath = tmpPath("promote-nonexistent-findings.jsonl");
    const archivePath = tmpPath("promote-nonexistent-archive.jsonl");
    const conventionsPath = tmpPath("promote-nonexistent-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    const count = await promoteCluster(findingsPath, archivePath, conventionsPath, "c-999");

    assert.equal(count, 0);
    // findings は変化なし
    const remaining = await readFindings(findingsPath);
    assert.equal(remaining.length, 1);
  });

  // TC-P6: 他のクラスタに影響なし - c-001 を昇格しても c-002 のエントリは findings に残る
  it("TC-P6: does not remove entries of other clusters from findings", async () => {
    const findingsPath = tmpPath("promote-other-cluster-findings.jsonl");
    const archivePath = tmpPath("promote-other-cluster-archive.jsonl");
    const conventionsPath = tmpPath("promote-other-cluster-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-003", cluster_id: "c-002", category: "cat-b", pattern: "p-b", suggestion: "s-b" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    const remaining = await readFindings(findingsPath);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].cluster_id, "c-002");
  });

  // TC-P7: MANUAL セクション保持 - conventions.md の MANUAL セクションは変更されない
  it("TC-P7: preserves MANUAL section in conventions.md", async () => {
    const findingsPath = tmpPath("promote-manual-preserve-findings.jsonl");
    const archivePath = tmpPath("promote-manual-preserve-archive.jsonl");
    const conventionsPath = tmpPath("promote-manual-preserve-conventions.md");

    const manualContent = "\n## Human Written Rules\n\n- Rule 1: Always validate inputs\n";
    const initialConventions = `<!-- MANUAL:START -->${manualContent}<!-- MANUAL:END -->\n\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n`;
    await writeFile(conventionsPath, initialConventions);

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");

    const result = await readFile(conventionsPath, "utf-8");
    const manualStart = result.indexOf("<!-- MANUAL:START -->") + "<!-- MANUAL:START -->".length;
    const manualEnd = result.indexOf("<!-- MANUAL:END -->");
    const extractedManual = result.slice(manualStart, manualEnd);
    assert.equal(extractedManual, manualContent, "MANUAL section should be preserved byte-for-byte");
  });

  // TC-P8: 複数クラスタの累積昇格 - c-001 昇格後に c-002 を昇格すると両方が AUTO セクションに含まれる
  it("TC-P8: cumulative promotion: c-001 and c-002 both appear in AUTO section after sequential promotions", async () => {
    const findingsPath = tmpPath("promote-cumulative-findings.jsonl");
    const archivePath = tmpPath("promote-cumulative-archive.jsonl");
    const conventionsPath = tmpPath("promote-cumulative-conventions.md");

    const entries = [
      { id: "rf-001", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-002", cluster_id: "c-001", category: "cat-a", pattern: "p-a", suggestion: "s-a" },
      { id: "rf-003", cluster_id: "c-002", category: "cat-b", pattern: "p-b", suggestion: "s-b" },
      { id: "rf-004", cluster_id: "c-002", category: "cat-b", pattern: "p-b", suggestion: "s-b" },
    ];
    await writeFile(findingsPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    // c-001 を昇格
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-001");
    // c-002 を昇格
    await promoteCluster(findingsPath, archivePath, conventionsPath, "c-002");

    const content = await readFile(conventionsPath, "utf-8");
    assert.ok(content.includes("## cat-a"), "conventions should contain cat-a after cumulative promotion");
    assert.ok(content.includes("## cat-b"), "conventions should contain cat-b after cumulative promotion");

    // findings は全て削除されている
    const remaining = await readFindings(findingsPath);
    assert.equal(remaining.length, 0);
  });
});

// --- rebuildConventions ---

describe("rebuildConventions", () => {
  before(setup);
  after(teardown);

  // TC-21: 存在しないファイルは新規作成され、MANUAL/AUTO マーカーが含まれる (AC-8)
  it("TC-21: creates new file with MANUAL and AUTO markers for non-existent file", async () => {
    const conventionsPath = tmpPath("new-conventions.md");
    await rebuildConventions(conventionsPath, []);

    const content = await readFile(conventionsPath, "utf-8");
    assert.ok(content.includes("<!-- MANUAL:START -->"), "should contain MANUAL:START");
    assert.ok(content.includes("<!-- MANUAL:END -->"), "should contain MANUAL:END");
    assert.ok(content.includes("<!-- AUTO:START -->"), "should contain AUTO:START");
    assert.ok(content.includes("<!-- AUTO:END -->"), "should contain AUTO:END");
  });

  // TC-22: MANUAL セクションのバイト一致保持 (AC-8)
  it("TC-22: preserves MANUAL section content byte-for-byte", async () => {
    const conventionsPath = tmpPath("manual-preserve.md");
    const manualContent = `
## Human Written Section

- Rule 1: Do not use eval()
- Rule 2: Always validate inputs

  Indented content here
`;
    const initialContent = `# Review Conventions\n\n<!-- MANUAL:START -->${manualContent}<!-- MANUAL:END -->\n\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n`;
    await writeFile(conventionsPath, initialContent);

    await rebuildConventions(conventionsPath, []);

    const result = await readFile(conventionsPath, "utf-8");
    const manualStart = result.indexOf("<!-- MANUAL:START -->") + "<!-- MANUAL:START -->".length;
    const manualEnd = result.indexOf("<!-- MANUAL:END -->");
    const extractedManual = result.slice(manualStart, manualEnd);
    assert.equal(extractedManual, manualContent);
  });

  // TC-23: AUTO セクションの全置換 (AC-8)
  it("TC-23: replaces AUTO section with new autoEntries", async () => {
    const conventionsPath = tmpPath("auto-replace.md");
    // 旧フォーマット（c-old が含まれる）
    const oldContent = `# Review Conventions\n\n<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n\n<!-- AUTO:START -->\n## old-category\n- old pattern / 対策: old suggestion\n<!-- AUTO:END -->\n`;
    await writeFile(conventionsPath, oldContent);

    const newEntries = [
      {
        cluster_id: "c-001",
        category: "format-fragility",
        pattern: "独自の中間フォーマットを使う",
        suggestion: "JSONL で統一する",
        size: 2,
      },
    ];
    await rebuildConventions(conventionsPath, newEntries);

    const result = await readFile(conventionsPath, "utf-8");
    assert.ok(!result.includes("old-category"), "old AUTO content should be replaced");
    assert.ok(result.includes("format-fragility"), "new category should be present");
    assert.ok(result.includes("独自の中間フォーマットを使う"), "new pattern should be present");
    assert.ok(result.includes("JSONL で統一する"), "new suggestion should be present");
  });

  // TC-24: autoEntries が空配列の場合 AUTO セクションは空（マーカーのみ）
  it("TC-24: AUTO section is empty when autoEntries is empty array", async () => {
    const conventionsPath = tmpPath("empty-auto.md");
    // 新フォーマット（category ヘッダーあり）で初期化
    const initialContent = `<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n## something\n- some pattern / 対策: some suggestion\n<!-- AUTO:END -->\n`;
    await writeFile(conventionsPath, initialContent);

    await rebuildConventions(conventionsPath, []);

    const result = await readFile(conventionsPath, "utf-8");
    const autoStart = result.indexOf("<!-- AUTO:START -->") + "<!-- AUTO:START -->".length;
    const autoEnd = result.indexOf("<!-- AUTO:END -->");
    const autoContent = result.slice(autoStart, autoEnd);
    assert.equal(autoContent.trim(), "", "AUTO section should be empty when no entries");
  });

  // TC-25: 複数クラスタの整形
  it("TC-25: formats multiple clusters correctly", async () => {
    const conventionsPath = tmpPath("multi-cluster.md");
    const initialContent = `<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n`;
    await writeFile(conventionsPath, initialContent);

    const entries = [
      {
        cluster_id: "c-001",
        category: "format-fragility",
        pattern: "独自の中間フォーマットを使う",
        suggestion: "JSONL で統一する",
        size: 2,
      },
      {
        cluster_id: "c-002",
        category: "prompt-injection",
        pattern: "AI 出力を未検証で使う",
        suggestion: "長さ上限・制御文字除去",
        size: 3,
      },
    ];
    await rebuildConventions(conventionsPath, entries);

    const result = await readFile(conventionsPath, "utf-8");
    // 新フォーマット: ## <category> の見出しと - <pattern> / 対策: <suggestion> のエントリ
    assert.ok(result.includes("## format-fragility"), "format-fragility category header");
    assert.ok(result.includes("- 独自の中間フォーマットを使う / 対策: JSONL で統一する"), "c-001 entry in new format");
    assert.ok(result.includes("## prompt-injection"), "prompt-injection category header");
    assert.ok(result.includes("- AI 出力を未検証で使う / 対策: 長さ上限・制御文字除去"), "c-002 entry in new format");
    // cluster_id は Markdown に出力されない
    assert.ok(!result.includes("c-001"), "cluster_id should not appear in markdown");
    assert.ok(!result.includes("c-002"), "cluster_id should not appear in markdown");
  });

  // TC-26: マーカー不在時の自動マイグレーション
  it("TC-26: migrates existing content to MANUAL section when no markers present", async () => {
    const conventionsPath = tmpPath("migrate.md");
    const existingContent = `# Review Conventions\n\n## Existing Section\n\n- Some rule\n`;
    await writeFile(conventionsPath, existingContent);

    await rebuildConventions(conventionsPath, []);

    const result = await readFile(conventionsPath, "utf-8");
    assert.ok(result.includes("<!-- MANUAL:START -->"), "MANUAL:START should be added");
    assert.ok(result.includes("<!-- MANUAL:END -->"), "MANUAL:END should be added");
    assert.ok(result.includes("<!-- AUTO:START -->"), "AUTO:START should be added");
    assert.ok(result.includes("<!-- AUTO:END -->"), "AUTO:END should be added");

    // 既存コンテンツが MANUAL セクション内に含まれる
    const manualStart = result.indexOf("<!-- MANUAL:START -->") + "<!-- MANUAL:START -->".length;
    const manualEnd = result.indexOf("<!-- MANUAL:END -->");
    const manualContent = result.slice(manualStart, manualEnd);
    assert.ok(manualContent.includes("# Review Conventions"), "existing content in MANUAL section");
    assert.ok(manualContent.includes("## Existing Section"), "existing section in MANUAL");
    assert.ok(manualContent.includes("- Some rule"), "existing rule in MANUAL");
  });

  // TC-27: 空ファイルに対する適用
  it("TC-27: handles empty file by adding empty MANUAL section and AUTO section", async () => {
    const conventionsPath = tmpPath("empty-file.md");
    await writeFile(conventionsPath, "");

    await rebuildConventions(conventionsPath, []);

    const result = await readFile(conventionsPath, "utf-8");
    assert.ok(result.includes("<!-- MANUAL:START -->"), "should contain MANUAL:START");
    assert.ok(result.includes("<!-- MANUAL:END -->"), "should contain MANUAL:END");
    assert.ok(result.includes("<!-- AUTO:START -->"), "should contain AUTO:START");
    assert.ok(result.includes("<!-- AUTO:END -->"), "should contain AUTO:END");

    const manualStart = result.indexOf("<!-- MANUAL:START -->") + "<!-- MANUAL:START -->".length;
    const manualEnd = result.indexOf("<!-- MANUAL:END -->");
    const manualContent = result.slice(manualStart, manualEnd);
    assert.equal(manualContent.trim(), "", "MANUAL section should be empty for empty file");
  });

  // TC-28: tmpfile が残らない
  it("TC-28: no tmpfile remains after write", async () => {
    const conventionsPath = tmpPath("atomic-conventions.md");
    await writeFile(conventionsPath, "<!-- MANUAL:START -->\n<!-- MANUAL:END -->\n<!-- AUTO:START -->\n<!-- AUTO:END -->\n");

    await rebuildConventions(conventionsPath, []);

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(ctx.getTmpDir());
    const tmpFiles = files.filter((f) => f.startsWith("atomic-conventions.md.tmp"));
    assert.equal(tmpFiles.length, 0, "no tmp files should remain");
  });
});
