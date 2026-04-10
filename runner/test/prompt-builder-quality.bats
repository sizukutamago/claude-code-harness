#!/usr/bin/env bats
# prompt-builder-quality.bats — エッジケースの追加テスト

load "test_helper"

PROMPT_BUILDER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/prompt-builder.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  copy_fixture "conventions.md"
  # shellcheck source=/dev/null
  source "${PROMPT_BUILDER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
  CONVENTIONS="${TEST_TMPDIR}/conventions.md"
}

# ===========================================================================
# エッジケース
# ===========================================================================

# TQ-23: build_prompt — learnings.jsonl が存在しない場合は "(no learnings yet)" を出力する
@test "TQ-23: build_prompt: outputs (no learnings yet) when learnings file does not exist" {
  local nonexistent_learnings="${TEST_TMPDIR}/does-not-exist.jsonl"
  run build_prompt "${PLAN}" "${nonexistent_learnings}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"(no learnings yet)"* ]]
}
