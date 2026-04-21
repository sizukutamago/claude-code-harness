#!/usr/bin/env bats
# runner/ralph-autonomous/test/ralph-autonomous-observation.bats
# Integration tests for observation layer in ralph-autonomous.sh

load "helpers"

RALPH_AUTONOMOUS_SH="${BATS_TEST_DIRNAME}/../ralph-autonomous.sh"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_reset_fake_env

  export RALPH_GATES_DIR="${BATS_TEST_TMPDIR}/gates"
  mkdir -p "${RALPH_GATES_DIR}"

  # デフォルト quality gate (pass)
  cat > "${RALPH_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: PASS"
exit 0
SCRIPT
  chmod +x "${RALPH_GATES_DIR}/00-test.sh"
}

# ---------------------------------------------------------------------------
# AC-1: EXIT_SIGNAL 検出時に observation log が生成されること
# ---------------------------------------------------------------------------
@test "ralph_autonomous_calls_observation_on_exit_signal" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"

  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="$(printf 'task completed\nEXIT_SIGNAL')"
  # git diff は空（スコープ確認パス）
  export FAKE_GIT_STDOUT=""
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 10 ]

  local log_dir="${RATEST_WORKSPACE}/.ralph/logs"
  [ -f "${log_dir}/observation-product-user-reviewer.log" ]
  [ -f "${log_dir}/observation-meta-observer.log" ]
}

# ---------------------------------------------------------------------------
# AC-2: RALPH_SKIP_OBSERVATION=1 でスキップされること
# ---------------------------------------------------------------------------
@test "ralph_autonomous_skips_observation_when_env_set" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"

  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="$(printf 'task completed\nEXIT_SIGNAL')"
  export FAKE_GIT_STDOUT=""
  export RALPH_SKIP_OBSERVATION=1
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 10 ]

  local log_dir="${RATEST_WORKSPACE}/.ralph/logs"
  # observation log が生成されていないこと
  [ ! -f "${log_dir}/observation-product-user-reviewer.log" ]
  [ ! -f "${log_dir}/observation-meta-observer.log" ]
}

# ---------------------------------------------------------------------------
# AC-3: EXIT_SIGNAL なし（通常 exit 0）では observation が走らないこと
# ---------------------------------------------------------------------------
@test "ralph_autonomous_observation_not_called_on_normal_exit" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"

  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="task completed"  # EXIT_SIGNAL なし
  export FAKE_GIT_STDOUT=""
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 0 ]

  local log_dir="${RATEST_WORKSPACE}/.ralph/logs"
  # observation log が生成されていないこと
  [ ! -f "${log_dir}/observation-product-user-reviewer.log" ]
  [ ! -f "${log_dir}/observation-meta-observer.log" ]
}
