# runner/ralph-autonomous/lib/checkpoint.sh
# チェックポイント作成・判定ライブラリ。
# source 前提。呼び出し側で set -euo pipefail を設定すること。
# 依存: config.sh, state.sh

SCRIPT_DIR_CHECKPOINT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! declare -f config_read > /dev/null 2>&1; then
  # shellcheck source=./config.sh
  source "${SCRIPT_DIR_CHECKPOINT}/config.sh"
fi

if ! declare -f state_init > /dev/null 2>&1; then
  # shellcheck source=./state.sh
  source "${SCRIPT_DIR_CHECKPOINT}/state.sh"
fi

# should_checkpoint <config-file> <iter>
#   iter が checkpoint_every の倍数なら exit 0（チェックポイントを作成すべき）。
#   そうでなければ exit 1。
#   checkpoint_every が未設定の場合はデフォルト 5 を使用する。
should_checkpoint() {
  local config_file="$1"
  local iter="$2"

  local checkpoint_every
  checkpoint_every="$(config_read "${config_file}" ".stop_conditions.checkpoint_every")"
  if [[ -z "${checkpoint_every}" ]]; then
    checkpoint_every=5
  fi

  if (( iter % checkpoint_every == 0 )); then
    return 0
  else
    return 1
  fi
}

# checkpoint_create <config-file> <state-file> <iter>
#   git tag ralph-checkpoint-<iter> を実行し、state.json の checkpoint_tags に追加する。
checkpoint_create() {
  local config_file="$1"
  local state_file="$2"
  local iter="$3"

  local tag="ralph-checkpoint-${iter}"

  git tag "${tag}"
  state_push_checkpoint_tag "${state_file}" "${tag}"
}
