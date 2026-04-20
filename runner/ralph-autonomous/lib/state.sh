# runner/ralph-autonomous/lib/state.sh
# .ralph/state.json の CRUD ライブラリ。
# source 前提。呼び出し側で set -euo pipefail を設定すること。
# 依存: jq

# _state_atomic_write <state-file> <json-content>
#   同一ディレクトリの tmp ファイル経由で atomic write する。
_state_atomic_write() {
  local state_file="$1"
  local content="$2"
  local dir
  dir="$(dirname "${state_file}")"
  local tmp_file
  tmp_file="${dir}/.state.tmp.$$"
  # jq の出力は末尾改行を含むため printf %s で書き込む
  printf '%s' "${content}" > "${tmp_file}"
  mv "${tmp_file}" "${state_file}"
}

# state_init <state-file>
#   state.json が存在しない場合、初期値で作成する。すでに存在する場合は何もしない。
state_init() {
  local state_file="$1"
  if [ -f "${state_file}" ]; then
    return 0
  fi
  local dir
  dir="$(dirname "${state_file}")"
  mkdir -p "${dir}"
  local initial
  initial='{"iter":0,"consecutive_failures":0,"no_progress_streak":0,"same_error_streak":0,"last_error_hash":"","test_only_streak":0,"checkpoint_tags":[]}'
  _state_atomic_write "${state_file}" "${initial}"
}

# state_read <state-file> <key>
#   jq でスカラー値を取得して stdout に出力する。
#   ファイル不在の場合は "0"（または ""）を出力して exit 0。
#   キー不在の場合は "0" を出力（文字列キーは "" を返す）。
state_read() {
  local state_file="$1"
  local key="$2"
  if [ ! -f "${state_file}" ]; then
    echo "0"
    return 0
  fi
  local value
  value="$(jq -r --arg k "${key}" '.[$k] // "0"' "${state_file}")"
  echo "${value}"
}

# state_write <state-file> <key> <value>
#   jq + tmp/mv で atomic に key を更新する。値はスカラー（文字列 or 数値）。
state_write() {
  local state_file="$1"
  local key="$2"
  local value="$3"
  if [ ! -f "${state_file}" ]; then
    state_init "${state_file}"
  fi
  local updated
  # 数値か文字列かを判定して適切に書き込む
  if [[ "${value}" =~ ^-?[0-9]+$ ]]; then
    updated="$(jq --arg k "${key}" --argjson v "${value}" '.[$k] = $v' "${state_file}")"
  else
    updated="$(jq --arg k "${key}" --arg v "${value}" '.[$k] = $v' "${state_file}")"
  fi
  _state_atomic_write "${state_file}" "${updated}"
}

# state_increment <state-file> <key>
#   指定キーの値を +1 する。ファイル不在なら初期化してから +1。
state_increment() {
  local state_file="$1"
  local key="$2"
  if [ ! -f "${state_file}" ]; then
    state_init "${state_file}"
  fi
  local updated
  updated="$(jq --arg k "${key}" '.[$k] = ((.[$k] // 0) | tonumber + 1)' "${state_file}")"
  _state_atomic_write "${state_file}" "${updated}"
}

# state_reset_failure <state-file>
#   consecutive_failures を 0 にリセットする。
state_reset_failure() {
  local state_file="$1"
  state_write "${state_file}" "consecutive_failures" "0"
}

# state_push_checkpoint_tag <state-file> <tag>
#   checkpoint_tags 配列に tag を追加する。
state_push_checkpoint_tag() {
  local state_file="$1"
  local tag="$2"
  if [ ! -f "${state_file}" ]; then
    state_init "${state_file}"
  fi
  local updated
  updated="$(jq --arg t "${tag}" '.checkpoint_tags += [$t]' "${state_file}")"
  _state_atomic_write "${state_file}" "${updated}"
}
