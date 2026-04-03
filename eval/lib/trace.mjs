/**
 * trace.mjs — stream-json の NDJSON を trace-v1 に正規化する
 *
 * 責務:
 * 1. stream-json の各行をパースしてイベント列に変換
 * 2. ファイルパスを path_class (test/prod/docs/tmp/unknown) に分類
 * 3. 派生特徴量 (derived) を計算
 */

// --- path_class 分類 ---

const TEST_PATTERNS = [
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\/spec\//,
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
  /_test\.\w+$/,
  /_spec\.\w+$/,
];

const DOCS_PATTERNS = [/\/docs\//, /\.md$/, /\.mdx$/, /README/i];

const TMP_PATTERNS = [
  /^\/tmp\//,
  /^\/private\/tmp\//,
  /\/\.cache\//,
  /\/dist\//,
  /\/build\//,
  /\/coverage\//,
  /\/node_modules\//,
];

export function classifyPath(filePath) {
  if (!filePath || typeof filePath !== "string") return "unknown";
  for (const p of TEST_PATTERNS) if (p.test(filePath)) return "test";
  for (const p of DOCS_PATTERNS) if (p.test(filePath)) return "docs";
  for (const p of TMP_PATTERNS) if (p.test(filePath)) return "tmp";
  return "prod";
}

// Bash コマンドの分類
export function classifyCommand(command) {
  if (!command || typeof command !== "string") return "unknown";
  if (/\b(npm test|npx jest|npx vitest|yarn test|pnpm test|pytest|go test|cargo test|node --test)\b/.test(command)) return "test";
  if (/\bgit\b/.test(command)) return "git";
  if (/\b(grep|rg|find|ls|cat|head|tail|wc)\b/.test(command)) return "search";
  if (/\b(npm run build|npx tsc|make|cargo build|go build)\b/.test(command)) return "build";
  if (/\b(npm install|yarn add|pnpm add|pip install)\b/.test(command)) return "install";
  return "other";
}

// tool_use からファイルパスを抽出
function extractPath(toolName, input) {
  if (!input) return null;
  if (toolName === "Write" || toolName === "Edit" || toolName === "Read") {
    return input.file_path || null;
  }
  if (toolName === "Glob") {
    return input.path || null;
  }
  if (toolName === "Grep") {
    return input.path || null;
  }
  return null;
}

// --- NDJSON パーサ ---

export function parseStreamJson(ndjsonText) {
  const lines = ndjsonText.split("\n").filter((l) => l.trim());
  const parsed = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return parsed;
}

// --- trace-v1 生成 ---

export function buildTrace({ rawMessages, caseId, caseFile, testDescription, task }) {
  const events = [];
  let eventIndex = 0;
  let turnIndex = 0;

  // 最終 result
  let finalResult = null;
  let sessionId = null;

  // permission_denials は result に含まれる
  let permissionDenials = [];

  for (const msg of rawMessages) {
    if (msg.type === "assistant") {
      turnIndex++;
      const content = msg.message?.content || [];
      for (const block of content) {
        if (block.type === "tool_use") {
          const path = extractPath(block.name, block.input);
          events.push({
            index: eventIndex++,
            turn_index: turnIndex,
            source_type: "assistant",
            event_type: "tool_call",
            tool_name: block.name,
            tool_use_id: block.id,
            parent_tool_use_id: msg.parent_tool_use_id || null,
            raw_input: block.input,
            path,
            path_class: path ? classifyPath(path) : null,
            command: block.name === "Bash" ? block.input?.command || null : null,
            command_class: block.name === "Bash" ? classifyCommand(block.input?.command) : null,
            denied: false,
            error: null,
          });
        } else if (block.type === "text" && block.text) {
          events.push({
            index: eventIndex++,
            turn_index: turnIndex,
            source_type: "assistant",
            event_type: "text",
            text_preview: block.text.slice(0, 200),
          });
        }
      }
      if (!sessionId && msg.session_id) sessionId = msg.session_id;
    } else if (msg.type === "user") {
      const content = msg.message?.content || [];
      for (const block of content) {
        if (block.type === "tool_result") {
          events.push({
            index: eventIndex++,
            turn_index: turnIndex,
            source_type: "user",
            event_type: "tool_result",
            tool_use_id: block.tool_use_id,
            is_error: block.is_error || false,
          });
          // permission denied の場合は denied フラグを立てる
          // (対応する tool_call を更新)
        }
      }
    } else if (msg.type === "result") {
      finalResult = msg;
      permissionDenials = msg.permission_denials || [];
      if (!sessionId && msg.session_id) sessionId = msg.session_id;
    }
  }

  // permission_denials を対応する tool_call に反映
  for (const denial of permissionDenials) {
    const toolCallEvent = events.find(
      (e) => e.event_type === "tool_call" && e.tool_use_id === denial.tool_use_id,
    );
    if (toolCallEvent) {
      toolCallEvent.denied = true;
      toolCallEvent.error = "permission_denied";
    }
  }

  // derived 特徴量を計算
  const derived = computeDerived(events, permissionDenials);

  const usage = finalResult?.usage || {};

  return {
    trace_version: "v1",
    case_id: caseId,
    case_file: caseFile,
    test_description: testDescription,
    task,

    run: {
      runner: "claude-cli",
      cli_version: finalResult?.modelUsage
        ? Object.keys(finalResult.modelUsage)[0]
        : "unknown",
      output_format: "stream-json",
      session_id: sessionId,
    },

    final: {
      subtype: finalResult?.subtype || "unknown",
      is_error: finalResult?.is_error || false,
      stop_reason: finalResult?.stop_reason || null,
      terminal_reason: finalResult?.terminal_reason || null,
      num_turns: finalResult?.num_turns || 0,
      result_text: finalResult?.result || "",
    },

    usage: {
      input_tokens: usage.input_tokens || 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      total_cost_usd: finalResult?.total_cost_usd || 0,
      duration_ms: finalResult?.duration_ms || 0,
      duration_api_ms: finalResult?.duration_api_ms || 0,
    },

    permission_denials: permissionDenials,
    events,
    derived,
  };
}

// --- 派生特徴量 ---

function computeDerived(events, permissionDenials) {
  const toolCalls = events.filter((e) => e.event_type === "tool_call");
  const writeAttempts = toolCalls.filter(
    (e) => e.tool_name === "Write" || e.tool_name === "Edit",
  );

  // ツール呼び出し回数
  const toolCallsByName = {};
  for (const e of toolCalls) {
    toolCallsByName[e.tool_name] = (toolCallsByName[e.tool_name] || 0) + 1;
  }

  // Write の path_class 別カウント
  const writesByPathClass = { test: 0, prod: 0, docs: 0, tmp: 0, unknown: 0 };
  for (const e of writeAttempts) {
    const cls = e.path_class || "unknown";
    writesByPathClass[cls] = (writesByPathClass[cls] || 0) + 1;
  }

  // 最初の Write の path_class
  const firstWrite = writeAttempts[0] || null;
  const firstProdWrite = writeAttempts.find((e) => e.path_class === "prod");
  const firstTestWrite = writeAttempts.find((e) => e.path_class === "test");

  // Read/Grep/Glob が最初の Write より前にあるか
  const firstWriteIndex = firstWrite ? firstWrite.index : Infinity;
  const readBeforeWrite = toolCalls.some(
    (e) =>
      e.index < firstWriteIndex &&
      (e.tool_name === "Read" || e.tool_name === "Grep" || e.tool_name === "Glob"),
  );

  // テストファイルへの Write が本番 Write より前にあるか
  const testBeforeProdWrite =
    firstTestWrite && firstProdWrite
      ? firstTestWrite.index < firstProdWrite.index
      : firstTestWrite != null && firstProdWrite == null;

  // Bash でテスト実行したか
  const bashTestRun = toolCalls.some(
    (e) => e.tool_name === "Bash" && e.command_class === "test",
  );

  return {
    tool_calls_total: toolCalls.length,
    tool_calls_by_name: toolCallsByName,
    writes_total: writeAttempts.length,
    writes_by_path_class: writesByPathClass,
    first_tool_call: toolCalls[0]?.tool_name || null,
    first_write_path_class: firstWrite?.path_class || null,
    first_prod_write_index: firstProdWrite?.index ?? null,
    first_test_write_index: firstTestWrite?.index ?? null,
    read_before_write: readBeforeWrite,
    test_before_prod_write: testBeforeProdWrite,
    bash_test_run: bashTestRun,
    empty_result_text: !events.some(
      (e) => e.event_type === "text" && e.source_type === "assistant",
    ),
    permission_denials_total: permissionDenials.length,
  };
}
