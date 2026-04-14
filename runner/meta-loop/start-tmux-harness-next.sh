#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SESSION_NAME="meta-loop-next"
WORKSPACE_DIR="${HARNESS_ROOT}/workspace/harness-next/workspace/ec-sample"
LOG_FILE="${WORKSPACE_DIR}/meta-loop.log"
META_LOOP_BIN="${SCRIPT_DIR}/meta-loop.sh"

if tmux has-session -t "${SESSION_NAME}" 2>/dev/null; then
  echo "Session '${SESSION_NAME}' already exists. Attach with: tmux attach -t ${SESSION_NAME}" >&2
  exit 2
fi

tmux new-session -d -s "${SESSION_NAME}" -c "${WORKSPACE_DIR}"
tmux pipe-pane -t "${SESSION_NAME}" -o "cat >> '${LOG_FILE}'"

LOOP_BODY="export META_LOOP_HARNESS_NAME=harness-next; export META_LOOP_INVOKER=default; while true; do \"${META_LOOP_BIN}\" --target \"${WORKSPACE_DIR}\"; rc=\$?; if [ \"\$rc\" -eq 3 ]; then echo '[meta-loop-next] 連続3回失敗で停止' >&2; break; fi; if [ \"\$rc\" -ne 0 ]; then echo '[meta-loop-next] 失敗 (exit='\$rc'), 10秒待機' >&2; sleep 10; fi; done"

tmux send-keys -t "${SESSION_NAME}" "${LOOP_BODY}" C-m
