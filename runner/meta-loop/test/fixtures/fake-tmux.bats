#!/usr/bin/env bats
# Tests for fixtures/fake-tmux.sh

load "../helpers"

setup() {
  meta_loop_reset_fake_env
  meta_loop_path_stub tmux "${BATS_TEST_DIRNAME}/fake-tmux.sh"
}

@test "fake-tmux has-session -t missing-session exits 1 when SESSIONS is empty" {
  run tmux has-session -t missing-session
  [ "$status" -eq 1 ]
}

@test "fake-tmux has-session -t hit exits 0 when session is in FAKE_TMUX_SESSIONS" {
  export FAKE_TMUX_SESSIONS="hit,other"
  run tmux has-session -t hit
  [ "$status" -eq 0 ]
}

@test "fake-tmux has-session -t miss exits 1 when session not in FAKE_TMUX_SESSIONS" {
  export FAKE_TMUX_SESSIONS="hit,other"
  run tmux has-session -t miss
  [ "$status" -eq 1 ]
}

@test "fake-tmux new-session exits 0" {
  run tmux new-session -d -s test-session
  [ "$status" -eq 0 ]
}

@test "fake-tmux pipe-pane exits 0" {
  run tmux pipe-pane -t test-session "cat >> /dev/null"
  [ "$status" -eq 0 ]
}

@test "fake-tmux send-keys exits 0" {
  run tmux send-keys -t test-session "echo hello" Enter
  [ "$status" -eq 0 ]
}

@test "fake-tmux FAKE_TMUX_LOG_FILE records new-session arguments" {
  local log_file="${BATS_TEST_TMPDIR}/tmux.log"
  export FAKE_TMUX_LOG_FILE="${log_file}"
  tmux new-session -d -s my-session
  [ -f "${log_file}" ]
  run grep -q "new-session" "${log_file}"
  [ "$status" -eq 0 ]
}

@test "fake-tmux FAKE_TMUX_LOG_FILE records send-keys arguments" {
  local log_file="${BATS_TEST_TMPDIR}/tmux.log"
  export FAKE_TMUX_LOG_FILE="${log_file}"
  tmux send-keys -t my-session "echo test" Enter
  run grep -q "send-keys" "${log_file}"
  [ "$status" -eq 0 ]
}
