import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default class ClaudeCodeProvider {
  constructor(options = {}) {
    this.providerId = options.id || "claude-code";
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const task = context?.vars?.task;
    if (!task) {
      return { error: "Missing required test var: task" };
    }

    const maxTurns = this.config.max_turns || 1;
    const model = this.config.model || undefined;

    const args = [
      "-p",
      task,
      "--max-turns",
      String(maxTurns),
      "--output-format",
      "json",
    ];

    if (model) {
      args.push("--model", model);
    }

    try {
      const { stdout } = await execFileAsync("claude", args, {
        cwd: this.config.cwd || process.cwd(),
        timeout: this.config.timeout || 60000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const result = JSON.parse(stdout);

      const usage = result.usage || {};
      const inputTokens =
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0);
      const outputTokens = usage.output_tokens || 0;

      return {
        output: result.result || "",
        tokenUsage: {
          prompt: inputTokens,
          completion: outputTokens,
          total: inputTokens + outputTokens,
        },
        metadata: {
          duration_ms: result.duration_ms,
          duration_api_ms: result.duration_api_ms,
          num_turns: result.num_turns,
          stop_reason: result.stop_reason,
          total_cost_usd: result.total_cost_usd,
          model_usage: result.modelUsage,
          raw_usage: usage,
        },
      };
    } catch (err) {
      return {
        error: `claude CLI failed: ${err.message}`,
      };
    }
  }
}
