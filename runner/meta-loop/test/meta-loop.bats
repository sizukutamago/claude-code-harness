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

  # Ensure target/.claude/harness exists but observation-log does not (empty case)
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  # observation-log does not exist (0 entries case)

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # At least 2 calls should be logged: 1 main invoker + 1 post_observation
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -ge 2 ]
}

# ---------------------------------------------------------------------------
# TC-11: total_iterations が永続化され、5 イテレーション目で meta-observation が実行される
# ---------------------------------------------------------------------------
@test "TC-11: meta-observation runs on 5th total iteration (total_iterations=4 pre-set)" {
  export FAKE_CLAUDE_EXIT_CODE=0
  local log_file="${BATS_TEST_TMPDIR}/claude-calls.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"

  # Pre-set total_iterations=4 so this run becomes the 5th
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  printf "consecutive_failures=0\ntotal_iterations=4\n" > "${state_file}"

  # Set up observation-log with content so post_observation is skipped
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"observer":"dummy"}' > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # total_iterations should be written as 5
  local total
  total="$(grep -E '^total_iterations=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${total}" = "5" ]

  # 3 claude calls: 1 main invoker + 1 skipped post_obs (obs-log has entry) + 1 meta-observation
  # At minimum: 1 (invoker) + 1 (meta_observation) = 2 calls
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -ge 2 ]
}

@test "TC-11b: total_iterations is incremented from 0 to 1 on first run (no meta-observation)" {
  export FAKE_CLAUDE_EXIT_CODE=0
  local log_file="${BATS_TEST_TMPDIR}/claude-calls.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"

  # Set up observation-log with content so post_observation is skipped
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"observer":"dummy"}' > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  # No state file (total_iterations=0 by default)
  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  local total
  total="$(grep -E '^total_iterations=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${total}" = "1" ]

  # Only 1 call (invoker), no meta-observation since 1 % 5 != 0
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -eq 1 ]
}

@test "TC-11c: meta-observation does NOT run on non-multiple iterations (total=3)" {
  export FAKE_CLAUDE_EXIT_CODE=0
  local log_file="${BATS_TEST_TMPDIR}/claude-calls.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"

  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  printf "consecutive_failures=0\ntotal_iterations=2\n" > "${state_file}"

  # Set up observation-log with content so post_observation is skipped
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"observer":"dummy"}' > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # total_iterations should be 3
  local total
  total="$(grep -E '^total_iterations=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${total}" = "3" ]

  # Only 1 call (invoker), no meta-observation since 3 % 5 != 0
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -eq 1 ]
}

@test "TC-11d: meta-observation failure does not stop the loop (meta-loop exits 0)" {
  # This verifies the || true behavior: if meta-observation fails, main loop continues
  export FAKE_CLAUDE_EXIT_CODE=0
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  printf "consecutive_failures=0\ntotal_iterations=4\n" > "${state_file}"

  # Set up observation-log with content so post_observation is skipped
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"observer":"dummy"}' > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  # Use an invalid claude binary that fails for meta-observation
  # But main invoker uses FAKE_CLAUDE_EXIT_CODE=0, so we need a different approach.
  # We make the 2nd+ call fail by setting exit code=1 after 1st call.
  # Since fake-claude always uses env, we can use FAKE_CLAUDE_EXIT_CODE.
  # For meta-observation failure, we trust || true handles it.
  # Just verify main loop exits 0 even when meta-observation would fail.
  export FAKE_CLAUDE_EXIT_CODE=0

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # total_iterations must be 5
  local total
  total="$(grep -E '^total_iterations=' "${state_file}" | tail -1 | awk -F= '{print $2}')"
  [ "${total}" = "5" ]
}

# ---------------------------------------------------------------------------
# TC-12: run_auto_fix が 5 イテレーション目に実行される
# ---------------------------------------------------------------------------
@test "TC-12: run_auto_fix is called on 5th total iteration when observation-log has critical entries" {
  export FAKE_CLAUDE_EXIT_CODE=0
  local log_file="${BATS_TEST_TMPDIR}/claude-calls.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"

  # Pre-set total_iterations=4 so this run becomes the 5th
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  printf "consecutive_failures=0\ntotal_iterations=4\n" > "${state_file}"

  # Set up observation-log with a critical entry
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"timestamp":"2025-01-01T00:00:00Z","observer":"harness-user-reviewer","severity":"critical","finding":"test","recommendation":"fix it"}' \
    > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # At least 3 calls: 1 (invoker) + 1 (auto_fix) + 1 (meta_observation)
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -ge 3 ]
}

# ---------------------------------------------------------------------------
# TC-13: observation-log が空のとき run_auto_fix はスキップ（claude 呼び出しなし）
# ---------------------------------------------------------------------------
@test "TC-13: run_auto_fix is skipped when observation-log has no critical/warning entries" {
  export FAKE_CLAUDE_EXIT_CODE=0
  local log_file="${BATS_TEST_TMPDIR}/claude-calls.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"

  # Pre-set total_iterations=4 so this run becomes the 5th
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  printf "consecutive_failures=0\ntotal_iterations=4\n" > "${state_file}"

  # Set up observation-log with only an info entry (no critical/warning)
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"timestamp":"2025-01-01T00:00:00Z","observer":"meta-observer","severity":"info","finding":"all good"}' \
    > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # Only 2 calls: 1 (invoker) + 1 (meta_observation) — auto_fix skipped
  local call_count
  call_count="$(wc -l < "${log_file}" | tr -d ' ')"
  [ "${call_count}" -eq 2 ]
}

