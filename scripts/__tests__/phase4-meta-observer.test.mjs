/**
 * phase4-meta-observer.test.mjs
 *
 * TDD テスト: Phase 4 L3 メタ監視層のファイル存在確認 + 構造検証
 *
 * AC-P4-1: meta-observer.md が存在し、frontmatter に tools: と model: opus が含まれる
 * AC-P4-2: observation-points.yaml が存在し、YAML としてパース可能で categories に product/harness/meta の3カテゴリがある
 * AC-P4-3: observation-management.md が存在する
 * AC-P4-4: observation-points.yaml の各 point に id/description/added/status が含まれる
 * AC-P4-5: 全 point の status が active である（初期状態）
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd());

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * frontmatter を YAML としてパースする（簡易実装）。
 * --- から --- の間を抽出して key: value の Map を返す。
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const result = {};
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (keyMatch) {
      if (currentKey && currentList) {
        result[currentKey] = currentList;
      }
      currentKey = keyMatch[1];
      const val = keyMatch[2].trim();
      if (val === "") {
        currentList = [];
        result[currentKey] = currentList;
      } else {
        currentList = null;
        result[currentKey] = val;
      }
    } else if (line.match(/^\s+-\s+(.+)/) && currentList !== null) {
      const itemMatch = line.match(/^\s+-\s+(.+)/);
      currentList.push(itemMatch[1].trim());
    }
  }
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  }
  return result;
}

/**
 * observation-points.yaml を簡易パースする。
 * categories の各カテゴリ名と、各 point の id/description/added/status を抽出する。
 */
function parseObservationPoints(content) {
  const categories = [];
  const points = [];

  // カテゴリ名を抽出（インデント2スペース + 英字キー + コロン）
  const categoryPattern = /^  (\w[\w-]*):\s*$/gm;
  let match;
  while ((match = categoryPattern.exec(content)) !== null) {
    // version, last_updated などのトップレベルキーを除外
    const name = match[1];
    if (name !== "version" && name !== "last_updated") {
      categories.push(name);
    }
  }

  // 各 point ブロックを抽出（- id: で始まるブロック）
  const pointBlocks = content.split(/(?=\s+- id:)/);
  for (const block of pointBlocks) {
    const idMatch = block.match(/- id:\s*(\S+)/);
    if (!idMatch) continue;

    const descMatch = block.match(/description:\s*"([^"]+)"/);
    const addedMatch = block.match(/added:\s*"([^"]+)"/);
    const statusMatch = block.match(/status:\s*(\S+)/);

    if (idMatch) {
      points.push({
        id: idMatch[1],
        description: descMatch ? descMatch[1] : null,
        added: addedMatch ? addedMatch[1] : null,
        status: statusMatch ? statusMatch[1] : null,
      });
    }
  }

  return { categories, points };
}

describe("Phase 4 L3 メタ監視層: meta-observer.md の確認", () => {
  // AC-P4-1: meta-observer.md が存在する
  it("AC-P4-1: .claude/agents/meta-observer.md が存在する", async () => {
    const path = resolve(projectRoot, ".claude/agents/meta-observer.md");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  it("AC-P4-1: meta-observer.md に frontmatter が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/meta-observer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
  });

  it("AC-P4-1: meta-observer.md の frontmatter に tools: が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/agents/meta-observer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
    assert.ok("tools" in fm, "frontmatter に tools キーが存在しない");
    const tools = fm.tools;
    const hasTools = Array.isArray(tools) ? tools.length > 0 : typeof tools === "string" && tools.length > 0;
    assert.ok(hasTools, "tools に要素がある");
  });

  it("AC-P4-1: meta-observer.md の frontmatter の model が opus である", async () => {
    const path = resolve(projectRoot, ".claude/agents/meta-observer.md");
    const content = await readFile(path, "utf-8");
    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, "frontmatter が存在しない");
    assert.ok("model" in fm, "frontmatter に model キーが存在しない");
    assert.ok(fm.model.includes("opus"), `model が opus でない: ${fm.model}`);
  });
});

