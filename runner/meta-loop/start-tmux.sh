#!/usr/bin/env bash
# runner/meta-loop/start-tmux.sh
#
# meta-loop-ec という tmux セッションを detached で作成し、
# pipe-pane でログファイルを設定し、meta-loop.sh を while ループで起動する。
#
# Usage:
#   start-tmux.sh
#
# Exit codes:
#   0: セッション起動成功
#   2: 既存セッションあり

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# 環境変数（テスト容易性のためオーバーライド可能）
# ---------------------------------------------------------------------------
META_LOOP_WORKSPACE_DIR="${META_LOOP_WORKSPACE_DIR:-${SCRIPT_DIR}/../../workspace/ec-sample}"
META_LOOP_LOG_FILE="${META_LOOP_LOG_FILE:-${META_LOOP_WORKSPACE_DIR}/meta-loop.log}"
META_LOOP_META_LOOP_BIN="${META_LOOP_META_LOOP_BIN:-${SCRIPT_DIR}/meta-loop.sh}"

SESSION_NAME="meta-loop-ec"

# ---------------------------------------------------------------------------
# _build_loop_body
#
# while ループ本体の文字列を生成する（send-keys に渡す1行）。
# ---------------------------------------------------------------------------
_build_loop_body() {
  local bin="$1"
  local workspace="$2"
  printf 'while true; do "%s" --target "%s"; rc=$?; if [ "$rc" -eq 3 ]; then echo "[meta-loop] 連続3回失敗で停止。tmux attach -t meta-loop-ec で原因確認を" >&2; break; fi; if [ "$rc" -ne 0 ]; then echo "[meta-loop] イテレーション失敗 (exit=$rc), 10秒待機" >&2; sleep 10; fi; done' \
    "${bin}" "${workspace}"
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
  # 1. 既存セッションチェック
  if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
    echo "既に稼働中。attach するには \`tmux attach -t ${SESSION_NAME}\`" >&2
    exit 2
  fi

  # 2. tmux new-session（detached）
  tmux new-session -d -s "${SESSION_NAME}" -c "${META_LOOP_WORKSPACE_DIR}"

  # 3. pipe-pane でログファイルへ追記
  tmux pipe-pane -t "${SESSION_NAME}" -o "cat >> \"${META_LOOP_LOG_FILE}\""

  # 4. send-keys でループ本体を注入
  local loop_body
  loop_body="$(_build_loop_body "${META_LOOP_META_LOOP_BIN}" "${META_LOOP_WORKSPACE_DIR}")"
  tmux send-keys -t "${SESSION_NAME}" "${loop_body}" C-m

  exit 0
}

main "$@"
