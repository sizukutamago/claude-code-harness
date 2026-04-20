#!/usr/bin/env bats
# runner/ralph-autonomous/test/invoker.bats
# TDD tests for runner/ralph-autonomous/lib/invoker.sh

load "helpers"

INVOKER_LIB="${BATS_TEST_DIRNAME}/../lib/invoker.sh"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  ralph_autonomous_reset_fake_env

  # references ファイルを作成
  mkdir -p "${RATEST_WORKSPACE}/docs/requirements"
  mkdir -p "${RATEST_WORKSPACE}/docs/design"
  mkdir -p "${RATEST_WORKSPACE}/docs/plans"

  echo "# Requirements Content" > "${RATEST_WORKSPACE}/docs/requirements/test.md"
  echo "# Design Content" > "${RATEST_WORKSPACE}/docs/design/test.md"
  cat > "${RATEST_WORKSPACE}/docs/plans/test.md" <<'PLAN'
# Plan

- [ ] Task A
- [x] Task B (done)
- [ ] Task C
PLAN
}

# AC-1: invoker_build_prompt - references と progress.txt が埋め込まれている
@test "invoker_build_prompt embeds references and progress.txt content" {
  echo "Previous progress notes" > "${RATEST_WORKSPACE}/progress.txt"

  source "${INVOKER_LIB}"
  run invoker_build_prompt "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  [ "${status}" -eq 0 ]
  # requirements が埋め込まれている
  [[ "${output}" == *"# Requirements Content"* ]]
  # design が埋め込まれている
  [[ "${output}" == *"# Design Content"* ]]
  # plan が埋め込まれている
  [[ "${output}" == *"- [ ] Task A"* ]]
  # progress.txt が埋め込まれている
  [[ "${output}" == *"Previous progress notes"* ]]
}

# AC-2: invoker_build_prompt - plan.md が存在しない場合でもエラーにならない
@test "invoker_build_prompt does not error when plan file does not exist" {
  # plan ファイルを削除する
  rm -f "${RATEST_WORKSPACE}/docs/plans/test.md"

  source "${INVOKER_LIB}"
  run invoker_build_prompt "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  [ "${status}" -eq 0 ]
  # "(file not found)" 的な文字列が埋め込まれている
  [[ "${output}" == *"file not found"* ]]
}

# AC-3: invoker_run - claude が正常終了（EXIT_SIGNAL なし）→ exit 0
@test "invoker_run exits 0 when claude exits normally without EXIT_SIGNAL" {
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="task completed normally"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  source "${INVOKER_LIB}"
  run invoker_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  [ "${status}" -eq 0 ]
}

# AC-4: invoker_run - claude の stdout 最終行が EXIT_SIGNAL → exit 10
@test "invoker_run exits 10 when claude stdout last line is EXIT_SIGNAL" {
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="$(printf 'task completed\nEXIT_SIGNAL')"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  source "${INVOKER_LIB}"
  run invoker_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  [ "${status}" -eq 10 ]
}

# AC-5: invoker_run - claude が exit 1 → exit 4
@test "invoker_run exits 4 when claude exits with non-zero code" {
  export FAKE_CLAUDE_EXIT_CODE=1
  export FAKE_CLAUDE_STDOUT="something went wrong"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  source "${INVOKER_LIB}"
  run invoker_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  [ "${status}" -eq 4 ]
}

# Additional: invoker_run saves claude stdout to .ralph/claude-last-output.txt
@test "invoker_run saves claude output to .ralph/claude-last-output.txt" {
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="saved output content"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  source "${INVOKER_LIB}"
  run invoker_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  ralph_autonomous_assert_file_contains "${RATEST_WORKSPACE}/.ralph/claude-last-output.txt" "saved output content"
}

# Additional: invoker_run uses RALPH_CLAUDE_BIN env var to override binary
@test "invoker_run uses RALPH_CLAUDE_BIN when set" {
  local log_file="${BATS_TEST_TMPDIR}/claude-invocations.log"
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="ok"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"
  ralph_autonomous_path_stub "my-claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  export RALPH_CLAUDE_BIN="my-claude"

  source "${INVOKER_LIB}"
  run invoker_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"

  [ "${status}" -eq 0 ]
  [ -f "${log_file}" ]
}
