/**
 * assertions.mjs — trace-v1 に対する判定ロジック
 *
 * 7種の assertion type:
 * - sequence: イベント順序の制約（before_first, ordered, exists）
 * - tool-call: 特定ツール呼び出しの有無・回数
 * - file-op: ファイル操作の path_class 別チェック
 * - permission-denial: 権限拒否の有無・対象
 * - metric: 数値指標のしきい値判定
 * - stop-reason: 終了理由の一致
 * - llm-rubric-trace: LLM による補助判定（曖昧ケース用）
 */

// --- イベントマッチャ ---

function matches(event, predicate) {
  return Object.entries(predicate).every(([key, value]) => event[key] === value);
}

// --- sequence ---

function checkSequence(trace, assertion) {
  const events = trace.events.filter((e) => e.event_type === "tool_call");
  const rule = assertion.rule;

  if (rule === "before_first") {
    // anchor より前に require_any のどれかがあるか
    const anchorIndex = events.findIndex((e) => matches(e, assertion.anchor));
    if (anchorIndex === -1) {
      return { type: "sequence", pass: true, reason: "anchor not found (no violation)" };
    }
    const prefix = events.slice(0, anchorIndex);
    const found = assertion.require_any.some((pred) => prefix.some((e) => matches(e, pred)));
    return {
      type: "sequence",
      rule,
      pass: found,
      reason: found
        ? `required event found before anchor at index ${anchorIndex}`
        : `no required event found before anchor at index ${anchorIndex}`,
    };
  }

  if (rule === "ordered") {
    // first が second より前にあるか
    const firstIndex = events.findIndex((e) => matches(e, assertion.first));
    const secondIndex = events.findIndex((e) => matches(e, assertion.second));
    if (firstIndex === -1) {
      return { type: "sequence", rule, pass: false, reason: "first event not found" };
    }
    if (secondIndex === -1) {
      return { type: "sequence", rule, pass: true, reason: "second event not found (no violation)" };
    }
    const pass = firstIndex < secondIndex;
    return {
      type: "sequence",
      rule,
      pass,
      reason: pass
        ? `first at ${firstIndex}, second at ${secondIndex}`
        : `order violated: first at ${firstIndex}, second at ${secondIndex}`,
    };
  }

  if (rule === "exists") {
    const found = events.some((e) => matches(e, assertion.match));
    return {
      type: "sequence",
      rule,
      pass: assertion.expect === false ? !found : found,
      reason: found ? "matching event found" : "no matching event found",
    };
  }

  return { type: "sequence", pass: false, reason: `unknown rule: ${rule}` };
}

// --- tool-call ---

function checkToolCall(trace, assertion) {
  const calls = trace.events.filter(
    (e) => e.event_type === "tool_call" && e.tool_name === assertion.tool_name,
  );
  const count = calls.length;

  if (assertion.count != null) {
    const pass = count === assertion.count;
    return { type: "tool-call", pass, reason: `${assertion.tool_name}: ${count} calls (expected ${assertion.count})` };
  }
  if (assertion.min != null && assertion.max != null) {
    const pass = count >= assertion.min && count <= assertion.max;
    return { type: "tool-call", pass, reason: `${assertion.tool_name}: ${count} calls (expected ${assertion.min}-${assertion.max})` };
  }
  if (assertion.min != null) {
    const pass = count >= assertion.min;
    return { type: "tool-call", pass, reason: `${assertion.tool_name}: ${count} calls (min ${assertion.min})` };
  }
  if (assertion.max != null) {
    const pass = count <= assertion.max;
    return { type: "tool-call", pass, reason: `${assertion.tool_name}: ${count} calls (max ${assertion.max})` };
  }
  // デフォルト: 1回以上あれば OK
  const pass = count > 0;
  return { type: "tool-call", pass, reason: `${assertion.tool_name}: ${count} calls` };
}

// --- file-op ---

function checkFileOp(trace, assertion) {
  const writes = trace.events.filter(
    (e) =>
      e.event_type === "tool_call" &&
      (e.tool_name === "Write" || e.tool_name === "Edit"),
  );

  let targets = writes;
  if (assertion.path_class) {
    targets = targets.filter((e) => e.path_class === assertion.path_class);
  }
  if (assertion.denied != null) {
    targets = targets.filter((e) => e.denied === assertion.denied);
  }

  const count = targets.length;

  if (assertion.count != null) {
    const pass = count === assertion.count;
    return { type: "file-op", pass, reason: `${assertion.path_class || "any"} writes: ${count} (expected ${assertion.count})` };
  }
  if (assertion.min != null) {
    const pass = count >= assertion.min;
    return { type: "file-op", pass, reason: `${assertion.path_class || "any"} writes: ${count} (min ${assertion.min})` };
  }
  if (assertion.max != null) {
    const pass = count <= assertion.max;
    return { type: "file-op", pass, reason: `${assertion.path_class || "any"} writes: ${count} (max ${assertion.max})` };
  }

  return { type: "file-op", pass: count > 0, reason: `${assertion.path_class || "any"} writes: ${count}` };
}

// --- permission-denial ---

