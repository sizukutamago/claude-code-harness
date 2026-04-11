#!/usr/bin/env bats
# runner/meta-loop/test/start-tmux.bats
# TDD tests for runner/meta-loop/start-tmux.sh (Task-9)

setup() {
  load 'helpers.bash'
  meta_loop_setup_tmp_workspace
  export FAKE_TMUX_LOG_FILE="${MLTEST_WORKSPACE}/fake-tmux.log"
  meta_loop_path_stub tmux "${BATS_TEST_DIRNAME}/fixtures/fake-tmux.sh"
  export META_LOOP_WORKSPACE_DIR="${MLTEST_WORKSPACE}"
  export META_LOOP_LOG_FILE="${MLTEST_WORKSPACE}/meta-loop.log"
  export META_LOOP_META_LOOP_BIN="${BATS_TEST_DIRNAME}/../meta-loop.sh"
  START_TMUX_SH="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)/start-tmux.sh"
}

teardown() {
  meta_loop_reset_fake_env
}

# ---------------------------------------------------------------------------
# TC-1: new-session 呼び出し
# ---------------------------------------------------------------------------
@test "TC-1: exit 0 and fake-tmux log records new-session when no session exists" {
  export FAKE_TMUX_SESSIONS=""
  run "${START_TMUX_SH}"
  [ "$status" -eq 0 ]
  [ -f "${FAKE_TMUX_LOG_FILE}" ]
  # new-session が記録されていること
  run grep -q "new-session" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
  # セッション名 meta-loop-ec が含まれていること（ログはタブ区切り）
  run grep -q "meta-loop-ec" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
  # new-session の行に -d が含まれていること
  run grep -E "new-session.*-d|-d.*new-session" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC-2: pipe-pane の出力先検証（SHOULD-2 対応）
# ---------------------------------------------------------------------------
@test "TC-2: fake-tmux log records pipe-pane with META_LOOP_LOG_FILE path" {
  export FAKE_TMUX_SESSIONS=""
  run "${START_TMUX_SH}"
  [ "$status" -eq 0 ]
  [ -f "${FAKE_TMUX_LOG_FILE}" ]
  run grep -q "pipe-pane" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
  # META_LOOP_LOG_FILE のパスが pipe-pane の引数に含まれていることを確認
  run grep -qF "meta-loop.log" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC-3: send-keys 内容に sleep 10 と -eq 3 が含まれる
# ---------------------------------------------------------------------------
@test "TC-3: send-keys loop body contains sleep 10 and -eq 3" {
  export FAKE_TMUX_SESSIONS=""
  run "${START_TMUX_SH}"
  [ "$status" -eq 0 ]
  [ -f "${FAKE_TMUX_LOG_FILE}" ]
  run grep -q "send-keys" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
  run grep -qF "sleep 10" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
  run grep -qF -- "-eq 3" "${FAKE_TMUX_LOG_FILE}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# TC-4: 既存セッションで exit 2
# ---------------------------------------------------------------------------
@test "TC-4: exits 2 and prints guidance to stderr when session already exists" {
  export FAKE_TMUX_SESSIONS="meta-loop-ec"
  run "${START_TMUX_SH}"
  [ "$status" -eq 2 ]
  # stderr に案内メッセージが含まれていること
  echo "${output}" | grep -q "meta-loop-ec"
}

# ---------------------------------------------------------------------------
# TC-5: 呼び出し順序の検証
# ---------------------------------------------------------------------------
@test "TC-5: tmux commands are called in order: has-session -> new-session -> pipe-pane -> send-keys" {
  export FAKE_TMUX_SESSIONS=""
  run "${START_TMUX_SH}"
  [ "$status" -eq 0 ]
  [ -f "${FAKE_TMUX_LOG_FILE}" ]

  # ログから各コマンドの行番号を取得して順序を確認
  local has_session_line new_session_line pipe_pane_line send_keys_line
  has_session_line="$(grep -n "has-session" "${FAKE_TMUX_LOG_FILE}" | head -1 | cut -d: -f1)"
  new_session_line="$(grep -n "new-session" "${FAKE_TMUX_LOG_FILE}" | head -1 | cut -d: -f1)"
  pipe_pane_line="$(grep -n "pipe-pane" "${FAKE_TMUX_LOG_FILE}" | head -1 | cut -d: -f1)"
  send_keys_line="$(grep -n "send-keys" "${FAKE_TMUX_LOG_FILE}" | head -1 | cut -d: -f1)"

  # 全コマンドが存在すること
  [ -n "${has_session_line}" ]
  [ -n "${new_session_line}" ]
  [ -n "${pipe_pane_line}" ]
  [ -n "${send_keys_line}" ]

  # 順序: has-session < new-session < pipe-pane < send-keys
  [ "${has_session_line}" -lt "${new_session_line}" ]
  [ "${new_session_line}" -lt "${pipe_pane_line}" ]
  [ "${pipe_pane_line}" -lt "${send_keys_line}" ]
}
