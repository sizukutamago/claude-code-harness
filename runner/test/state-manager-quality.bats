#!/usr/bin/env bats
# state-manager-quality.bats — 境界値・異常系・組み合わせ・冪等性の追加テスト

load "test_helper"

STATE_MANAGER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/state-manager.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  # shellcheck source=/dev/null
  source "${STATE_MANAGER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
}

# ===========================================================================
# 異常系
# ===========================================================================

# TQ-1: 不正な JSON の plan.json に対して next_ready_story は空文字を返す（クラッシュしない）
@test "TQ-1: next_ready_story: returns empty string for invalid JSON plan file" {
  echo "NOT JSON {{{" > "${PLAN}"
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# TQ-2: 存在しないストーリー ID に update_status を呼んでも他ストーリーが壊れない
@test "TQ-2: update_status: does not corrupt other stories when story_id does not exist" {
  update_status "${PLAN}" "S-NONEXISTENT" "completed"
  # S-001 の status は pending のまま
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "pending" ]
  # JSON 自体は valid のまま
  run jq -e '.' "${PLAN}"
  [ "$status" -eq 0 ]
}

# TQ-3: 無効なステータス文字列（"INVALID"）を update_status に渡しても JSON 構造は維持される
@test "TQ-3: update_status: accepts any string value without breaking JSON structure" {
  update_status "${PLAN}" "S-001" "INVALID_STATUS"
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "INVALID_STATUS" ]
  # JSON 全体は valid
  run jq -e '.' "${PLAN}"
  [ "$status" -eq 0 ]
}

# TQ-8: depends_on が存在しない ID を参照している状態で skip_dependents を呼んでもクラッシュしない
@test "TQ-8: skip_dependents: does not crash when depends_on references nonexistent story ID" {
  # plan.json に S-001 の depends_on を存在しない ID にする
  jq '.stories |= map(if .id == "S-001" then .depends_on = ["S-NONEXISTENT"] else . end)' \
    "${PLAN}" > "${PLAN}.tmp" && mv "${PLAN}.tmp" "${PLAN}"
  # S-001 を failed にして skip_dependents を呼ぶ
  update_status "${PLAN}" "S-001" "failed"
  run skip_dependents "${PLAN}" "S-001"
  [ "$status" -eq 0 ]
  # JSON は valid のまま
  run jq -e '.' "${PLAN}"
  [ "$status" -eq 0 ]
}

# ===========================================================================
# 境界値
# ===========================================================================

# TQ-11: stories が空配列の plan.json で next_ready_story は空文字を返す
@test "TQ-11: next_ready_story: returns empty string when stories array is empty" {
  jq '.stories = []' "${PLAN}" > "${PLAN}.tmp" && mv "${PLAN}.tmp" "${PLAN}"
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# TQ-12: ストーリーが1件のみの plan.json で next_ready_story はそのストーリーを返す
@test "TQ-12: next_ready_story: returns the single story when only one exists" {
  jq '.stories = [.stories[] | select(.id == "S-001")]' "${PLAN}" > "${PLAN}.tmp" && mv "${PLAN}.tmp" "${PLAN}"
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "S-001" ]
}

# TQ-13: depends_on が明示的に空配列（[]）の場合も next_ready_story は正常に返す
@test "TQ-13: next_ready_story: returns story with explicit empty depends_on array" {
  # S-001 の depends_on は [] なので pending → 返されるはず
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "S-001" ]
}

