#!/usr/bin/env bash
# runner/ralph-autonomous/start-tmux.sh
#
# ralph-autonomous 向けの tmux セッションを detached で作成し、
# pipe-pane でログファイルを設定し、ralph-autonomous.sh を while ループで起動する。
#
# Usage:
#   start-tmux.sh --config <path-to-.ralph-dir>
#
# Exit codes:
#   0: セッション起動成功
#   1: 引数エラー（--config なし）
#   2: 既存セッションあり

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# 環境変数（テスト容易性のためオーバーライド可能）
# ---------------------------------------------------------------------------
RALPH_TMUX_BIN="${RALPH_TMUX_BIN:-tmux}"
RALPH_MAIN_BIN="${RALPH_MAIN_BIN:-${SCRIPT_DIR}/ralph-autonomous.sh}"

# ---------------------------------------------------------------------------
# _build_loop_body <main-bin> <config-dir> <halt-file> <session-name>
#
# while ループ本体の文字列を生成する（send-keys に渡す1行）。
# ---------------------------------------------------------------------------
_build_loop_body() {
  local main_bin="$1"
  local config_dir="$2"
  local halt_file="$3"
  local session_name="$4"
  printf 'while true; do if [ -f "%s" ]; then echo "[ralph] RALPH_HALT detected" >&2; break; fi; "%s" --config "%s"; rc=$?; if [ "$rc" -eq 10 ]; then echo "[ralph] EXIT_SIGNAL received. loop completed." >&2; break; fi; if [ "$rc" -eq 3 ]; then echo "[ralph] Circuit breaker (exit 3). Stopping." >&2; break; fi; if [ "$rc" -ne 0 ]; then echo "[ralph] iter failed (exit=$rc), retrying in 10s..." >&2; sleep 10; fi; done' \
    "${halt_file}" "${main_bin}" "${config_dir}"
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
  # 1. 引数チェック
  local config_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --config)
        shift
        config_dir="${1:-}"
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  if [[ -z "${config_dir}" ]]; then
    echo "Usage: start-tmux.sh --config <path-to-.ralph-dir>" >&2
    exit 1
  fi

  # 2. config.json から plan_id を読み取る
  # shellcheck source=runner/ralph-autonomous/lib/config.sh
  source "${SCRIPT_DIR}/lib/config.sh"
  local config_file="${config_dir}/config.json"
  local plan_id
  plan_id="$(config_read "${config_file}" ".plan_id")"

  local session_name="ralph-autonomous-${plan_id}"

  # 3. 既存セッションチェック
  if "${RALPH_TMUX_BIN}" has-session -t "${session_name}" 2>/dev/null; then
    echo "既に稼働中。attach するには \`${RALPH_TMUX_BIN} attach -t ${session_name}\`" >&2
    exit 2
  fi

  # 4. ログファイルとHALTファイルのパス
  local log_file="${config_dir}/ralph-loop.log"
  local halt_file="${config_dir}/RALPH_HALT"

  # 5. tmux new-session（detached）
  "${RALPH_TMUX_BIN}" new-session -d -s "${session_name}" -c "${config_dir}"

  # 6. pipe-pane でログファイルへ追記
  "${RALPH_TMUX_BIN}" pipe-pane -t "${session_name}" -o "cat >> \"${log_file}\""

  # 7. send-keys でループ本体を注入
  local loop_body
  loop_body="$(_build_loop_body "${RALPH_MAIN_BIN}" "${config_dir}" "${halt_file}" "${session_name}")"
  "${RALPH_TMUX_BIN}" send-keys -t "${session_name}" "${loop_body}" C-m

  exit 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
