#!/usr/bin/env bats
# runner/meta-loop/test/meta-loop.bats
# TDD tests for runner/meta-loop/meta-loop.sh (Task-7)

setup() {
  load 'helpers.bash'
  meta_loop_setup_tmp_workspace
  # Create progress.txt as precondition
  echo "# Project: test" > "${MLTEST_WORKSPACE}/progress.txt"
  # Point META_LOOP_CLAUDE_BIN to fake-claude.sh
  export META_LOOP_CLAUDE_BIN="${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  # Absolute path to meta-loop.sh
  META_LOOP_SH="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)/meta-loop.sh"
}

teardown() {
  meta_loop_reset_fake_env
}

# ---------------------------------------------------------------------------
# TC-1: success -> state reset to consecutive_failures=0
# ---------------------------------------------------------------------------
@test "TC-1: success run exits 0 and resets consecutive_failures to 0" {
  export FAKE_CLAUDE_EXIT_CODE=0
  # No state file (start from 0)
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]
  # consecutive_failures should be 0
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  [ -f "${state_file}" ]
  local failures
  failures="$(grep -E '^consecutive_failures=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${failures}" = "0" ]
}

# ---------------------------------------------------------------------------
# TC-2: failure -> consecutive_failures incremented to 1
# ---------------------------------------------------------------------------
@test "TC-2: one failure increments consecutive_failures to 1, does not exit 3" {
  export FAKE_CLAUDE_EXIT_CODE=5
  # No prior state
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  # Should not reach exit 3 (limit not exceeded)
  [ "$status" -ne 3 ]
  # State should be consecutive_failures=1
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  [ -f "${state_file}" ]
  local failures
  failures="$(grep -E '^consecutive_failures=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${failures}" = "1" ]
}

# ---------------------------------------------------------------------------
# TC-3: 3rd failure (prior consecutive_failures=2) exits 3
# ---------------------------------------------------------------------------
@test "TC-3: prior consecutive_failures=2 plus one failure exits 3" {
  export FAKE_CLAUDE_EXIT_CODE=5
  # Pre-set state to consecutive_failures=2
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  echo "consecutive_failures=2" > "${state_file}"
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 3 ]
  # State should be consecutive_failures=3
  local failures
  failures="$(grep -E '^consecutive_failures=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${failures}" = "3" ]
}

# ---------------------------------------------------------------------------
# TC-4: failure summary printed to stderr on exit 3 (SHOULD-2)
# ---------------------------------------------------------------------------
@test "TC-4: exit 3 prints failure summary to stderr with required substrings" {
  export FAKE_CLAUDE_EXIT_CODE=5
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  echo "consecutive_failures=2" > "${state_file}"
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 3 ]
  # Output (combined stdout+stderr via bats 'run') must contain required strings
  echo "${output}" | grep -q '\[meta-loop\]'
  echo "${output}" | grep -qF '3'
  echo "${output}" | grep -q 'iteration='
  echo "${output}" | grep -q 'last_exit='
  echo "${output}" | grep -q 'target='
}

# ---------------------------------------------------------------------------
# TC-5: missing --target exits 2
# ---------------------------------------------------------------------------
@test "TC-5: missing --target exits 2" {
  run "${META_LOOP_SH}"
  [ "$status" -eq 2 ]
}

# ---------------------------------------------------------------------------
# TC-6: missing progress.txt exits 2
# ---------------------------------------------------------------------------
@test "TC-6: missing progress.txt exits 2" {
  # Remove progress.txt
  rm "${MLTEST_WORKSPACE}/progress.txt"
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 2 ]
}

# ---------------------------------------------------------------------------
# TC-7: no state file starts from 0 (success case)
# ---------------------------------------------------------------------------
@test "TC-7: absent .meta-loop-state starts from 0 and ends with consecutive_failures=0 on success" {
  export FAKE_CLAUDE_EXIT_CODE=0
  # Confirm state file does not exist
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  [ ! -f "${state_file}" ]
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]
  # State file created with consecutive_failures=0
  [ -f "${state_file}" ]
  local failures
  failures="$(grep -E '^consecutive_failures=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${failures}" = "0" ]
}

# ---------------------------------------------------------------------------
# TC-8: --max-iter 1 succeeds with exit 0
# ---------------------------------------------------------------------------
@test "TC-8: --max-iter 1 runs once successfully and exits 0" {
  export FAKE_CLAUDE_EXIT_CODE=0
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}" --max-iter 1
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC-9: --observe-every option is parsed (default 5)
# ---------------------------------------------------------------------------
@test "TC-9: --observe-every default is 5 (no option exits 0)" {
  export FAKE_CLAUDE_EXIT_CODE=0
  # Should succeed without error when no --observe-every given
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]
}

@test "TC-9b: --observe-every 3 is accepted without error" {
  export FAKE_CLAUDE_EXIT_CODE=0
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}" --observe-every 3
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC-10: run_post_observation is called when observation-log is empty
# ---------------------------------------------------------------------------
@test "TC-10: second claude call is made when observation-log is empty after success" {
  export FAKE_CLAUDE_EXIT_CODE=0
  local log_file="${BATS_TEST_TMPDIR}/claude-calls.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"

  # Ensure observation-log does not exist (empty case)
  local obs_dir="${MLTEST_WORKSPACE}/../.claude/harness"
  # target/../.claude/harness/observation-log.jsonl
  # MLTEST_WORKSPACE is a leaf dir; create parent structure
  local parent_dir
  parent_dir="$(dirname "${MLTEST_WORKSPACE}")"
  mkdir -p "${parent_dir}/.claude/harness"
  # observation-log does not exist (0 entries case)

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # At least 2 calls should be logged: 1 main invoker + 1 post_observation
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -ge 2 ]
}
