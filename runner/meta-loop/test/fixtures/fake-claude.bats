#!/usr/bin/env bats
# Tests for fixtures/fake-claude.sh

load "../helpers"

setup() {
  meta_loop_reset_fake_env
  meta_loop_path_stub claude "${BATS_TEST_DIRNAME}/fake-claude.sh"
}

@test "fake-claude default: exits 0" {
  run claude
  [ "$status" -eq 0 ]
}

@test "fake-claude default: outputs 'fake claude ok' to stdout" {
  run claude
  [ "$output" = "fake claude ok" ]
}

@test "fake-claude FAKE_CLAUDE_EXIT_CODE=3 exits with code 3" {
  export FAKE_CLAUDE_EXIT_CODE=3
  run claude
  [ "$status" -eq 3 ]
}

@test "fake-claude FAKE_CLAUDE_STDOUT overrides stdout" {
  export FAKE_CLAUDE_STDOUT="custom output"
  run claude
  [ "$output" = "custom output" ]
}

@test "fake-claude FAKE_CLAUDE_STDERR non-empty outputs to stderr" {
  export FAKE_CLAUDE_STDERR="error message"
  run claude
  [ "$status" -eq 0 ]
  # bats `run` merges stderr into $output when using default mode
  # we verify by checking the combined output
  [[ "$output" == *"error message"* ]]
}

@test "fake-claude FAKE_CLAUDE_LOG_FILE records arguments" {
  local log_file="${BATS_TEST_TMPDIR}/claude.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"
  run claude --print "hello world"
  [ -f "${log_file}" ]
  run grep -q "\-\-print" "${log_file}"
  [ "$status" -eq 0 ]
}

@test "fake-claude FAKE_CLAUDE_LOG_FILE appends on repeated calls" {
  local log_file="${BATS_TEST_TMPDIR}/claude.log"
  export FAKE_CLAUDE_LOG_FILE="${log_file}"
  claude first-call
  claude second-call
  local line_count
  line_count=$(wc -l < "${log_file}")
  [ "${line_count}" -ge 2 ]
}
