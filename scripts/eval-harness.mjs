#!/usr/bin/env node
/**
 * eval-harness.mjs
 *
 * workspace の定量メトリクスを収集して JSONL ファイルに追記する。
 *
 * Usage:
 *   node scripts/eval-harness.mjs <workspace-path> <output-jsonl> [harness-name]
 *
 * Example:
 *   node scripts/eval-harness.mjs workspace/ec-sample .claude/harness/eval-results-a.jsonl claude-code-harness
 *
 * 収集するメトリクス:
 *   tests          - npm test の pass count（parse できなければ null）
 *   test_files     - src/ 配下の *.test.ts ファイル数
 *   src_files      - src/ 配下の *.ts ファイル数（テスト除く）
 *   src_loc        - src/ 配下の *.ts ファイル（テスト除く）の行数合計
 *   test_loc       - src/ 配下の *.test.ts ファイルの行数合計
 *   test_code_ratio - test_loc / src_loc（src_loc が 0 なら null）
 *   stories_done   - progress.txt の [x] の数
 *   total_commits  - git log のコミット数
 *
 * Exit codes:
 *   0  正常完了
 *   1  workspace が存在しない等の致命的エラー
 */

import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * stability summary.json から指定 case_id の pass_k を取得する。
 *
 * @param {string} summaryJsonPath - summary.json のパス
 * @param {string} caseId - 検索する case_id
 * @returns {number | null} pass_k（見つからない場合は null）
 */
function getStabilityPassK(summaryJsonPath, caseId) {
  try {
    const raw = readFileSync(summaryJsonPath, "utf-8");
    const summary = JSON.parse(raw);
    const entry = summary.per_case?.find((c) => c.case_id === caseId);
    return entry ? entry.pass_k : null;
  } catch {
    return null;
  }
}

/**
 * コマンドを実行して stdout を返す。失敗した場合は null を返す。
 *
 * @param {string} cmd
 * @param {string} cwd
 * @returns {string | null}
 */
function tryExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/**
 * ディレクトリを再帰的に走査して条件に一致するファイルを返す。
 *
 * @param {string} dir
 * @param {(filename: string) => boolean} predicate
 * @returns {string[]}
 */
function findFiles(dir, predicate) {
  if (!existsSync(dir)) return [];

  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, predicate));
    } else if (predicate(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * ファイル一覧の行数合計を返す。
 *
 * @param {string[]} files
 * @returns {number}
 */
function countLines(files) {
  return files.reduce((total, file) => {
    try {
      const content = readFileSync(file, "utf-8");
      return total + content.split("\n").length;
    } catch {
      return total;
    }
  }, 0);
}

/**
 * npm test の stdout から pass count を抽出する。
 * vitest / node:test / jest 等の一般的な形式に対応。
 *
 * @param {string | null} output
 * @returns {number | null}
 */
function parseTestCount(output) {
  if (!output) return null;

  // node:test 形式: "ℹ pass 5"
  const nodeTestMatch = output.match(/ℹ\s+pass\s+(\d+)/);
  if (nodeTestMatch) return parseInt(nodeTestMatch[1], 10);

  // vitest 形式: "✓ 5 passed"
  const vitestMatch = output.match(/(\d+)\s+passed/);
  if (vitestMatch) return parseInt(vitestMatch[1], 10);

  // jest 形式: "Tests: 5 passed"
  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed/);
  if (jestMatch) return parseInt(jestMatch[1], 10);

  // echo 形式（fake）: "Tests: 5 passed" or "5 passed"
  const echoMatch = output.match(/(\d+)\s+passed/i);
  if (echoMatch) return parseInt(echoMatch[1], 10);

  return null;
}

/**
 * progress.txt から [x] の数を数える。
 *
 * @param {string} progressPath
 * @returns {number}
 */
function countStoriesDone(progressPath) {
  if (!existsSync(progressPath)) return 0;

  const content = readFileSync(progressPath, "utf-8");
  const matches = content.match(/\[x\]/gi);
  return matches ? matches.length : 0;
}

/**
 * メトリクスを収集して JSONL に追記する。
 *
 * @param {string} workspacePath
 * @param {string} outputJsonl
 * @param {string} harnessName
 * @param {object} [options]
 * @param {string|null} [options.stabilityJson=null] - stability summary.json のパス
 * @param {string|null} [options.stabilityCaseId=null] - 対象 case_id
 */
function collectMetrics(workspacePath, outputJsonl, harnessName, {
  stabilityJson = null,
  stabilityCaseId = null,
} = {}) {
  const absWorkspace = resolve(workspacePath);

  if (!existsSync(absWorkspace)) {
    process.stderr.write(`[eval-harness] error: workspace not found: ${absWorkspace}\n`);
    process.exit(1);
  }

  const srcDir = join(absWorkspace, "src");

  // ファイル一覧
  const testFiles = findFiles(srcDir, (name) => name.endsWith(".test.ts") || name.endsWith(".spec.ts"));
  const srcFiles = findFiles(srcDir, (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts") && !name.endsWith(".spec.ts"));

  // 行数
  const srcLoc = countLines(srcFiles);
  const testLoc = countLines(testFiles);
  const testCodeRatio = srcLoc > 0 ? Math.round((testLoc / srcLoc) * 100) / 100 : null;

  // npm test
  const testOutput = tryExec("npm test 2>&1", absWorkspace);
  const tests = parseTestCount(testOutput);

  // stories_done
  const storiesDone = countStoriesDone(join(absWorkspace, "progress.txt"));

  // git commits
  const gitLogOutput = tryExec("git log --oneline 2>/dev/null", absWorkspace);
  const totalCommits = gitLogOutput ? gitLogOutput.split("\n").filter((l) => l.trim()).length : 0;

  const entry = {
    timestamp: new Date().toISOString(),
    harness: harnessName,
    tests,
    test_files: testFiles.length,
    src_files: srcFiles.length,
    src_loc: srcLoc,
    test_loc: testLoc,
    test_code_ratio: testCodeRatio,
    stories_done: storiesDone,
    total_commits: totalCommits,
  };

  // --stability と --stability-case が両方指定された場合、stability_pass_k を追加
  if (stabilityJson && stabilityCaseId) {
    entry.stability_pass_k = getStabilityPassK(stabilityJson, stabilityCaseId);
  }

  const line = JSON.stringify(entry) + "\n";
  appendFileSync(outputJsonl, line, "utf-8");
}

// CLI エントリポイント
const argv = process.argv.slice(2);

// ポジション引数と --stability / --stability-case を分離する
const positionalArgs = [];
let stabilityJson = null;
let stabilityCaseId = null;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--stability" && i + 1 < argv.length) {
    stabilityJson = argv[++i];
  } else if (argv[i] === "--stability-case" && i + 1 < argv.length) {
    stabilityCaseId = argv[++i];
  } else {
    positionalArgs.push(argv[i]);
  }
}

const [workspacePath, outputJsonl, harnessName = "claude-code-harness"] = positionalArgs;

if (!workspacePath || !outputJsonl) {
  process.stderr.write(
    "Usage: node scripts/eval-harness.mjs <workspace-path> <output-jsonl> [harness-name] [--stability <summary.json>] [--stability-case <case-id>]\n",
  );
  process.exit(1);
}

collectMetrics(workspacePath, outputJsonl, harnessName, { stabilityJson, stabilityCaseId });
