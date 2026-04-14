#!/usr/bin/env bats
# runner/meta-loop/test/invoker-blueprint.bats
# Tests for: runner/meta-loop/lib/invoker-blueprint.sh
#
# Functions under test:
#   invoker_build_prompt <target-dir>
#   invoker_run <target-dir>

load "helpers"

INVOKER_BLUEPRINT_LIB="${BATS_TEST_DIRNAME}/../lib/invoker-blueprint.sh"
FAKE_CLAUDE="${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

setup() {
  meta_loop_reset_fake_env
  meta_loop_setup_tmp_workspace
  # shellcheck source=../lib/invoker-blueprint.sh
  source "${INVOKER_BLUEPRINT_LIB}"
}

# ---------------------------------------------------------------------------
# TC-BP-1: build_prompt contains "blueprint" keyword
# ---------------------------------------------------------------------------

@test "TC-BP-1: invoker_build_prompt contains blueprint keyword" {
  local target_dir="${MLTEST_WORKSPACE}"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"blueprint"* ]]
}

# ---------------------------------------------------------------------------
# TC-BP-2: build_prompt contains product-user-reviewer keyword
# ---------------------------------------------------------------------------

@test "TC-BP-2: invoker_build_prompt contains product-user-reviewer keyword" {
  local target_dir="${MLTEST_WORKSPACE}"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"product-user-reviewer"* ]]
}

# ---------------------------------------------------------------------------
# TC-BP-3: build_prompt contains target dir path
# ---------------------------------------------------------------------------

@test "TC-BP-3: invoker_build_prompt contains target-dir path" {
  local target_dir="${MLTEST_WORKSPACE}"
  run invoker_build_prompt "${target_dir}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"${target_dir}"* ]]
}

# ---------------------------------------------------------------------------
# TC-BP-4: invoker_run exits 0 with fake-claude exit 0
# ---------------------------------------------------------------------------

@test "TC-BP-4: invoker_run exits 0 when META_LOOP_CLAUDE_BIN exits 0" {
  local target_dir="${MLTEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=0
  export META_LOOP_CLAUDE_BIN="${FAKE_CLAUDE}"
  run invoker_run "${target_dir}"
  [ "$status" -eq 0 ]
}
