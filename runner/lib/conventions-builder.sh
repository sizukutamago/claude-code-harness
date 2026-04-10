#!/usr/bin/env bash
# conventions-builder.sh — learnings.jsonl を分析し、繰り返し出現するパターンを
# conventions.md に昇格させる。
# source で読み込む前提。直接実行しない。

# state-manager.sh を source する（archive_learnings を使うため）
_CONVENTIONS_BUILDER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${_CONVENTIONS_BUILDER_DIR}/state-manager.sh"

# ---------------------------------------------------------------------------
# _conventions_state_file <conventions_file>
#   conventions_file と同じディレクトリの conventions-state.jsonl パスを返す。
# ---------------------------------------------------------------------------
_conventions_state_file() {
  local conventions_file="$1"
  printf '%s/conventions-state.jsonl' "$(dirname "${conventions_file}")"
}

# ---------------------------------------------------------------------------
# promote_to_conventions <conventions_file> <type> <content>
#   conventions-state.jsonl にエントリを追記する（重複チェックあり）。
#   既に同じ type + content が存在する場合は追加しない（冪等）。
# ---------------------------------------------------------------------------
promote_to_conventions() {
  local conventions_file="$1"
  local type="$2"
  local content="$3"

  local state_file
  state_file="$(_conventions_state_file "${conventions_file}")"

  # 既に同じ type + content が存在する場合はスキップ（冪等）
  if [ -f "${state_file}" ]; then
    local exists
    exists="$(jq -r \
      --arg type "${type}" \
      --arg content "${content}" \
      'select(.type == $type and .content == $content) | "found"' \
      "${state_file}" | head -1)"
    if [ "${exists}" = "found" ]; then
      return 0
    fi
  fi

  # conventions-state.jsonl に JSONL で追記する
  jq -cn --arg type "${type}" --arg content "${content}" \
    '{type: $type, content: $content}' >> "${state_file}"
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

  # 昇格するエントリを conventions-state.jsonl に追記する（重複チェックあり）
  while IFS= read -r entry; do
    local type content
    type="$(printf '%s' "${entry}" | jq -r '.type')"
    content="$(printf '%s' "${entry}" | jq -r '.content')"
    promote_to_conventions "${conventions_file}" "${type}" "${content}"
  done < <(printf '%s' "${promoted_entries}" | jq -c '.[]')

  # conventions-state.jsonl 全体を読んで conventions.md を再生成する（全エントリが保持される）
  local state_file
  state_file="$(_conventions_state_file "${conventions_file}")"
  local all_entries
  all_entries="$(jq -s '.' "${state_file}")"
  build_conventions_md "${conventions_file}" "${all_entries}"

  # 昇格したエントリを learnings.jsonl から削除し archive に移動する。
  # type+content ベースで振り分ける（story_id は使わない）。
  local tmpfile
  tmpfile="$(mktemp "${TMPDIR:-/tmp}/learnings-update.XXXXXX")"

  # 昇格対象は archive に追記、それ以外は tmpfile に残す。
  # 各エントリを1回の jq 呼び出しで振り分ける（N+1 を避ける）。
  jq -c --argjson promoted "${promoted_entries}" '
    . as $entry |
    select($promoted | any(.type == $entry.type and .content == $entry.content))
  ' "${learnings_file}" >> "${archive_file}"

  jq -c --argjson promoted "${promoted_entries}" '
    . as $entry |
    select(($promoted | any(.type == $entry.type and .content == $entry.content)) | not)
  ' "${learnings_file}" > "${tmpfile}"

  mv "${tmpfile}" "${learnings_file}"
}
