#!/usr/bin/env bash
# runner/meta-loop/lib/state.sh
#
# !! これは runner/meta-loop/ 専用のライブラリです !!
# runner/lib/state-manager.sh とは完全に独立しており、互いを参照しません。
#
# 使い方: source runner/meta-loop/lib/state.sh
#
# set -euo pipefail は呼び出し側に委ねます（このファイル内では設定しません）。
#
# 対象ステートファイル: workspace/ec-sample/.meta-loop-state
# フォーマット: KEY=VALUE 形式（1行1エントリ）
#              空行・# で始まるコメント行は無視されます。

# ---------------------------------------------------------------------------
# state_read <state-file> <key>
#
# 指定ファイルから KEY=VALUE を grep して VALUE を stdout に出力する。
# ファイル不在の場合は 0 を出力する。
# キー不在の場合は 0 を出力する。
# ---------------------------------------------------------------------------
state_read() {
  local state_file="$1"
  local key="$2"

  if [ ! -f "${state_file}" ]; then
    echo "0"
    return 0
  fi

  local value
  value="$(grep -E "^${key}=" "${state_file}" | tail -1 | awk -F= '{print $2}')"

  if [ -z "${value}" ]; then
    echo "0"
  else
    echo "${value}"
  fi
}

# ---------------------------------------------------------------------------
# _state_write_key <state-file> <key> <value>
#
# ステートファイルの指定キーを value で上書きする（他のキーは保全）。
# ファイルが存在しない場合は新規作成する。
# tmp ファイル + mv による原子書き込みを使用する。
# ---------------------------------------------------------------------------
_state_write_key() {
  local state_file="$1"
  local key="$2"
  local value="$3"

  local dir
  dir="$(dirname "${state_file}")"

  # tmp ファイルを同じディレクトリに作成（mv が atomic になるよう同一 fs 上に置く）
  local tmp_file
  tmp_file="$(mktemp "${dir}/.state_tmp.XXXXXX")"

  # 既存ファイルから指定キー以外の行を保全しつつ、新しい値を書き込む
  if [ -f "${state_file}" ]; then
    # キーにマッチしない行（空行・コメント含む）を保持
    grep -v "^${key}=" "${state_file}" > "${tmp_file}" || true
  fi

  # 新しい値を追記
  echo "${key}=${value}" >> "${tmp_file}"

  # 原子的に置き換え
  mv "${tmp_file}" "${state_file}"
}

# ---------------------------------------------------------------------------
# state_increment <state-file> <key>
#
# 指定キーの値を読み取り、+1 して書き戻す（汎用版）。
# ファイル不在なら新規作成してキー=1 にする。
# キー不在なら 0 + 1 = 1 として書き込む。
# 他のキーは保全する。
# ---------------------------------------------------------------------------
state_increment() {
  local state_file="$1"
  local key="$2"

  local current
  current="$(state_read "${state_file}" "${key}")"

  local new_value
  new_value=$(( current + 1 ))

  _state_write_key "${state_file}" "${key}" "${new_value}"
}

# ---------------------------------------------------------------------------
# state_increment_failure <state-file>
#
# consecutive_failures を読み取り、+1 して書き戻す。
# ファイル不在なら新規作成して consecutive_failures=1 にする。
# 他のキーは保全する。
# ---------------------------------------------------------------------------
state_increment_failure() {
  local state_file="$1"
  state_increment "${state_file}" "consecutive_failures"
}

# ---------------------------------------------------------------------------
# state_reset_failure <state-file>
#
# consecutive_failures=0 に書き戻す。
# 他のキーは保全する。
# ファイル不在なら新規作成する。
# ---------------------------------------------------------------------------
state_reset_failure() {
  local state_file="$1"

  _state_write_key "${state_file}" "consecutive_failures" "0"
}