# TQ-14: completed_steps が空の状態から add_completed_step を呼ぶと length=1 になる
@test "TQ-14: add_completed_step: length becomes 1 when adding to empty completed_steps" {
  # fixture の S-001 は completed_steps=[] が初期状態
  run jq -r '.stories[] | select(.id=="S-001") | .completed_steps | length' "${PLAN}"
  [ "$output" = "0" ]
  add_completed_step "${PLAN}" "S-001" "tdd"
  run jq -r '.stories[] | select(.id=="S-001") | .completed_steps | length' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# TQ-15: step_attempts が未定義キーに対して初回の increment_step_attempts を呼ぶと 1 になる
@test "TQ-15: increment_step_attempts: initializes to 1 for a key not previously in step_attempts" {
  # 初回なので step_attempts.new_step は存在しない
  run jq -r '.stories[] | select(.id=="S-001") | .step_attempts.new_step // "null"' "${PLAN}"
  [ "$output" = "null" ]
  increment_step_attempts "${PLAN}" "S-001" "new_step"
  run jq -r '.stories[] | select(.id=="S-001") | .step_attempts.new_step' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# TQ-16: 全ストーリーが pending の状態で generate_summary は completed=0/failed=0/skipped=0 を返す
@test "TQ-16: generate_summary: completed=0 failed=0 skipped=0 when all stories are pending" {
  run generate_summary "${PLAN}" "run-test"
  [ "$status" -eq 0 ]
  completed=$(echo "$output" | jq -r '.completed')
  failed=$(echo "$output" | jq -r '.failed')
  skipped=$(echo "$output" | jq -r '.skipped')
  [ "$completed" = "0" ]
  [ "$failed" = "0" ]
  [ "$skipped" = "0" ]
}

# ===========================================================================
# 組み合わせ
# ===========================================================================

# TQ-25: skip_dependents — A→B→C チェーンで A が skipped（failed ではなく）でも B, C が skipped になる
@test "TQ-25: skip_dependents: B and C become skipped when A is skipped (not failed)" {
  # A=S-001 を skipped に設定してから skip_dependents を呼ぶ
  update_status "${PLAN}" "S-001" "skipped"
  skip_dependents "${PLAN}" "S-001"
  run jq -r '.stories[] | select(.id=="S-002") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]
  run jq -r '.stories[] | select(.id=="S-003") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]
}

# TQ-26: in_progress なストーリーが depends_on 先 failed でも skip_dependents で skipped になる
@test "TQ-26: skip_dependents: in_progress story becomes skipped when its dependency failed" {
  # S-002 を in_progress にしてから S-001 を failed → skip_dependents
  update_status "${PLAN}" "S-002" "in_progress"
  update_status "${PLAN}" "S-001" "failed"
  skip_dependents "${PLAN}" "S-001"
  run jq -r '.stories[] | select(.id=="S-002") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]
}

# ===========================================================================
# 冪等性
# ===========================================================================

# TQ-30: update_status を同じステータスで2回呼んでも他フィールドが変わらない
@test "TQ-30: update_status: calling twice with same status leaves other fields unchanged" {
  # 事前に S-001 に completed_steps を追加しておく
  add_completed_step "${PLAN}" "S-001" "tdd"
  update_status "${PLAN}" "S-001" "in_progress"
  update_status "${PLAN}" "S-001" "in_progress"
  # status は in_progress のまま
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN}"
  [ "$output" = "in_progress" ]
  # completed_steps は壊れていない
  run jq -r '.stories[] | select(.id=="S-001") | .completed_steps | length' "${PLAN}"
  [ "$output" = "1" ]
}

# TQ-31: archive_learnings を同じ story_id で2回呼ぶと2回目は0件追加でエラーなし
@test "TQ-31: archive_learnings: second call with same story_id adds nothing and does not error" {
  LEARNINGS="${TEST_TMPDIR}/learnings.jsonl"
  ARCHIVE="${TEST_TMPDIR}/archive.jsonl"
  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"first entry"}' \
    > "${LEARNINGS}"

  archive_learnings "${LEARNINGS}" "${ARCHIVE}" "S-001"
  # 1回目: archive に S-001 が存在する
  run jq -r '.story' "${ARCHIVE}"
  [ "$output" = "S-001" ]

  archive_learnings "${LEARNINGS}" "${ARCHIVE}" "S-001"
  # 2回目: archive に追加されない（count は 1 のまま）
  run wc -l < "${ARCHIVE}"
  [ "$output" -eq 1 ]
  # learnings.jsonl は空のまま（エラーなし）
  run jq -r '.story' "${LEARNINGS}" 2>/dev/null || true
  [ "$status" -eq 0 ]
}
