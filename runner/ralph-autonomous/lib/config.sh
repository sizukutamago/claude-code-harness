# runner/ralph-autonomous/lib/config.sh
# .ralph/config.json の読み取り・検証ライブラリ
# source で読み込む前提。#!/usr/bin/env bash / set -euo pipefail は呼び出し側が設定する。

# _CONFIG_REQUIRED_FIELDS: config_validate が検証する必須フィールドの一覧（jq パス形式）
_CONFIG_REQUIRED_FIELDS=(
  ".schema_version"
  ".plan_id"
  ".branch_name"
  ".mode"
  ".references.requirements"
  ".references.design"
  ".references.plan"
  ".scope.allowed_paths"
  ".scope.forbidden_paths"
  ".scope.max_files_changed"
  ".stop_conditions.max_iter"
  ".gates.quality"
  ".gates.reviewers"
  ".exit_signal.required"
  ".exit_signal.marker"
)

# config_read <config-file> <key-path>
#   jq key-path でスカラー値を取得し stdout に出力する。
#   文字列の場合はクォートを除去する（jq -r）。
#   キー不在・null の場合は空文字を出力して exit 0。
#   ファイル不在の場合は exit 2。
config_read() {
  local config_file="$1"
  local key_path="$2"

  if [[ ! -f "${config_file}" ]]; then
    return 2
  fi

  local value
  value="$(jq -r "${key_path} // empty" "${config_file}" 2>/dev/null)"
  printf '%s' "${value}"
}

# config_read_array <config-file> <key-path>
#   配列値を1行1要素で stdout に出力する（jq .[] 形式）。
#   ファイル不在・パス不在の場合は空文字を出力して exit 0。
config_read_array() {
  local config_file="$1"
  local key_path="$2"

  if [[ ! -f "${config_file}" ]]; then
    return 0
  fi

  local result
  result="$(jq -r "${key_path}[] // empty" "${config_file}" 2>/dev/null)" || true
  printf '%s' "${result}"
}

# config_validate <config-file>
#   必須フィールドが全て存在するかチェックする。
#   成功時 exit 0。
#   ファイル不在 → stderr に "config.json not found: <path>" を出力して exit 2。
#   必須フィールド欠落 → stderr に "config.json missing required field: <key>" を出力して exit 2。
config_validate() {
  local config_file="$1"

  if [[ ! -f "${config_file}" ]]; then
    echo "config.json not found: ${config_file}" >&2
    return 2
  fi

  local field value display_key
  for field in "${_CONFIG_REQUIRED_FIELDS[@]}"; do
    display_key="${field#.}"
    value="$(jq -r "${field} // empty" "${config_file}" 2>/dev/null)"
    if [[ -z "${value}" ]]; then
      echo "config.json missing required field: ${display_key}" >&2
      return 2
    fi
  done

  return 0
}
