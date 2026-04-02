import Anthropic from "@anthropic-ai/sdk";

export default class AnthropicClaudeProvider {
  constructor(options = {}) {
    this.providerId = options.id || "anthropic-claude";
    this.config = options.config || {};
    this.client = new Anthropic({
      apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const model = this.config.model || "claude-sonnet-4-6";
    const maxTokens = this.config.max_tokens || 1200;
    const temperature = this.config.temperature ?? 0;

    const task = context?.vars?.task;
    if (!task) {
      return { error: "Missing required test var: task" };
    }

    const start = Date.now();

    const message = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: prompt,
      messages: [
        {
          role: "user",
          content: task,
        },
      ],
    });

    const latencyMs = Date.now() - start;

    const output = (message.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n\n");

    const inputTokens = message.usage?.input_tokens ?? 0;
    const outputTokens = message.usage?.output_tokens ?? 0;

    return {
      output,
      tokenUsage: {
        prompt: inputTokens,
        completion: outputTokens,
        total: inputTokens + outputTokens,
      },
      metadata: {
        latency_ms: latencyMs,
        stop_reason: message.stop_reason,
        model: message.model,
      },
    };
  }
}
