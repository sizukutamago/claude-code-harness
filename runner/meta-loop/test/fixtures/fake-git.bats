#!/usr/bin/env bats
# Tests for fixtures/fake-git.sh

load "../helpers"

setup() {
  meta_loop_reset_fake_env
  meta_loop_path_stub git "${BATS_TEST_DIRNAME}/fake-git.sh"
}

@test "fake-git default exits 0" {
  run git status
  [ "$status" -eq 0 ]
}

@test "fake-git FAKE_GIT_EXIT_CODE=2 exits with code 2" {
  export FAKE_GIT_EXIT_CODE=2
  run git status
  [ "$status" -eq 2 ]
}

@test "fake-git FAKE_GIT_LOG_FILE records subcommand" {
  local log_file="${BATS_TEST_TMPDIR}/git.log"
  export FAKE_GIT_LOG_FILE="${log_file}"
  git commit -m "test message"
  [ -f "${log_file}" ]
  run grep -q "commit" "${log_file}"
  [ "$status" -eq 0 ]
}

@test "fake-git FAKE_GIT_LOG_FILE records all arguments" {
  local log_file="${BATS_TEST_TMPDIR}/git.log"
  export FAKE_GIT_LOG_FILE="${log_file}"
  git add somefile.txt
  run grep -q "somefile.txt" "${log_file}"
  [ "$status" -eq 0 ]
}

@test "fake-git FAKE_GIT_LOG_FILE appends on repeated calls" {
  local log_file="${BATS_TEST_TMPDIR}/git.log"
  export FAKE_GIT_LOG_FILE="${log_file}"
  git status
  git log --oneline
  local line_count
  line_count=$(wc -l < "${log_file}")
  [ "${line_count}" -ge 2 ]
}