describe("Phase 4 L3 メタ監視層: observation-points.yaml の確認", () => {
  // AC-P4-2: observation-points.yaml が存在し、3カテゴリある
  it("AC-P4-2: .claude/harness/observation-points.yaml が存在する", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  it("AC-P4-2: observation-points.yaml に categories キーが含まれる", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    assert.ok(content.includes("categories:"), "categories キーが含まれていない");
  });

  it("AC-P4-2: observation-points.yaml に product カテゴリがある", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { categories } = parseObservationPoints(content);
    assert.ok(categories.includes("product"), `product カテゴリが存在しない。検出したカテゴリ: ${categories}`);
  });

  it("AC-P4-2: observation-points.yaml に harness カテゴリがある", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { categories } = parseObservationPoints(content);
    assert.ok(categories.includes("harness"), `harness カテゴリが存在しない。検出したカテゴリ: ${categories}`);
  });

  it("AC-P4-2: observation-points.yaml に meta カテゴリがある", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { categories } = parseObservationPoints(content);
    assert.ok(categories.includes("meta"), `meta カテゴリが存在しない。検出したカテゴリ: ${categories}`);
  });

  // AC-P4-4: 各 point に id/description/added/status が含まれる
  it("AC-P4-4: observation-points.yaml の各 point に id が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { points } = parseObservationPoints(content);
    assert.ok(points.length > 0, "point が1件も見つからない");
    for (const point of points) {
      assert.ok(point.id, `id が null の point が存在する`);
    }
  });

  it("AC-P4-4: observation-points.yaml の各 point に description が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { points } = parseObservationPoints(content);
    assert.ok(points.length > 0, "point が1件も見つからない");
    for (const point of points) {
      assert.ok(point.description, `description が null の point が存在する: ${point.id}`);
    }
  });

  it("AC-P4-4: observation-points.yaml の各 point に added が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { points } = parseObservationPoints(content);
    assert.ok(points.length > 0, "point が1件も見つからない");
    for (const point of points) {
      assert.ok(point.added, `added が null の point が存在する: ${point.id}`);
    }
  });

  it("AC-P4-4: observation-points.yaml の各 point に status が含まれる", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { points } = parseObservationPoints(content);
    assert.ok(points.length > 0, "point が1件も見つからない");
    for (const point of points) {
      assert.ok(point.status, `status が null の point が存在する: ${point.id}`);
    }
  });

  // AC-P4-5: 全 point の status が active
  it("AC-P4-5: 全 point の status が active である（初期状態）", async () => {
    const path = resolve(projectRoot, ".claude/harness/observation-points.yaml");
    const content = await readFile(path, "utf-8");
    const { points } = parseObservationPoints(content);
    assert.ok(points.length > 0, "point が1件も見つからない");
    for (const point of points) {
      assert.strictEqual(
        point.status,
        "active",
        `status が active でない point が存在する: id=${point.id}, status=${point.status}`,
      );
    }
  });
});

describe("Phase 4 L3 メタ監視層: observation-management.md の確認", () => {
  // AC-P4-3: observation-management.md が存在する
  it("AC-P4-3: .claude/rules/observation-management.md が存在する", async () => {
    const path = resolve(projectRoot, ".claude/rules/observation-management.md");
    assert.ok(await fileExists(path), `ファイルが存在しない: ${path}`);
  });

  it("AC-P4-3: observation-management.md に人間承認ゲートの記述がある", async () => {
    const path = resolve(projectRoot, ".claude/rules/observation-management.md");
    const content = await readFile(path, "utf-8");
    assert.ok(
      content.includes("人間承認"),
      "人間承認ゲートの記述が含まれていない",
    );
  });

  it("AC-P4-3: observation-management.md に観点のライフサイクル（proposed/active/deprecated）の記述がある", async () => {
    const path = resolve(projectRoot, ".claude/rules/observation-management.md");
    const content = await readFile(path, "utf-8");
    assert.ok(content.includes("proposed"), "proposed の記述が含まれていない");
    assert.ok(content.includes("active"), "active の記述が含まれていない");
    assert.ok(content.includes("deprecated"), "deprecated の記述が含まれていない");
  });
});

describe("Phase 4 L3 メタ監視層: retrospective SKILL.md への統合", () => {
  it("retrospective SKILL.md に meta-observer の dispatch 指示が追加されている", async () => {
    const path = resolve(projectRoot, ".claude/skills/retrospective/SKILL.md");
    const content = await readFile(path, "utf-8");
    assert.ok(
      content.includes("meta-observer"),
      "meta-observer の参照が含まれていない",
    );
  });

  it("retrospective SKILL.md の meta-observer dispatch に observation-points.yaml への参照がある", async () => {
    const path = resolve(projectRoot, ".claude/skills/retrospective/SKILL.md");
    const content = await readFile(path, "utf-8");
    assert.ok(
      content.includes("observation-points.yaml"),
      "observation-points.yaml への参照が含まれていない",
    );
  });

  it("retrospective SKILL.md の meta-observer dispatch に条件（直近3セッション）の記述がある", async () => {
    const path = resolve(projectRoot, ".claude/skills/retrospective/SKILL.md");
    const content = await readFile(path, "utf-8");
    assert.ok(
      content.includes("3セッション") || content.includes("3 セッション"),
      "直近3セッションの条件記述が含まれていない",
    );
  });
});
