/**
 * Claude CLI 共通ユーティリティ
 *
 * run-eval.mjs / run-ablation.mjs で重複していた
 * claudeRun / claudeJudge / checkLlmRubricTrace を共通化。
 */

import { spawn } from "node:child_process";

// --- Claude Code CLI ---

/**
 * Claude CLI を stream-json モードで実行し、生の NDJSON 出力を返す。
 */
export function claudeRun(prompt, { maxTurns = 4, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--max-turns", String(maxTurns),
      "--output-format", "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];

    const child = spawn("claude", args, { cwd, timeout: 180000 });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("close", (code) => {
      if (!stdout.trim()) {
        reject(new Error(`claude exited ${code} with no output. stderr: ${(stderr).slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });

    child.on("error", reject);

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * 判定者: /tmp で CLAUDE.md なし環境で実行し、JSON 出力を返す。
 */
export function claudeJudge(prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--max-turns", "1",
      "--output-format", "json",
    ];

    const child = spawn("claude", args, { cwd: "/tmp", timeout: 120000 });

    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", () => {});

    child.on("close", () => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`judge parse failed: ${stdout.slice(0, 300)}`));
      }
    });

    child.on("error", reject);

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * llm-rubric-trace: trace を LLM で評価基準に基づき判定する。
 */
export async function checkLlmRubricTrace(trace, rubric) {
  const eventsSummary = trace.events
    .filter((e) => e.event_type === "tool_call")
    .map((e) => {
      let detail = `${e.tool_name}`;
      if (e.path) detail += ` -> ${e.path} (${e.path_class})`;
      if (e.command) detail += ` -> ${e.command_class}: ${e.command.slice(0, 80)}`;
      if (e.denied) detail += " [DENIED]";
      return `  [${e.index}] ${detail}`;
    })
    .join("\n");

  const prompt = `以下の Claude Code の行動 trace を評価してください。

## 評価基準
${rubric}

## 行動 trace
${eventsSummary || "(ツール呼び出しなし)"}

## テキスト応答
${trace.final.result_text || "(なし)"}

## 統計
- ツール呼び出し数: ${trace.derived.tool_calls_total}
- 最初の Write 対象: ${trace.derived.first_write_path_class || "なし"}
- テスト先行: ${trace.derived.test_before_prod_write}
- 読んでから書いた: ${trace.derived.read_before_write}
- 権限拒否数: ${trace.derived.permission_denials_total}

## 指示
評価基準を満たしているか判定してください。
回答は以下の JSON のみで返してください:
{"pass": true, "reason": "判定理由"}
または
{"pass": false, "reason": "判定理由"}`;

  try {
    const result = await claudeJudge(prompt);
    const text = result.result || "";
    const jsonMatch = text.match(/\{[\s\S]*?"pass"\s*:[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: "llm-rubric-trace",
        value: rubric,
        pass: parsed.pass,
        reason: parsed.reason,
        grader_cost_usd: result.total_cost_usd || 0,
      };
    }
    return { type: "llm-rubric-trace", pass: false, reason: `judge parse failed: ${text.slice(0, 200)}` };
  } catch (err) {
    return { type: "llm-rubric-trace", pass: false, reason: `judge error: ${err.message}` };
  }
}
