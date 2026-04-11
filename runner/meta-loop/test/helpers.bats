#!/usr/bin/env bats
# smoke tests for helpers.bash
# Tests for: meta_loop_setup_tmp_workspace, meta_loop_path_stub,
#             meta_loop_assert_file_contains, meta_loop_assert_file_missing,
#             meta_loop_reset_fake_env

load "helpers"

# ---------------------------------------------------------------------------
# meta_loop_setup_tmp_workspace
# ---------------------------------------------------------------------------

@test "meta_loop_setup_tmp_workspace creates a directory and exports MLTEST_WORKSPACE" {
  meta_loop_setup_tmp_workspace
  [ -d "${MLTEST_WORKSPACE}" ]
}

@test "meta_loop_setup_tmp_workspace MLTEST_WORKSPACE is under BATS_TEST_TMPDIR" {
  meta_loop_setup_tmp_workspace
  [[ "${MLTEST_WORKSPACE}" == "${BATS_TEST_TMPDIR}"* ]]
}

@test "meta_loop_setup_tmp_workspace directory name contains 'workspace-'" {
  meta_loop_setup_tmp_workspace
  [[ "${MLTEST_WORKSPACE}" == *workspace-* ]]
}

# ---------------------------------------------------------------------------
# meta_loop_path_stub
# ---------------------------------------------------------------------------

@test "meta_loop_path_stub copies stub to stubs dir and adds to PATH" {
  local stub_src="${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  meta_loop_path_stub claude "${stub_src}"
  [ -x "${BATS_TEST_TMPDIR}/stubs/claude" ]
  [[ ":${PATH}:" == *":${BATS_TEST_TMPDIR}/stubs:"* ]]
}

@test "meta_loop_path_stub makes the stub executable as a command" {
  local stub_src="${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  meta_loop_path_stub claude "${stub_src}"
  run claude
  [ "$status" -eq 0 ]
}

@test "meta_loop_path_stub called twice does not duplicate PATH entry" {
  local stub_src="${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  meta_loop_path_stub claude "${stub_src}"
  meta_loop_path_stub claude "${stub_src}"
  # count occurrences of stubs dir in PATH
  local count
  count=$(echo "${PATH}" | tr ':' '\n' | grep -c "^${BATS_TEST_TMPDIR}/stubs$" || true)
  [ "${count}" -eq 1 ]
}

# ---------------------------------------------------------------------------
# meta_loop_assert_file_contains
# ---------------------------------------------------------------------------

@test "meta_loop_assert_file_contains succeeds when substring is present" {
  local f="${BATS_TEST_TMPDIR}/testfile.txt"
  echo "hello world" > "${f}"
  meta_loop_assert_file_contains "${f}" "hello"
}

@test "meta_loop_assert_file_contains fails when substring is absent" {
  local f="${BATS_TEST_TMPDIR}/testfile.txt"
  echo "hello world" > "${f}"
  run meta_loop_assert_file_contains "${f}" "goodbye"
  [ "$status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# meta_loop_assert_file_missing
# ---------------------------------------------------------------------------

@test "meta_loop_assert_file_missing succeeds when file does not exist" {
  meta_loop_assert_file_missing "${BATS_TEST_TMPDIR}/no-such-file.txt"
}

@test "meta_loop_assert_file_missing fails when file exists" {
  local f="${BATS_TEST_TMPDIR}/present.txt"
  touch "${f}"
  run meta_loop_assert_file_missing "${f}"
  [ "$status" -ne 0 ]
}

# ---------------------------------------------------------------------------
# meta_loop_reset_fake_env
# ---------------------------------------------------------------------------

@test "meta_loop_reset_fake_env unsets FAKE_CLAUDE_* variables" {
  export FAKE_CLAUDE_EXIT_CODE=3
  export FAKE_CLAUDE_STDOUT="custom"
  export FAKE_CLAUDE_STDERR="err"
  export FAKE_CLAUDE_LOG_FILE="/tmp/log"
  meta_loop_reset_fake_env
  [ -z "${FAKE_CLAUDE_EXIT_CODE+x}" ]
  [ -z "${FAKE_CLAUDE_STDOUT+x}" ]
  [ -z "${FAKE_CLAUDE_STDERR+x}" ]
  [ -z "${FAKE_CLAUDE_LOG_FILE+x}" ]
}

@test "meta_loop_reset_fake_env unsets FAKE_TMUX_* variables" {
  export FAKE_TMUX_SESSIONS="a,b"
  export FAKE_TMUX_LOG_FILE="/tmp/log"
  meta_loop_reset_fake_env
  [ -z "${FAKE_TMUX_SESSIONS+x}" ]
  [ -z "${FAKE_TMUX_LOG_FILE+x}" ]
}

@test "meta_loop_reset_fake_env unsets FAKE_GIT_* variables" {
  export FAKE_GIT_EXIT_CODE=2
  export FAKE_GIT_LOG_FILE="/tmp/log"
  meta_loop_reset_fake_env
  [ -z "${FAKE_GIT_EXIT_CODE+x}" ]
  [ -z "${FAKE_GIT_LOG_FILE+x}" ]
}
