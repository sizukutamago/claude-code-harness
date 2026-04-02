#!/usr/bin/env node

/**
 * claude-code-harness eval runner PoC
 *
 * Claude Code CLI だけで完結する eval 実行スクリプト。
 * - eval/cases/*.yaml を読み込み
 * - 各テストを claude -p で実行
 * - not-contains は文字列マッチ、llm-rubric は claude -p で判定
 * - 結果を eval/results/ に JSON 保存
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolve, basename } from "node:path";
import { parse as parseYaml } from "yaml";

const execFileAsync = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "..");
const EVAL_DIR = resolve(import.meta.dirname);

// --- Claude Code CLI wrapper ---

function claudeSpawn(prompt, { bare = false, maxTurns = 2, cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--max-turns", String(maxTurns), "--output-format", "json"];
    if (bare) args.push("--bare");

    const child = spawn("claude", args, { cwd, timeout: 120000 });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });

    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`claude exited ${code}, failed to parse JSON: ${(stderr || stdout).slice(0, 300)}`));
      }
    });

    child.on("error", reject);

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// テスト対象: CLAUDE.md 込みで実行
function claudeRun(prompt, cwd = ROOT) {
  return claudeSpawn(prompt, { bare: false, maxTurns: 2, cwd });
}

// 判定者: CLAUDE.md がないディレクトリで実行してコンテキスト分離
function claudeJudge(prompt) {
  return claudeSpawn(prompt, { bare: false, maxTurns: 1, cwd: "/tmp" });
}

// --- Assertion checkers ---

function normalizeOutput(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

function checkNotContains(output, value) {
  const normalized = normalizeOutput(output);
  const pass = !normalized.includes(value);
  return {
    type: "not-contains",
    value,
    pass,
    reason: pass ? null : `Output contains "${value}"`,
  };
}

async function checkLlmRubric(output, rubric, behaviorContext = null) {
  const behaviorSection = behaviorContext
    ? `\n## 行動データ（Claude Code の実行ログ）\n${behaviorContext}\n`
    : "";

  const gradePrompt = `以下の Claude Code の応答と行動を評価してください。

## 評価基準
${rubric}

## 評価対象のテキスト応答
${output || "(テキスト応答なし — ツール呼び出しのみ)"}
${behaviorSection}
## 指示
評価基準を満たしているかを判定してください。テキスト応答だけでなく、行動データ（ツール呼び出し、権限拒否等）も考慮してください。
回答は必ず以下の JSON 形式のみで返してください（他のテキストは不要）:
{"pass": true, "reason": "判定理由"}
または
{"pass": false, "reason": "判定理由"}`;

  try {
    const result = await claudeJudge(gradePrompt);
    const text = result.result || "";
    // JSON を抽出
    const jsonMatch = text.match(/\{[\s\S]*?"pass"\s*:[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: "llm-rubric",
        value: rubric,
        pass: parsed.pass,
        reason: parsed.reason,
        grader_tokens: {
          input: result.usage?.input_tokens || 0,
          output: result.usage?.output_tokens || 0,
        },
        grader_cost_usd: result.total_cost_usd || 0,
      };
    }
    return {
      type: "llm-rubric",
      value: rubric,
      pass: false,
      reason: `Failed to parse grader response: ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      type: "llm-rubric",
      value: rubric,
      pass: false,
      reason: `Grader error: ${err.message}`,
    };
  }
}

async function runAssertions(output, assertions, behaviorContext = null) {
  const results = [];
  for (const assertion of assertions) {
    if (assertion.type === "not-contains") {
      results.push(checkNotContains(output, assertion.value));
    } else if (assertion.type === "llm-rubric") {
      results.push(await checkLlmRubric(output, assertion.value, behaviorContext));
    } else {
      results.push({
        type: assertion.type,
        value: assertion.value,
        pass: false,
        reason: `Unsupported assertion type: ${assertion.type}`,
      });
    }
  }
  return results;
}

// --- Main ---

async function runEval(caseFiles) {
  const runId = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const gitSha = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: ROOT,
  })
    .then((r) => r.stdout.trim())
    .catch(() => "unknown");

  const claudeVersion = await execFileAsync("claude", ["--version"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
    .then((r) => r.stdout.trim())
    .catch(() => "unknown");

  console.log(`\n=== Eval Run: ${runId} ===`);
  console.log(`Git SHA: ${gitSha}`);
  console.log(`Cases: ${caseFiles.join(", ")}\n`);

  const allResults = [];

  for (const caseFile of caseFiles) {
    const filePath = resolve(EVAL_DIR, "cases", caseFile);
    const raw = readFileSync(filePath, "utf-8");
    const config = parseYaml(raw);

    console.log(`--- ${caseFile} (${config.tests.length} tests) ---`);

    for (const test of config.tests) {
      const testId = `${basename(caseFile, ".yaml")}/${test.description}`;
      process.stdout.write(`  ${test.description} ... `);

      // テスト実行
      let claudeResult;
      try {
        claudeResult = await claudeRun(test.vars.task);
      } catch (err) {
        console.log("INFRA_ERROR");
        allResults.push({
          test_id: testId,
          case_file: caseFile,
          description: test.description,
          task: test.vars.task,
          infra_error: err.message,
          pass: null,
        });
        continue;
      }

      const output = claudeResult.result || "";
      const usage = claudeResult.usage || {};

      // 行動データをテキスト化（判定者に渡す）
      const denials = claudeResult.permission_denials || [];
      const behaviorLines = [
        `stop_reason: ${claudeResult.stop_reason}`,
        `num_turns: ${claudeResult.num_turns}`,
        `is_error: ${claudeResult.is_error}`,
      ];
      if (denials.length > 0) {
        behaviorLines.push(`permission_denials (${denials.length}):`);
        for (const d of denials) {
          behaviorLines.push(`  - tool: ${d.tool_name}, input_keys: ${Object.keys(d.tool_input || {}).join(", ")}`);
        }
      }
      const behaviorContext = behaviorLines.join("\n");

      // アサーション実行
      const assertionResults = await runAssertions(output, test.assert || [], behaviorContext);
      const allPass = assertionResults.every((a) => a.pass);

      console.log(allPass ? "PASS" : "FAIL");

      if (!allPass) {
        for (const a of assertionResults.filter((a) => !a.pass)) {
          console.log(`    ✗ ${a.type}: ${a.reason}`);
        }
      }

      allResults.push({
        test_id: testId,
        case_file: caseFile,
        description: test.description,
        task: test.vars.task,
        pass: allPass,
        output: output.slice(0, 500),
        assertions: assertionResults,
        metrics: {
          duration_ms: claudeResult.duration_ms,
          duration_api_ms: claudeResult.duration_api_ms,
          input_tokens: usage.input_tokens || 0,
          cache_creation_tokens: usage.cache_creation_input_tokens || 0,
          cache_read_tokens: usage.cache_read_input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          total_cost_usd: claudeResult.total_cost_usd || 0,
          num_turns: claudeResult.num_turns || 0,
          stop_reason: claudeResult.stop_reason,
        },
      });
    }
  }

  // サマリー
  const passed = allResults.filter((r) => r.pass === true).length;
  const failed = allResults.filter((r) => r.pass === false).length;
  const infraErrors = allResults.filter((r) => r.pass === null).length;
  const evaluated = passed + failed;
  const totalCost = allResults.reduce(
    (sum, r) => sum + (r.metrics?.total_cost_usd || 0),
    0,
  );
  const totalInputTokens = allResults.reduce(
    (sum, r) =>
      sum +
      (r.metrics?.input_tokens || 0) +
      (r.metrics?.cache_creation_tokens || 0) +
      (r.metrics?.cache_read_tokens || 0),
    0,
  );
  const totalOutputTokens = allResults.reduce(
    (sum, r) => sum + (r.metrics?.output_tokens || 0),
    0,
  );

  const summary = {
    run_id: runId,
    git_sha: gitSha,
    claude_version: claudeVersion,
    timestamp: new Date().toISOString(),
    total_tests: allResults.length,
    evaluated,
    passed,
    failed,
    infra_errors: infraErrors,
    pass_rate: evaluated > 0 ? `${((passed / evaluated) * 100).toFixed(1)}%` : "N/A",
    total_cost_usd: totalCost.toFixed(4),
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    notes: "llm-rubric uses same Claude Code instance (self-grading bias acknowledged)",
  };

  console.log(`\n=== Summary ===`);
  console.log(`Pass: ${passed}/${evaluated} (${summary.pass_rate})`);
  console.log(`Failed: ${failed}, Infra Errors: ${infraErrors}`);
  console.log(`Cost: $${summary.total_cost_usd}`);
  console.log(
    `Tokens: ${totalInputTokens} in / ${totalOutputTokens} out`,
  );

  // 保存
  const resultData = { summary, results: allResults };
  const outDir = resolve(EVAL_DIR, "results", "raw");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(resultData, null, 2));
  console.log(`\nResults saved: ${outPath}`);

  return resultData;
}

// CLI
const args = process.argv.slice(2);
const caseFiles =
  args.length > 0 ? args : ["tdd-enforcement.yaml"];

runEval(caseFiles).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
