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

# ===========================================================================
# AC-SHOULD-4: Design Reference セクション
# ===========================================================================

# AC-SHOULD-4-1: build_prompt の出力に ## Design Reference セクションが含まれる
@test "AC-SHOULD-4-1: build_prompt: output contains Design Reference section" {
  run build_prompt "${PLAN}" "${TEST_TMPDIR}/no-learnings.jsonl" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"## Design Reference"* ]]
}

# AC-SHOULD-4-2: build_prompt の出力に .source.design のパスが含まれる
@test "AC-SHOULD-4-2: build_prompt: output contains the design file path from source.design" {
  run build_prompt "${PLAN}" "${TEST_TMPDIR}/no-learnings.jsonl" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"docs/design/feature-x.md"* ]]
}

# AC-SHOULD-4-3: .source.design が存在しない場合は Design Reference セクションが含まれない
@test "AC-SHOULD-4-3: build_prompt: no Design Reference section when source.design is absent" {
  # source.design フィールドを削除した plan.json を作成する
  jq 'del(.source.design)' "${PLAN}" > "${TEST_TMPDIR}/plan-no-design.json"
  run build_prompt "${TEST_TMPDIR}/plan-no-design.json" "${TEST_TMPDIR}/no-learnings.jsonl" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" != *"## Design Reference"* ]]
}
