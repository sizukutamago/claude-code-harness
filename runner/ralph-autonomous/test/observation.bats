#!/usr/bin/env bats
# runner/ralph-autonomous/test/observation.bats
# TDD tests for runner/ralph-autonomous/lib/observation.sh

load "helpers"

OBSERVATION_SH="${BATS_TEST_DIRNAME}/../lib/observation.sh"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_reset_fake_env
  export LOG_DIR="${BATS_TEST_TMPDIR}/logs"
  mkdir -p "${LOG_DIR}"
}

# ---------------------------------------------------------------------------
# AC-1: fake claude を使い exit 0 と log ファイル生成を確認
# ---------------------------------------------------------------------------
@test "observation_dispatch_exit_succeeds_with_fake_claude" {
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="observation recorded"

  source "${OBSERVATION_SH}"
  run observation_dispatch_exit "${RATEST_WORKSPACE}" "${LOG_DIR}"
  [ "${status}" -eq 0 ]

  # log ファイルが生成されている
  [ -f "${LOG_DIR}/observation-product-user-reviewer.log" ]
  [ -f "${LOG_DIR}/observation-meta-observer.log" ]
}

# ---------------------------------------------------------------------------
# AC-2: log-dir に両 reviewer のログファイルが生成されること
# ---------------------------------------------------------------------------
@test "observation_dispatch_exit_logs_both_reviewers" {
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="observer output"

  source "${OBSERVATION_SH}"
  observation_dispatch_exit "${RATEST_WORKSPACE}" "${LOG_DIR}"

  [ -f "${LOG_DIR}/observation-product-user-reviewer.log" ]
  [ -f "${LOG_DIR}/observation-meta-observer.log" ]
}

# ---------------------------------------------------------------------------
# AC-3: claude バイナリが存在しない場合に非0 を返すこと
# ---------------------------------------------------------------------------
@test "observation_dispatch_exit_nonzero_when_claude_missing" {
  # RALPH_CLAUDE_BIN を存在しないバイナリに設定
  export RALPH_CLAUDE_BIN="/nonexistent/path/to/claude-$(date +%s)"

  source "${OBSERVATION_SH}"
  run observation_dispatch_exit "${RATEST_WORKSPACE}" "${LOG_DIR}"
  [ "${status}" -ne 0 ]
}

# ---------------------------------------------------------------------------
# AC-4: stub が受け取ったプロンプトに cwd が含まれること
# ---------------------------------------------------------------------------
@test "observation_dispatch_exit_passes_cwd_to_reviewer" {
  # stdin を保存するカスタム stub を使用
  local stub_path="${BATS_TEST_TMPDIR}/fake-claude-stdin-logger.sh"
  cat > "${stub_path}" <<STUB
#!/usr/bin/env bash
# stdin を debug-stdin.log に保存して正常終了する
mkdir -p "\${LOG_DIR_STUB:-${LOG_DIR}}"
cat > "\${LOG_DIR_STUB:-${LOG_DIR}}/debug-stdin.log"
echo "observation recorded"
exit 0
STUB
  chmod +x "${stub_path}"
  export RALPH_CLAUDE_BIN="${stub_path}"
  export LOG_DIR_STUB="${LOG_DIR}"

  source "${OBSERVATION_SH}"
  observation_dispatch_exit "${RATEST_WORKSPACE}" "${LOG_DIR}"

  # stdin ログに cwd が含まれている
  [ -f "${LOG_DIR}/debug-stdin.log" ]
  grep -qF "${RATEST_WORKSPACE}" "${LOG_DIR}/debug-stdin.log"
}
