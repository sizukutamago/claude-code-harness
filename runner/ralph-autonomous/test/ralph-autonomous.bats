#!/usr/bin/env bats
# runner/ralph-autonomous/test/ralph-autonomous.bats
# TDD tests for runner/ralph-autonomous/ralph-autonomous.sh

load "helpers"

RALPH_AUTONOMOUS_SH="${BATS_TEST_DIRNAME}/../ralph-autonomous.sh"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_reset_fake_env

  # fake gates ディレクトリを用意（テスト 9,10 で差し替え）
  export RALPH_GATES_DIR="${BATS_TEST_TMPDIR}/gates"
  mkdir -p "${RALPH_GATES_DIR}"
}

# ---------------------------------------------------------------------------
# AC-1: --config なし → exit 2
# ---------------------------------------------------------------------------
@test "exit 2 when --config is not provided" {
  run bash "${RALPH_AUTONOMOUS_SH}"
  [ "${status}" -eq 2 ]
}

# ---------------------------------------------------------------------------
# AC-2: config.json 不在 → exit 2
# ---------------------------------------------------------------------------
@test "exit 2 when config.json does not exist" {
  # .ralph/config.json を作成しない
  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 2 ]
}

# ---------------------------------------------------------------------------
# AC-3: config_validate 失敗（必須フィールド欠落）→ exit 2
# ---------------------------------------------------------------------------
@test "exit 2 when config.json is missing required fields" {
  mkdir -p "${RATEST_WORKSPACE}/.ralph"
  # 必須フィールドが欠落した最小 JSON
  cat > "${RATEST_WORKSPACE}/.ralph/config.json" <<JSON
{
  "schema_version": "1.0"
}
JSON
  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 2 ]
}

# ---------------------------------------------------------------------------
# AC-4: claude が exit 4（起動失敗）→ consecutive_failures が 1 になる
# ---------------------------------------------------------------------------
@test "consecutive_failures increments to 1 when claude exits with failure" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=1
  export FAKE_CLAUDE_STDOUT="error output"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  # consecutive_failures が 1 なので exit 3 にはならない（exit 4 で終わる）
  [ "${status}" -eq 4 ]

  # state.json の consecutive_failures が 1 になっている
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"
  [ -f "${state_file}" ]
  run jq -r '.consecutive_failures' "${state_file}"
  [ "${output}" = "1" ]
}

# ---------------------------------------------------------------------------
# AC-5: consecutive_failures が 3 → exit 3
# ---------------------------------------------------------------------------
@test "exit 3 when consecutive_failures reaches 3" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=1
  export FAKE_CLAUDE_STDOUT="error output"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  # consecutive_failures を 2 にプリセットした state.json を置く
  cat > "${RATEST_WORKSPACE}/.ralph/state.json" <<JSON
{"iter":2,"consecutive_failures":2,"no_progress_streak":0,"same_error_streak":0,"last_error_hash":"","test_only_streak":0,"checkpoint_tags":[]}
JSON

  run bash "${RALPH_AUTONOMOUS_SH}" --resume --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 3 ]
}

# ---------------------------------------------------------------------------
# AC-6: claude が exit 0（正常完了）→ exit 0
# ---------------------------------------------------------------------------
@test "exit 0 when claude exits normally and gates pass" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="task completed"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  # quality gate を通過する fake gate を作成
  cat > "${RALPH_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: PASS"
exit 0
SCRIPT
  chmod +x "${RALPH_GATES_DIR}/00-test.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-7: claude が exit 10（EXIT_SIGNAL）→ スコープ確認後 exit 10
# ---------------------------------------------------------------------------
@test "exit 10 when EXIT_SIGNAL is detected and scope check passes" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="$(printf 'task completed\nEXIT_SIGNAL')"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  # git diff が空文字を返す（変更なし = スコープ確認通過）
  export FAKE_GIT_STDOUT=""
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  # quality gate を通過する fake gate
  cat > "${RALPH_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: PASS"
exit 0
SCRIPT
  chmod +x "${RALPH_GATES_DIR}/00-test.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 10 ]
}

# ---------------------------------------------------------------------------
# AC-8: EXIT_SIGNAL + スコープ違反 → exit 6
# ---------------------------------------------------------------------------
@test "exit 6 when EXIT_SIGNAL is detected but scope check fails" {
  # allowed_paths を src/** のみに制限
  ralph_autonomous_write_config "${RATEST_WORKSPACE}" '["src/**"]'
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="$(printf 'task completed\nEXIT_SIGNAL')"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  # scope 外のファイルが変更されている
  export FAKE_GIT_STDOUT="docs/unexpected.md"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 6 ]
}

# ---------------------------------------------------------------------------
# AC-9: quality gate 失敗 → exit 5
# ---------------------------------------------------------------------------
@test "exit 5 when quality gate fails" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="task completed"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  # quality gate が失敗する fake gate を作成
  cat > "${RALPH_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: FAIL"
exit 1
SCRIPT
  chmod +x "${RALPH_GATES_DIR}/00-test.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 5 ]
}

# ---------------------------------------------------------------------------
# AC-10: reviewer gate 失敗（REVIEW_MUST）→ exit 5
# ---------------------------------------------------------------------------
@test "exit 5 when reviewer returns REVIEW_MUST" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  export FAKE_CLAUDE_EXIT_CODE=0
  # 1回目の呼び出し（invoker）は EXIT_SIGNAL なし、2回目以降（reviewer）は REVIEW_MUST を返す
  # fake-claude.sh は FAKE_CLAUDE_STDOUT を全呼び出しで返すため、
  # invoker が REVIEW_MUST を返さないよう、先に quality gate を通過させる
  # reviewer gate 失敗のテストのため: invoker は正常、quality gate はパス、reviewer が REVIEW_MUST
  export FAKE_CLAUDE_STDOUT="REVIEW_MUST: something must be fixed"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

  # quality gate は通過させる
  cat > "${RALPH_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: PASS"
exit 0
SCRIPT
  chmod +x "${RALPH_GATES_DIR}/00-test.sh"

  run bash "${RALPH_AUTONOMOUS_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  # invoker は exit 0 で通過 (FAKE_CLAUDE_STDOUT に EXIT_SIGNAL がないため)
  # gates_run_reviewers が REVIEW_MUST を検出して exit 5
  [ "${status}" -eq 5 ]
}
