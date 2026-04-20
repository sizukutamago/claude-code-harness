#!/usr/bin/env bats
# runner/ralph-autonomous/test/start-tmux.bats
# TDD tests for runner/ralph-autonomous/start-tmux.sh

load "helpers"

START_TMUX_SH="${BATS_TEST_DIRNAME}/../start-tmux.sh"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_reset_fake_env
}

# ---------------------------------------------------------------------------
# AC-1: --config なしで exit 1
# ---------------------------------------------------------------------------
@test "exit 1 when --config is not provided" {
  run bash "${START_TMUX_SH}"
  [ "${status}" -eq 1 ]
}

# ---------------------------------------------------------------------------
# AC-2: config.json が読めてセッション名が正しく設定される（plan_id を含む）
# ---------------------------------------------------------------------------
@test "session name includes plan_id from config.json" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  # plan_id = "test-plan" (helpers.bash の ralph_autonomous_write_config より)

  export FAKE_TMUX_LOG_FILE="${BATS_TEST_TMPDIR}/tmux-calls.log"
  ralph_autonomous_path_stub "tmux" "${BATS_TEST_DIRNAME}/fixtures/fake-tmux.sh"

  run bash "${START_TMUX_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 0 ]

  # new-session が "ralph-autonomous-test-plan" を含んで呼ばれていること
  ralph_autonomous_assert_file_contains "${FAKE_TMUX_LOG_FILE}" "ralph-autonomous-test-plan"
}

# ---------------------------------------------------------------------------
# AC-3: 既存セッション検出で exit 2
# ---------------------------------------------------------------------------
@test "exit 2 when session already exists" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"

  # has-session が成功するようにセッション名を登録
  export FAKE_TMUX_SESSIONS="ralph-autonomous-test-plan"
  export FAKE_TMUX_LOG_FILE="${BATS_TEST_TMPDIR}/tmux-calls.log"
  ralph_autonomous_path_stub "tmux" "${BATS_TEST_DIRNAME}/fixtures/fake-tmux.sh"

  run bash "${START_TMUX_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 2 ]
}

# ---------------------------------------------------------------------------
# AC-4: 正常起動で exit 0（tmux new-session が呼ばれる）
# ---------------------------------------------------------------------------
@test "exit 0 and tmux new-session is called on successful start" {
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"

  export FAKE_TMUX_LOG_FILE="${BATS_TEST_TMPDIR}/tmux-calls.log"
  ralph_autonomous_path_stub "tmux" "${BATS_TEST_DIRNAME}/fixtures/fake-tmux.sh"

  run bash "${START_TMUX_SH}" --config "${RATEST_WORKSPACE}/.ralph"
  [ "${status}" -eq 0 ]

  # new-session が呼ばれていること
  ralph_autonomous_assert_file_contains "${FAKE_TMUX_LOG_FILE}" "new-session"
}

# ---------------------------------------------------------------------------
# AC-5: RALPH_HALT ファイル検出時にループが停止すること（_build_loop_body のテスト）
# ---------------------------------------------------------------------------
@test "_build_loop_body: loop stops when RALPH_HALT file exists" {
  # RALPH_HALT ファイルを作成
  local halt_file="${BATS_TEST_TMPDIR}/RALPH_HALT"
  touch "${halt_file}"

  # fake main bin: 呼ばれたらファイルに記録して exit 0
  local fake_main="${BATS_TEST_TMPDIR}/fake-main.sh"
  local main_called_file="${BATS_TEST_TMPDIR}/main-called"
  cat > "${fake_main}" <<SCRIPT
#!/usr/bin/env bash
touch "${main_called_file}"
exit 0
SCRIPT
  chmod +x "${fake_main}"

  # _build_loop_body の出力を取得する（source しても main は呼ばれない）
  local loop_body
  loop_body="$(bash -c "
    source '${START_TMUX_SH}'
    _build_loop_body '${fake_main}' '${BATS_TEST_TMPDIR}/.ralph' '${halt_file}' 'ralph-autonomous-test'
  ")"

  # ループ本体を実行（RALPH_HALT があるのでループはすぐ break するはず）
  bash -c "${loop_body}"

  # main が呼ばれていないこと（HALT ファイルがあるのでループ開始前に break）
  [ ! -f "${main_called_file}" ]
}
