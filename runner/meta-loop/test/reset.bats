#!/usr/bin/env bats
# runner/meta-loop/test/reset.bats
# Tests for runner/meta-loop/reset.sh
#
# AC-7 (FR-7): reset.sh — archive + re-init

load "helpers"

RESET_SCRIPT="${BATS_TEST_DIRNAME}/../reset.sh"
FAKE_TMUX_FIXTURE="${BATS_TEST_DIRNAME}/fixtures/fake-tmux.sh"

# ---------------------------------------------------------------------------
# setup: shared test environment
#
# - fake-tmux is installed via META_LOOP_TMUX_BIN (not PATH manipulation,
#   because reset.sh uses the env var for its tmux binary)
# - META_LOOP_WORKSPACE_DIR points to a temp directory
# - META_LOOP_ARCHIVE_ROOT points to a temp directory
# - META_LOOP_INIT_WORKSPACE_BIN will be set per-test
# ---------------------------------------------------------------------------

setup() {
  meta_loop_reset_fake_env

  # Build the fake-init-workspace stub in BATS_TEST_TMPDIR
  local stub="${BATS_TEST_TMPDIR}/fake-init-workspace.sh"
  cat > "${stub}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${STUB_INIT_LOG_FILE:-}" ]; then
  echo "args: $*" >> "${STUB_INIT_LOG_FILE}"
  echo "workspace: ${META_LOOP_WORKSPACE_DIR:-}" >> "${STUB_INIT_LOG_FILE}"
fi
# Re-create workspace as an empty directory with a .gitignore
mkdir -p "${META_LOOP_WORKSPACE_DIR:-/dev/null}"
touch "${META_LOOP_WORKSPACE_DIR:-/dev/null}/.gitignore"
STUB
  chmod +x "${stub}"

  export META_LOOP_WORKSPACE_DIR="${BATS_TEST_TMPDIR}/ec-sample"
  export META_LOOP_ARCHIVE_ROOT="${BATS_TEST_TMPDIR}/archive"
  export META_LOOP_TMUX_BIN="${FAKE_TMUX_FIXTURE}"
  export META_LOOP_INIT_WORKSPACE_BIN="${stub}"
}

# ---------------------------------------------------------------------------
# TC-1 (AC-7): tmux 稼働中で拒否
# Given: fake-tmux が meta-loop-ec セッションを稼働中として認識する
#        workspace ダミーが存在する
# When:  reset.sh を実行する
# Then:  exit 2、stderr に「稼働中」のメッセージ、workspace は元の場所に残る
# ---------------------------------------------------------------------------

@test "reset: exits 2 when tmux session meta-loop-ec is running" {
  # Given
  export FAKE_TMUX_SESSIONS="meta-loop-ec"
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
  touch "${META_LOOP_WORKSPACE_DIR}/dummy.txt"

  # When
  run "${RESET_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # stderr contains a message indicating the session is active
  # (bats captures stderr in $output when using run without --separate-stderr)
  [[ "${output}" == *"meta-loop-ec"* ]] || [[ "${output}" == *"稼働"* ]] || [[ "${output}" == *"running"* ]] || [[ "${output}" == *"active"* ]] || [[ "${output}" == *"stop"* ]]

  # workspace is still at its original location (not moved)
  [ -d "${META_LOOP_WORKSPACE_DIR}" ]
  [ -f "${META_LOOP_WORKSPACE_DIR}/dummy.txt" ]
}

# ---------------------------------------------------------------------------
# TC-2 (AC-7): workspace 不在で拒否
# Given: fake-tmux は未稼働（FAKE_TMUX_SESSIONS=""）
#        workspace が存在しない
# When:  reset.sh を実行する
# Then:  exit 2、stderr にエラーメッセージ
# ---------------------------------------------------------------------------

@test "reset: exits 2 when workspace does not exist" {
  # Given
  export FAKE_TMUX_SESSIONS=""
  # META_LOOP_WORKSPACE_DIR is not created

  # When
  run "${RESET_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # stderr contains an error message
  [ -n "${output}" ]
}

# ---------------------------------------------------------------------------
# TC-3 (AC-7): 正常実行 — archive + init-workspace 呼び出し
# Given: fake-tmux は未稼働（FAKE_TMUX_SESSIONS=""）
#        workspace が存在し、marker.txt が置かれている
# When:  reset.sh を実行する
# Then:  exit 0
#        archive root に <timestamp>/marker.txt が存在する
#        init-workspace stub が --force で呼ばれたログが残っている
# ---------------------------------------------------------------------------

@test "reset: archives workspace and calls init-workspace --force when tmux is not running" {
  # Given
  export FAKE_TMUX_SESSIONS=""
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
  touch "${META_LOOP_WORKSPACE_DIR}/marker.txt"

  local stub_log="${BATS_TEST_TMPDIR}/stub-init.log"
  export STUB_INIT_LOG_FILE="${stub_log}"

  # When
  run "${RESET_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # archive root contains marker.txt under some timestamp directory
  local found
  found="$(find "${META_LOOP_ARCHIVE_ROOT}" -name "marker.txt" 2>/dev/null | head -1)"
  [ -n "${found}" ]

  # init-workspace stub was called with --force
  [ -f "${stub_log}" ]
  grep -qF -- "--force" "${stub_log}"
}

# ---------------------------------------------------------------------------
# TC-4 (AC-7): 再生成確認
# Given: TC-3 と同じセットアップ
# When:  reset.sh を実行する
# Then:  $META_LOOP_WORKSPACE_DIR が存在する（stub が作り直したもの）
#        退避前の marker.txt は再生成後には存在しない（stub は空ディレクトリを作るだけ）
# ---------------------------------------------------------------------------

@test "reset: workspace is re-created by init stub, original marker.txt is gone" {
  # Given
  export FAKE_TMUX_SESSIONS=""
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
  touch "${META_LOOP_WORKSPACE_DIR}/marker.txt"

  export STUB_INIT_LOG_FILE="${BATS_TEST_TMPDIR}/stub-init-tc4.log"

  # When
  run "${RESET_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # workspace exists (stub re-created it)
  [ -d "${META_LOOP_WORKSPACE_DIR}" ]

  # original marker.txt is NOT in workspace (stub creates empty workspace)
  [ ! -f "${META_LOOP_WORKSPACE_DIR}/marker.txt" ]
}
