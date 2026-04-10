#!/usr/bin/env bash
# conventions-builder.sh — learnings.jsonl を分析し、繰り返し出現するパターンを
# conventions.md に昇格させる。
# source で読み込む前提。直接実行しない。

# state-manager.sh を source する（archive_learnings を使うため）
_CONVENTIONS_BUILDER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_CONVENTIONS_BUILDER_DIR}/state-manager.sh"

# ---------------------------------------------------------------------------
# promote_to_conventions <conventions_file> <type> <content>
#   conventions.md にエントリを追記する。
#   既に同じ content が conventions.md に存在する場合は追加しない（冪等）。
# ---------------------------------------------------------------------------
promote_to_conventions() {
  local conventions_file="$1"
  local type="$2"
  local content="$3"

  # 既に同じ content が存在する場合はスキップ（冪等）
  if [ -f "${conventions_file}" ] && grep -qF "${content}" "${conventions_file}"; then
    return 0
  fi

  # ファイルが存在しない場合は作成する
  if [ ! -f "${conventions_file}" ]; then
    touch "${conventions_file}"
  fi

  # type と content を追記する（後で build_conventions_md で整形するための raw 形式）
  printf 'ENTRY type=%s content="%s"\n' "${type}" "${content}" >> "${conventions_file}"
}

# ---------------------------------------------------------------------------
# build_conventions_md <conventions_file> <entries_json>
#   JSON 配列（[{"type":"pattern","content":"..."},...}）を受け取り、
#   conventions.md をカテゴリ別（type 別）に整形して書き出す。
# ---------------------------------------------------------------------------
build_conventions_md() {
  local conventions_file="$1"
  local entries_json="$2"

  # type の一覧を取得する（順序を保つため unique を使う）
  local types
  types="$(printf '%s' "${entries_json}" | jq -r '.[].type' | sort -u)"

  {
    printf '# Project Conventions (auto-generated from learnings)\n'

    while IFS= read -r type; do
      [ -z "${type}" ] && continue
      printf '\n## %s\n' "${type}"
      # 該当 type のエントリを列挙する
      while IFS= read -r content; do
        printf '%s\n' "- ${content}"
      done < <(printf '%s' "${entries_json}" | jq -r --arg t "${type}" '.[] | select(.type == $t) | .content')
    done <<< "${types}"
  } > "${conventions_file}"
}

# ---------------------------------------------------------------------------
# check_and_promote <learnings_file> <archive_file> <conventions_file>
#   learnings.jsonl を分析し、完全一致（type + content の組み合わせ）で
#   3回以上出現するエントリを特定し、conventions.md に昇格する。
#   昇格したエントリを learnings-archive.jsonl に移動する。
# ---------------------------------------------------------------------------
check_and_promote() {
  local learnings_file="$1"
  local archive_file="$2"
  local conventions_file="$3"

  if [ ! -f "${learnings_file}" ]; then
    return 0
  fi

  # type + content の完全一致で3回以上出現するエントリを特定する
  local promoted_entries
  promoted_entries="$(jq -s '[
    group_by(.type + "\u0000" + .content)[] |
    select(length >= 3) |
    {type: .[0].type, content: .[0].content}
  ]' "${learnings_file}")"

  # 昇格するエントリが存在しない場合は終了
  local promoted_count
  promoted_count="$(printf '%s' "${promoted_entries}" | jq 'length')"
  if [ "${promoted_count}" -eq 0 ]; then
    return 0
  fi

  # 昇格するエントリを conventions.md に追記する
  while IFS= read -r entry; do
    local type content
    type="$(printf '%s' "${entry}" | jq -r '.type')"
    content="$(printf '%s' "${entry}" | jq -r '.content')"
    promote_to_conventions "${conventions_file}" "${type}" "${content}"
  done < <(printf '%s' "${promoted_entries}" | jq -c '.[]')

  # conventions.md を整形して書き出す
  # 既存の conventions.md からエントリを読み込み、JSON 配列に変換する
  local all_entries
  all_entries="$(grep '^ENTRY type=' "${conventions_file}" | while IFS= read -r raw_entry; do
    local t c
    # type= の値を抽出する
    t="${raw_entry#*type=}"
    t="${t%% *}"
    # content="..." の値を抽出する
    c="${raw_entry#*content=\"}"
    c="${c%\"}"
    jq -cn --arg type "${t}" --arg content "${c}" '{type: $type, content: $content}'
  done | jq -s '.')"

  build_conventions_md "${conventions_file}" "${all_entries}"

  # 昇格したエントリを learnings.jsonl から削除し archive に移動する
  # （story_id ベースではなく type+content ベースで削除する）
  local tmpfile
  tmpfile="$(mktemp "${TMPDIR:-/tmp}/learnings-update.XXXXXX")"

  while IFS= read -r line; do
    [ -z "${line}" ] && continue
    # 昇格した type+content の組み合わせかどうかを確認する
    local is_promoted
    is_promoted="$(printf '%s' "${line}" | jq -r --argjson promoted "${promoted_entries}" '
      . as $entry |
      if ($promoted | map(select(.type == $entry.type and .content == $entry.content)) | length) > 0
      then "true"
      else "false"
      end
    ')"
    if [ "${is_promoted}" = "true" ]; then
      printf '%s\n' "${line}" >> "${archive_file}"
    else
      printf '%s\n' "${line}" >> "${tmpfile}"
    fi
  done < "${learnings_file}"

  mv "${tmpfile}" "${learnings_file}"
}