function checkPermissionDenial(trace, assertion) {
  let denials = trace.permission_denials;

  if (assertion.tool_name) {
    denials = denials.filter((d) => d.tool_name === assertion.tool_name);
  }

  const count = denials.length;

  if (assertion.count != null) {
    const pass = count === assertion.count;
    return { type: "permission-denial", pass, reason: `denials: ${count} (expected ${assertion.count})` };
  }
  if (assertion.min != null) {
    const pass = count >= assertion.min;
    return { type: "permission-denial", pass, reason: `denials: ${count} (min ${assertion.min})` };
  }
  // デフォルト: 拒否がないことを期待
  const pass = count === 0;
  return { type: "permission-denial", pass, reason: `denials: ${count}` };
}

// --- metric ---

function checkMetric(trace, assertion) {
  // ドット区切りのパスで derived や usage から値を取得
  const value = getNestedValue(trace, assertion.metric);
  if (value == null) {
    return { type: "metric", pass: false, reason: `metric "${assertion.metric}" not found` };
  }

  let pass = true;
  const checks = [];

  if (assertion.eq != null) {
    pass = pass && value === assertion.eq;
    checks.push(`eq ${assertion.eq}`);
  }
  if (assertion.lt != null) {
    pass = pass && value < assertion.lt;
    checks.push(`lt ${assertion.lt}`);
  }
  if (assertion.lte != null) {
    pass = pass && value <= assertion.lte;
    checks.push(`lte ${assertion.lte}`);
  }
  if (assertion.gt != null) {
    pass = pass && value > assertion.gt;
    checks.push(`gt ${assertion.gt}`);
  }
  if (assertion.gte != null) {
    pass = pass && value >= assertion.gte;
    checks.push(`gte ${assertion.gte}`);
  }

  return {
    type: "metric",
    pass,
    reason: `${assertion.metric} = ${value} (${checks.join(", ")})`,
  };
}

function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

// --- stop-reason ---

function checkStopReason(trace, assertion) {
  const actual = trace.final.stop_reason;
  const pass = actual === assertion.value;
  return {
    type: "stop-reason",
    pass,
    reason: `stop_reason: "${actual}" (expected "${assertion.value}")`,
  };
}

// --- not-contains (後方互換) ---

function checkNotContains(trace, assertion) {
  const text = trace.final.result_text || "";
  const pass = !text.includes(assertion.value);
  return {
    type: "not-contains",
    pass,
    reason: pass ? null : `result text contains "${assertion.value}"`,
  };
}

// --- write-not-contains ---

function checkWriteNotContains(trace, assertion) {
  const writes = trace.events.filter(
    (e) =>
      e.event_type === "tool_call" &&
      (e.tool_name === "Write" || e.tool_name === "Edit"),
  );

  for (const w of writes) {
    const input = w.raw_input || {};
    const content = input.content || input.new_string || "";
    if (content.includes(assertion.value)) {
      return {
        type: "write-not-contains",
        pass: false,
        reason: `${w.tool_name} to ${w.path} contains "${assertion.value}"`,
      };
    }
  }
  return { type: "write-not-contains", pass: true, reason: null };
}

// --- ディスパッチャ ---

export function runAssertion(trace, assertion) {
  switch (assertion.type) {
    case "sequence":
      return checkSequence(trace, assertion);
    case "tool-call":
      return checkToolCall(trace, assertion);
    case "file-op":
      return checkFileOp(trace, assertion);
    case "permission-denial":
      return checkPermissionDenial(trace, assertion);
    case "metric":
      return checkMetric(trace, assertion);
    case "stop-reason":
      return checkStopReason(trace, assertion);
    case "not-contains":
      return checkNotContains(trace, assertion);
    case "write-not-contains":
      return checkWriteNotContains(trace, assertion);
    case "llm-rubric-trace":
      // LLM 判定は runner 側で別処理
      return { type: "llm-rubric-trace", pass: null, reason: "deferred to runner" };
    default:
      return { type: assertion.type, pass: false, reason: `unknown assertion type: ${assertion.type}` };
  }
}

export function runAssertions(trace, assertions) {
  return assertions.map((a) => runAssertion(trace, a));
}

/**
 * assertions 配列を決定的 + llm-rubric-trace に分割して実行し、
 * 結果を結合して返す。
 *
 * run-eval.mjs / run-ablation.mjs で重複していたパイプラインを共通化。
 *
 * @param {object} trace - trace-v1 オブジェクト
 * @param {object[]} assertions - テストケースの assert 配列
 * @param {function} checkLlmRubricTrace - claude-cli.mjs からの LLM 判定関数
 * @returns {Promise<object[]>} assertion 結果の配列
 */
export async function runAssertionPipeline(trace, assertions, checkLlmRubricTrace) {
  const deterministicAssertions = assertions.filter((a) => a.type !== "llm-rubric-trace");
  const llmAssertions = assertions.filter((a) => a.type === "llm-rubric-trace");

  const results = runAssertions(trace, deterministicAssertions);

  for (const a of llmAssertions) {
    results.push(await checkLlmRubricTrace(trace, a.value));
  }

  return results;
}
