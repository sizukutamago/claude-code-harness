#!/usr/bin/env bats
# runner/meta-loop/test/invoker.bats
# Tests for: runner/meta-loop/lib/invoker.sh
#
# Functions under test:
#   invoker_build_prompt <target-dir>
#   invoker_run <target-dir>

load "helpers"

INVOKER_LIB="${BATS_TEST_DIRNAME}/../lib/invoker.sh"
FAKE_CLAUDE="${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

setup() {
  meta_loop_reset_fake_env
  meta_loop_setup_tmp_workspace
  # shellcheck source=../lib/invoker.sh
  source "${INVOKER_LIB}"
}

# ---------------------------------------------------------------------------
# invoker_build_prompt: target-dir path is embedded
# ---------------------------------------------------------------------------

@test "invoker_build_prompt contains target-dir path" {
  local target_dir="${MLTEST_WORKSPACE}"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"${target_dir}"* ]]
}

# ---------------------------------------------------------------------------
# invoker_build_prompt: coordinator constraint keyword is present
# ---------------------------------------------------------------------------

@test "invoker_build_prompt contains coordinator Write/Edit constraint keyword" {
  local target_dir="${MLTEST_WORKSPACE}"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"implementer"* ]]
}

# ---------------------------------------------------------------------------
# invoker_build_prompt: progress.txt content is embedded when file exists
# ---------------------------------------------------------------------------

@test "invoker_build_prompt embeds progress.txt content when file exists" {
  local target_dir="${MLTEST_WORKSPACE}"
  echo "PROGRESS: step 3 of 5 done" > "${target_dir}/progress.txt"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PROGRESS: step 3 of 5 done"* ]]
}

# ---------------------------------------------------------------------------
# invoker_build_prompt: works when progress.txt does not exist (empty fallback)
# ---------------------------------------------------------------------------

@test "invoker_build_prompt succeeds when progress.txt is absent" {
  local target_dir="${MLTEST_WORKSPACE}"
  # Ensure no progress.txt exists
  rm -f "${target_dir}/progress.txt"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  # Output still contains the target dir
  [[ "$output" == *"${target_dir}"* ]]
}

# ---------------------------------------------------------------------------
# invoker_run: exits 0 when fake-claude exits 0
# ---------------------------------------------------------------------------

@test "invoker_run exits 0 when META_LOOP_CLAUDE_BIN exits 0" {
  local target_dir="${MLTEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=0
  export META_LOOP_CLAUDE_BIN="${FAKE_CLAUDE}"
  run invoker_run "${target_dir}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# invoker_run: propagates non-zero exit code (7)
# ---------------------------------------------------------------------------

@test "invoker_run propagates exit code 7 from claude binary" {
  local target_dir="${MLTEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=7
  export META_LOOP_CLAUDE_BIN="${FAKE_CLAUDE}"
  run invoker_run "${target_dir}"
  [ "$status" -eq 7 ]
}

# ---------------------------------------------------------------------------
# invoker_run: returns non-zero when claude binary is missing
# ---------------------------------------------------------------------------

@test "invoker_run returns non-zero exit when claude binary does not exist" {
  local target_dir="${MLTEST_WORKSPACE}"
  export META_LOOP_CLAUDE_BIN="/nonexistent/claude-missing"
  run invoker_run "${target_dir}"
  [ "$status" -ne 0 ]
}
