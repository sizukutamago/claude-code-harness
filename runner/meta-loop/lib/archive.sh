#!/usr/bin/env bash
# runner/meta-loop/ 専用
# runner/meta-loop/lib/archive.sh
#
# workspace 退避ライブラリ。source して使う。
# 依存: date, mkdir, mv のみ。他の meta-loop ライブラリを source しない。
#
# 提供関数:
#   archive_workspace <workspace-path> <archive-root>
#   _archive_next_slot <archive-root> <base-timestamp>

# ---------------------------------------------------------------------------
# _archive_next_slot <archive-root> <base-timestamp>
#
# <archive-root>/<base-timestamp> に衝突がない場合はその文字列を返す。
# 衝突している場合は <base-timestamp>-1, -2, ... と suffix を付与して
# 衝突のない最初のパスを stdout に出力する。
# ---------------------------------------------------------------------------
_archive_next_slot() {
  local archive_root="$1"
  local base_ts="$2"

  local base_dir="${archive_root}/${base_ts}"
  local dest="${base_dir}"
  local counter=1

  while [[ -e "${dest}" ]]; do
    dest="${base_dir}-${counter}"
    counter=$((counter + 1))
  done

  echo "${dest}"
}

# ---------------------------------------------------------------------------
# archive_workspace <workspace-path> <archive-root>
#
# <workspace-path> を <archive-root>/<YYYYMMDD-HHMMSS>/ に mv で退避する。
# <archive-root> が存在しなければ先に作る（mkdir -p）。
# 宛先ディレクトリが既に存在した場合は <ts>-1, -2, ... と suffix を付与する。
# 成功時は退避先の絶対パスを stdout に出力する。
# <workspace-path> が存在しない場合は stderr にエラーを出力して非 0 で終了する。
# ---------------------------------------------------------------------------
archive_workspace() {
  local workspace_path="$1"
  local archive_root="$2"

  # Guard: workspace が存在しなければエラー
  if [[ ! -e "${workspace_path}" ]]; then
    echo "archive_workspace: workspace not found: ${workspace_path}" >&2
    return 1
  fi

  # archive-root を作成
  mkdir -p "${archive_root}"

  # タイムスタンプと退避先パスを決定
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"

  local dest
  dest="$(_archive_next_slot "${archive_root}" "${timestamp}")"

  # 退避実行
  mv "${workspace_path}" "${dest}"

  # 退避先の絶対パスを stdout に出力
  echo "${dest}"
}
