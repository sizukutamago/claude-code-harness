#!/usr/bin/env bats

load "test_helper"

# state-manager.sh をロードする
# BATS_TEST_DIRNAME は bats が自動で設定するテストファイルの絶対ディレクトリ
STATE_MANAGER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/state-manager.sh"

setup() {
  # test_helper の setup を呼ぶ（TEST_TMPDIR 作成）
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  # shellcheck source=/dev/null
  source "${STATE_MANAGER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
}

# ---------------------------------------------------------------------------
# next_ready_story
# ---------------------------------------------------------------------------

# AC-1: no-dep pending story is returned
@test "next_ready_story: returns pending story with no dependencies" {
  # S-001 has depends_on=[] and status=pending -> first candidate
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "S-001" ]
}

# AC-2: story whose dependency is completed is returned
@test "next_ready_story: returns story whose dependency is completed" {
  # mark S-001 completed -> S-002 becomes ready
  update_status "${PLAN}" "S-001" "completed"
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "S-002" ]
}

# AC-3: story with incomplete dependency is skipped
@test "next_ready_story: skips story with incomplete dependency" {
  # S-001 is in_progress -> S-002 dependency not resolved
  # S-001 itself is also no longer pending -> empty result
  update_status "${PLAN}" "S-001" "in_progress"
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# AC-4: empty string when all stories are completed
@test "next_ready_story: returns empty string when all stories are completed" {
  update_status "${PLAN}" "S-001" "completed"
  update_status "${PLAN}" "S-002" "completed"
  update_status "${PLAN}" "S-003" "completed"
  run next_ready_story "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# ---------------------------------------------------------------------------
# update_status
# ---------------------------------------------------------------------------

# AC-5: pending -> in_progress
@test "update_status: updates status from pending to in_progress" {
  update_status "${PLAN}" "S-001" "in_progress"
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "in_progress" ]
}

# AC-6: in_progress -> completed
@test "update_status: updates status from in_progress to completed" {
  update_status "${PLAN}" "S-001" "in_progress"
  update_status "${PLAN}" "S-001" "completed"
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "completed" ]
}

# ---------------------------------------------------------------------------
# update_current_step
# ---------------------------------------------------------------------------

# AC-7: current_step is updated
@test "update_current_step: updates current_step field" {
  update_current_step "${PLAN}" "S-001" "tdd"
  run jq -r '.stories[] | select(.id=="S-001") | .current_step' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "tdd" ]
}

# ---------------------------------------------------------------------------
# add_completed_step
# ---------------------------------------------------------------------------

# AC-8: step is added to completed_steps
@test "add_completed_step: adds step to completed_steps" {
  add_completed_step "${PLAN}" "S-001" "tdd"
  run jq -r '.stories[] | select(.id=="S-001") | .completed_steps | length' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
  run jq -r '.stories[] | select(.id=="S-001") | .completed_steps[0]' "${PLAN}"
  [ "$output" = "tdd" ]
}

# AC-9: adding same step twice does not duplicate (idempotent)
@test "add_completed_step: adding same step twice does not create duplicate" {
  add_completed_step "${PLAN}" "S-001" "tdd"
  add_completed_step "${PLAN}" "S-001" "tdd"
  run jq -r '.stories[] | select(.id=="S-001") | .completed_steps | length' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ---------------------------------------------------------------------------
# increment_step_attempts
# ---------------------------------------------------------------------------

# AC-10: step_attempts for the step is incremented
@test "increment_step_attempts: increments step_attempts for the given step" {
  increment_step_attempts "${PLAN}" "S-001" "tdd"
  run jq -r '.stories[] | select(.id=="S-001") | .step_attempts.tdd' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# AC-11: total attempts counter is also incremented
@test "increment_step_attempts: also increments total attempts counter" {
  increment_step_attempts "${PLAN}" "S-001" "tdd"
  run jq -r '.stories[] | select(.id=="S-001") | .attempts' "${PLAN}"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}
