/**
 * test-runner.mjs — 単一テストケースの実行
 *
 * run-eval.mjs と run-stability.mjs で共通利用する。
 */

import { basename } from "node:path";
import { parseStreamJson, buildTrace } from "./trace.mjs";
import { runAssertionPipeline } from "./assertions.mjs";
import { claudeRun, checkLlmRubricTrace } from "./claude-cli.mjs";
import { prepareWorkdir, cleanupWorkdir } from "./workdir.mjs";

/**
 * 単一テストケースを実行して結果を返す。
 *
 * @param {object} test - テストケース定義
 * @param {object} options
 * @param {string} options.caseFile - ケースファイル名
 * @param {string|null} options.caseFixture - ケース共通 fixture 名
 * @param {number} options.defaultMaxTurns - デフォルト最大ターン数
 * @returns {Promise<object>} テスト結果
 */
export async function runSingleTest(test, { caseFile, caseFixture, defaultMaxTurns }) {
  const caseId = `${basename(caseFile, ".yaml")}/${test.description}`;
  const maxTurns = test.run?.max_turns || defaultMaxTurns;
  const fixture = test.fixture || caseFixture;

  // 1. 一時ディレクトリを作成し fixture をコピー（ルールあり）
  const workdir = prepareWorkdir(fixture);

  try {
    // 2. Claude Code 実行 (stream-json)
    let ndjson;
    try {
      ndjson = await claudeRun(test.vars.task, { maxTurns, cwd: workdir });
    } catch (err) {
      console.log(`  ${test.description} ... INFRA_ERROR`);
      return {
        case_id: caseId,
        case_file: caseFile,
        description: test.description,
        task: test.vars.task,
        infra_error: err.message,
        pass: null,
      };
    }

    // 3. trace-v1 に正規化
    const rawMessages = parseStreamJson(ndjson);
    const trace = buildTrace({
      rawMessages,
      caseId,
      caseFile,
      testDescription: test.description,
      task: test.vars.task,
    });

    // 4. 決定的 assertion + llm-rubric-trace を実行
    const results = await runAssertionPipeline(trace, test.assert || [], checkLlmRubricTrace);

    const allPass = results.every((r) => r.pass === true);
    console.log(`  ${test.description} ... ${allPass ? "PASS" : "FAIL"}`);

    if (!allPass) {
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`    x ${r.type}: ${r.reason}`);
      }
    }

    return {
      case_id: caseId,
      case_file: caseFile,
      description: test.description,
      task: test.vars.task,
      pass: allPass,
      assertions: results,
      trace,
    };
  } finally {
    cleanupWorkdir(workdir);
  }
}
