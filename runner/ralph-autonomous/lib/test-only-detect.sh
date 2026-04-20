# runner/ralph-autonomous/lib/test-only-detect.sh
# テストファイルのみの変更検出ライブラリ。
# source 前提。呼び出し側で set -euo pipefail を設定すること。
# 依存: config.sh, state.sh

SCRIPT_DIR_TEST_ONLY_DETECT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! declare -f config_read > /dev/null 2>&1; then
  # shellcheck source=./config.sh
  source "${SCRIPT_DIR_TEST_ONLY_DETECT}/config.sh"
fi

if ! declare -f state_init > /dev/null 2>&1; then
  # shellcheck source=./state.sh
  source "${SCRIPT_DIR_TEST_ONLY_DETECT}/state.sh"
fi

# _is_test_file <filepath>
#   ファイルパスがテストファイルのパターンにマッチするなら exit 0。
#   パターン: **/test/**, **/*.test.*, **/*.spec.*
_is_test_file() {
  local filepath="$1"
  # test/ ディレクトリ配下
  if [[ "${filepath}" == */test/* || "${filepath}" == test/* ]]; then
    return 0
  fi
  # __tests__/ ディレクトリ配下
  if [[ "${filepath}" == */__tests__/* || "${filepath}" == __tests__/* ]]; then
    return 0
  fi
  # *.test.* パターン
  local basename="${filepath##*/}"
  if [[ "${basename}" == *.test.* ]]; then
    return 0
  fi
  # *.spec.* パターン
  if [[ "${basename}" == *.spec.* ]]; then
    return 0
  fi
  return 1
}

# detect_test_only_iter <config-file> <state-file> <cwd>
#   git diff HEAD~1 HEAD --name-only で変更ファイル一覧を取得し、
#   テストファイルのみかどうかを判定する。
#
#   テスト以外ファイルが含まれる場合:
#     test_only_streak を 0 にリセットして exit 0
#   変更なし（空）の場合:
#     exit 0
#   テストファイルのみの場合:
#     test_only_streak を +1 する
#     streak が threshold * max_iter を超えたら exit 3
#     そうでなければ exit 0
detect_test_only_iter() {
  local config_file="$1"
  local state_file="$2"
  local cwd="$3"

  local changed_files
  changed_files="$(git diff HEAD~1 HEAD --name-only 2>/dev/null || true)"

  # 変更なし
  if [[ -z "${changed_files}" ]]; then
    return 0
  fi

  # 各ファイルがテストファイルかどうかチェック
  local all_test=true
  while IFS= read -r filepath; do
    [[ -z "${filepath}" ]] && continue
    if ! _is_test_file "${filepath}"; then
      all_test=false
      break
    fi
  done <<< "${changed_files}"

  if [[ "${all_test}" == false ]]; then
    # テスト以外のファイルが含まれる -> streak をリセット
    state_write "${state_file}" "test_only_streak" "0"
    return 0
  fi

  # テストファイルのみ -> streak を +1
  state_increment "${state_file}" "test_only_streak"

  # 閾値チェック
  local max_iter threshold streak
  max_iter="$(config_read "${config_file}" ".stop_conditions.max_iter")"
  threshold="$(config_read "${config_file}" ".stop_conditions.test_only_ratio_threshold")"
  streak="$(state_read "${state_file}" "test_only_streak")"

  # 閾値 = threshold * max_iter (awk で小数計算)
  local threshold_count
  threshold_count="$(awk "BEGIN { printf \"%d\", ${threshold} * ${max_iter} }")"

  if (( streak > threshold_count )); then
    return 3
  fi

  return 0
}
