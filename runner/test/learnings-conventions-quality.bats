#!/usr/bin/env bats
# learnings-conventions-quality.bats — learnings・conventions の境界値・エッジケース・組み合わせの追加テスト

load "test_helper"

STATE_MANAGER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/state-manager.sh"
CONVENTIONS_BUILDER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/conventions-builder.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  # shellcheck source=/dev/null
  source "${STATE_MANAGER_PATH}"
  # shellcheck source=/dev/null
  source "${CONVENTIONS_BUILDER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
  LEARNINGS="${TEST_TMPDIR}/learnings.jsonl"
  ARCHIVE="${TEST_TMPDIR}/archive.jsonl"
  CONVENTIONS="${TEST_TMPDIR}/conventions.md"
}

# ===========================================================================
# 異常系 — record_learning / extract_learnings
# ===========================================================================

# TQ-6: record_learning — content に double quote を含む場合も正常な JSONL が生成される
@test "TQ-6: record_learning: content with double quotes produces valid JSONL" {
  record_learning "${LEARNINGS}" "S-001" "tdd" "gotcha" 'Use "strict mode" always'
  # jq で parse できること
  run jq -r '.content' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" = 'Use "strict mode" always' ]
}

# TQ-7: extract_learnings — content が空の行はスキップされる (JSONL フォーマット)
@test "TQ-7: extract_learnings: line with empty content is skipped" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' 'LEARNING: {"type":"pattern","content":""}' > "${log_file}"
  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"
  # ファイルが作成されないか、作成されても 0 行であること
  if [ -f "${LEARNINGS}" ]; then
    run wc -l < "${LEARNINGS}"
    [ "$output" -eq 0 ]
  fi
}

# ===========================================================================
# 境界値 — get_learnings_for_story / archive_learnings
# ===========================================================================

# TQ-17: get_learnings_for_story — learnings.jsonl が空ファイルの場合は空文字を返す
@test "TQ-17: get_learnings_for_story: returns empty output when learnings file is empty" {
  touch "${LEARNINGS}"
  run get_learnings_for_story "${LEARNINGS}" "${PLAN}" "S-001"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# TQ-18: get_learnings_for_story — learnings.jsonl が存在しない場合はエラーなしで空文字を返す
@test "TQ-18: get_learnings_for_story: returns empty output when learnings file does not exist" {
  # LEARNINGS ファイルを作成しない
  run get_learnings_for_story "${LEARNINGS}" "${PLAN}" "S-001"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# TQ-19: archive_learnings — learnings.jsonl が存在しない場合は return 0 でエラーなし
@test "TQ-19: archive_learnings: returns 0 without error when learnings file does not exist" {
  run archive_learnings "${LEARNINGS}" "${ARCHIVE}" "S-001"
  [ "$status" -eq 0 ]
}

# ===========================================================================
# エッジケース — record_learning / extract_learnings
# ===========================================================================

# TQ-21: record_learning — content に backslash を含む場合も正常な JSONL が生成される
@test "TQ-21: record_learning: content with backslash produces valid JSONL" {
  record_learning "${LEARNINGS}" "S-001" "tdd" "pattern" 'Use \\n for newline'
  run jq -r '.content' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  # jq で parse できれば OK（内容に \\ が含まれていること）
  [[ "$output" == *"\\"* ]]
}

# TQ-22: extract_learnings — content にシングルクォートを含む場合も正常に抽出される (JSONL フォーマット)
@test "TQ-22: extract_learnings: content with single quote is extracted correctly" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' 'LEARNING: {"type":"pattern","content":"don'"'"'t use var"}' > "${log_file}"
  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"
  run jq -r '.content' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" = "don't use var" ]
}

# ===========================================================================
# 組み合わせ — check_and_promote / conventions
# ===========================================================================

# TQ-27: check_and_promote — learnings.jsonl が空ファイルの場合は昇格なし・エラーなし
@test "TQ-27: check_and_promote: empty learnings file causes no promotion and no error" {
  touch "${LEARNINGS}"
  run check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"
  [ "$status" -eq 0 ]
  # conventions.md は作成されない
  [ ! -f "${CONVENTIONS}" ]
}

# TQ-28: check_and_promote — 同一 content が 2 件 + 異なる content が 3 件の場合、3 件側のみ昇格
@test "TQ-28: check_and_promote: only entries with 3+ occurrences are promoted" {
  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"only twice"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"pattern","content":"only twice"}' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"gotcha","content":"three times"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"gotcha","content":"three times"}' \
    '{"date":"2026-04-03","story":"S-003","step":"tdd","type":"gotcha","content":"three times"}' \
    > "${LEARNINGS}"

  check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"

  # "three times" は conventions.md に昇格している
  run grep -F "three times" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  # "only twice" は conventions.md に昇格していない
  run grep -F "only twice" "${CONVENTIONS}"
  [ "$status" -ne 0 ]

  # "only twice" は learnings.jsonl に残っている
  run grep -F "only twice" "${LEARNINGS}"
  [ "$status" -eq 0 ]
}

# TQ-24: promote_to_conventions — content に [] や * などの特殊文字を含む場合も冪等に動作する
@test "TQ-24: promote_to_conventions: content with special characters is handled idempotently" {
  local special_content="Use app.route(['/path', '*']) for routing"
  promote_to_conventions "${CONVENTIONS}" "pattern" "${special_content}"
  # 2回目は重複なし
  promote_to_conventions "${CONVENTIONS}" "pattern" "${special_content}"
  local state_file
  state_file="$(dirname "${CONVENTIONS}")/conventions-state.jsonl"
  run grep -cF "${special_content}" "${state_file}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
}

# TQ-29: promote_to_conventions — 既存エントリがある状態で同一 content を追加しても重複しない
@test "TQ-29: promote_to_conventions: does not duplicate when conventions.md already has the entry" {
  # 先に1件昇格させて conventions-state.jsonl を作る
  promote_to_conventions "${CONVENTIONS}" "pattern" "existing entry"
  # 同じ content を再度追加
  promote_to_conventions "${CONVENTIONS}" "pattern" "existing entry"
  # conventions-state.jsonl の出現回数を確認（1 件のみのはず）
  local state_file
  state_file="$(dirname "${CONVENTIONS}")/conventions-state.jsonl"
  run grep -c "existing entry" "${state_file}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
}
