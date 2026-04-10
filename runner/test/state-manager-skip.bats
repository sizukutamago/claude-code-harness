#!/usr/bin/env bats

load "test_helper"

# state-manager.sh をロードする
STATE_MANAGER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/state-manager.sh"

setup() {
  # TEST_TMPDIR 作成
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  # shellcheck source=/dev/null
  source "${STATE_MANAGER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
}

# ---------------------------------------------------------------------------
# record_skip_reason
# ---------------------------------------------------------------------------

# AC-1: skipped_reason が記録される
@test "record_skip_reason: records skipped_reason for the specified story" {
  record_skip_reason "${PLAN}" "S-001" "Manual skip for testing"
  run jq -r '.stories[] | select(.id=="S-001") | .skipped_reason' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "Manual skip for testing" ]
}

# ---------------------------------------------------------------------------
# skip_dependents
# ---------------------------------------------------------------------------

# AC-2: 直接依存するストーリーが skipped になる
@test "skip_dependents: directly dependent story becomes skipped" {
  # S-001 が failed → S-002 (depends_on S-001) が skipped になる
  update_status "${PLAN}" "S-001" "failed"
  skip_dependents "${PLAN}" "S-001"
  run jq -r '.stories[] | select(.id=="S-002") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]
}

# AC-3: 間接依存（チェーン）も再帰的に skipped になる
@test "skip_dependents: indirect dependents are recursively skipped" {
  # S-001 が failed → S-002 が skipped → S-003 (depends_on S-002) も skipped
  update_status "${PLAN}" "S-001" "failed"
  skip_dependents "${PLAN}" "S-001"
  run jq -r '.stories[] | select(.id=="S-003") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]
}

# AC-4: 依存関係のないストーリーは影響を受けない
@test "skip_dependents: stories with no dependency on target are unaffected" {
  # S-001 が failed になっても S-001 自体のステータスは変わらない
  # また、S-002/S-003 以外のストーリーは存在しないが、S-001 自体も skipped_dependents の対象外
  update_status "${PLAN}" "S-001" "failed"
  skip_dependents "${PLAN}" "S-001"
  # S-001 自体のステータスは failed のまま
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "failed" ]
}

# AC-5: skipped_reason に依存先の情報が記録される
@test "skip_dependents: skipped_reason contains dependency info" {
  update_status "${PLAN}" "S-001" "failed"
  skip_dependents "${PLAN}" "S-001"
  run jq -r '.stories[] | select(.id=="S-002") | .skipped_reason' "${PLAN}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"S-001"* ]]
}

# ---------------------------------------------------------------------------
# generate_summary
# ---------------------------------------------------------------------------

# AC-6: total/completed/failed/skipped のカウントが正しい
@test "generate_summary: counts total/completed/failed/skipped correctly" {
  update_status "${PLAN}" "S-001" "completed"
  update_status "${PLAN}" "S-002" "failed"
  update_status "${PLAN}" "S-003" "skipped"
  run generate_summary "${PLAN}" "run-abc"
  [ "$status" -eq 0 ]
  total=$(echo "$output" | jq -r '.total')
  completed=$(echo "$output" | jq -r '.completed')
  failed=$(echo "$output" | jq -r '.failed')
  skipped=$(echo "$output" | jq -r '.skipped')
  [ "$total" = "3" ]
  [ "$completed" = "1" ]
  [ "$failed" = "1" ]
  [ "$skipped" = "1" ]
}

# AC-7: run_id が含まれる
@test "generate_summary: includes run_id in output" {
  run generate_summary "${PLAN}" "run-xyz-123"
  [ "$status" -eq 0 ]
  run_id=$(echo "$output" | jq -r '.run_id')
  [ "$run_id" = "run-xyz-123" ]
}

# AC-8: stories 配列に各ストーリーの状態が含まれる
@test "generate_summary: stories array contains each story's state" {
  update_status "${PLAN}" "S-001" "completed"
  add_completed_step "${PLAN}" "S-001" "tdd"
  add_completed_step "${PLAN}" "S-001" "simplify"
  increment_step_attempts "${PLAN}" "S-001" "tdd"
  run generate_summary "${PLAN}" "run-abc"
  [ "$status" -eq 0 ]
  stories_count=$(echo "$output" | jq '.stories | length')
  [ "$stories_count" = "3" ]
  s001_status=$(echo "$output" | jq -r '.stories[] | select(.id=="S-001") | .status')
  [ "$s001_status" = "completed" ]
  s001_completed_steps=$(echo "$output" | jq '.stories[] | select(.id=="S-001") | .completed_steps | length')
  [ "$s001_completed_steps" = "2" ]
  s001_attempts=$(echo "$output" | jq '.stories[] | select(.id=="S-001") | .attempts')
  [ "$s001_attempts" = "1" ]
}

# AC-SHOULD-2-1: pending/in_progress が残っている状態でのサマリに両フィールドが含まれる
@test "generate_summary: includes pending and in_progress fields in summary" {
  update_status "${PLAN}" "S-001" "in_progress"
  # S-002, S-003 は pending のまま
  run generate_summary "${PLAN}" "run-abc"
  [ "$status" -eq 0 ]
  pending=$(echo "$output" | jq -r '.pending')
  in_progress=$(echo "$output" | jq -r '.in_progress')
  [ "$pending" = "2" ]
  [ "$in_progress" = "1" ]
}

# AC-SHOULD-2-2: pending=0/in_progress=0 の場合もフィールドが存在する
@test "generate_summary: pending and in_progress fields exist even when zero" {
  update_status "${PLAN}" "S-001" "completed"
  update_status "${PLAN}" "S-002" "completed"
  update_status "${PLAN}" "S-003" "completed"
  run generate_summary "${PLAN}" "run-abc"
  [ "$status" -eq 0 ]
  pending=$(echo "$output" | jq -r '.pending')
  in_progress=$(echo "$output" | jq -r '.in_progress')
  [ "$pending" = "0" ]
  [ "$in_progress" = "0" ]
}

# ---------------------------------------------------------------------------
# record_failed_reason
# ---------------------------------------------------------------------------

# AC-SHOULD-3-1: failed ストーリーに failed_reason が記録される
@test "record_failed_reason: records failed_reason for the specified story" {
  record_failed_reason "${PLAN}" "S-001" "Step tdd failed after max attempts"
  run jq -r '.stories[] | select(.id=="S-001") | .failed_reason' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "Step tdd failed after max attempts" ]
}

# AC-SHOULD-3-2: failed_reason を記録しても skipped_reason は null のまま
@test "record_failed_reason: does not affect skipped_reason" {
  record_failed_reason "${PLAN}" "S-001" "Step tdd failed after max attempts"
  run jq -r '.stories[] | select(.id=="S-001") | .skipped_reason' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]
}

# AC-SHOULD-3-3: skipped ストーリーに skipped_reason を記録しても failed_reason は null のまま
@test "record_skip_reason: does not affect failed_reason" {
  record_skip_reason "${PLAN}" "S-001" "Dependency S-000 failed"
  run jq -r '.stories[] | select(.id=="S-001") | .failed_reason' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "null" ]
}