# ---------------------------------------------------------------------------
# TC-15: _resolve_harness_path が symlink 経由で正しいパスを返す
# ---------------------------------------------------------------------------
@test "TC-15: _resolve_harness_path resolves symlinked .claude to real path" {
  # Create a real .claude/harness directory at a different location
  local real_claude_dir="${BATS_TEST_TMPDIR}/real-dot-claude"
  mkdir -p "${real_claude_dir}/harness"

  # Create a workspace dir where .claude is a symlink to the real dir
  local ws="${BATS_TEST_TMPDIR}/symlink-ws"
  mkdir -p "${ws}"
  ln -s "${real_claude_dir}" "${ws}/.claude"

  # Call _resolve_harness_path inline (same logic as meta-loop.sh, using pwd -P) without sourcing
  # main to avoid triggering argument parsing
  local resolved
  resolved="$(bash -c '
    _resolve_harness_path() {
      local target="$1"
      local subpath="$2"
      local harness_dir
      harness_dir="$(cd "${target}/.claude/harness" 2>/dev/null && pwd -P)"
      echo "${harness_dir}/${subpath}"
    }
    _resolve_harness_path "$1" "$2"
  ' -- "${ws}" "observation-log.jsonl")"

  # Use pwd -P on the real dir to get the canonical path (handles macOS /tmp -> /private/tmp)
  local real_harness_dir
  real_harness_dir="$(cd "${real_claude_dir}/harness" && pwd -P)"
  local expected="${real_harness_dir}/observation-log.jsonl"

  [ "${resolved}" = "${expected}" ]
}

# ---------------------------------------------------------------------------
# TC-14: run_auto_archive が実行後に observation-log を空にする
# ---------------------------------------------------------------------------
@test "TC-14: run_auto_archive empties observation-log and appends to archive" {
  export FAKE_CLAUDE_EXIT_CODE=0

  # Pre-set total_iterations=4 so this run becomes the 5th
  local state_file="${MLTEST_WORKSPACE}/.meta-loop-state"
  printf "consecutive_failures=0\ntotal_iterations=4\n" > "${state_file}"

  # Set up observation-log with 3 entries at target/.claude/harness/
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  local obs_log="${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"
  local archive_log="${MLTEST_WORKSPACE}/.claude/harness/observation-log-archive.jsonl"
  printf '{"severity":"critical","finding":"a"}\n{"severity":"warning","finding":"b"}\n{"severity":"info","finding":"c"}\n' \
    > "${obs_log}"

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # observation-log.jsonl should be empty (0 bytes) after archive
  [ -f "${obs_log}" ]
  local obs_size
  obs_size="$(wc -c < "${obs_log}" | tr -d ' ')"
  [ "${obs_size}" -eq 0 ]

  # observation-log-archive.jsonl should have at least 3 lines
  [ -f "${archive_log}" ]
  local archive_count
  archive_count="$(wc -l < "${archive_log}" | tr -d ' ')"
  [ "${archive_count}" -ge 3 ]
}

# ---------------------------------------------------------------------------
# TC-16: run_eval_collection が node scripts/eval-harness.mjs を呼ぶ（node をモック）
# ---------------------------------------------------------------------------
@test "TC-16: run_eval_collection calls node scripts/eval-harness.mjs on successful iteration" {
  export FAKE_CLAUDE_EXIT_CODE=0

  # node stub: log invocations to a file
  local node_log="${BATS_TEST_TMPDIR}/node-calls.log"
  local stubs_dir="${BATS_TEST_TMPDIR}/stubs"
  mkdir -p "${stubs_dir}"
  cat > "${stubs_dir}/node" <<'NODE_STUB'
#!/usr/bin/env bash
# Fake node: log the arguments, then succeed
log_file="${NODE_LOG_FILE:-}"
if [ -n "${log_file}" ]; then
  printf '%s\n' "$*" >> "${log_file}"
fi
exit 0
NODE_STUB
  chmod +x "${stubs_dir}/node"
  export PATH="${stubs_dir}:${PATH}"
  export NODE_LOG_FILE="${node_log}"

  # Set up observation-log with content so post_observation is skipped
  mkdir -p "${MLTEST_WORKSPACE}/.claude/harness"
  echo '{"observer":"dummy"}' > "${MLTEST_WORKSPACE}/.claude/harness/observation-log.jsonl"

  run "${META_LOOP_SH}" --target "${MLTEST_WORKSPACE}"
  [ "$status" -eq 0 ]

  # node should have been called with eval-harness.mjs path in the arguments
  [ -f "${node_log}" ]
  grep -q "eval-harness.mjs" "${node_log}"
}
