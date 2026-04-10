#!/usr/bin/env bash
# state-manager.sh — plan.json の基本的な読み書き関数
# source で読み込む前提。直接実行しない。

# ---------------------------------------------------------------------------
# next_ready_story <plan_file>
#   plan.json を読み、status が "pending" かつ depends_on の全ストーリーが
#   "completed" であるストーリーの id を返す。
#   複数候補がある場合は配列順で最初のものを返す。
#   該当なしの場合は空文字を返す。
# ---------------------------------------------------------------------------
next_ready_story() {
  local plan_file="$1"
  jq -r '
    .stories as $all |
    .stories[] |
    . as $story |
    select(
      $story.status == "pending" and
      (
        $story.depends_on | length == 0 or
        (
          $story.depends_on | all(. as $dep |
            ($all | map(select(.id == $dep)) | .[0] | .status) == "completed"
          )
        )
      )
    ) |
    $story.id
  ' "${plan_file}" 2>/dev/null | head -n1 || true
}

# ---------------------------------------------------------------------------
# _jq_update_plan <plan_file> <jq_filter> [jq_args...]
#   plan.json を jq フィルターで更新し、tmpfile 経由で上書きする。
#   jq_args には --arg / --argjson 等を渡せる。ユーザー入力値は必ず
#   --arg 経由で渡して jq 構文インジェクションを防ぐこと。
# ---------------------------------------------------------------------------
_jq_update_plan() {
  local plan_file="$1"
  local jq_filter="$2"
  shift 2
  local tmpfile
  tmpfile="$(mktemp "${TMPDIR:-/tmp}/plan-update.XXXXXX")"
  jq "$@" "${jq_filter}" "${plan_file}" > "${tmpfile}" && mv "${tmpfile}" "${plan_file}"
}

# ---------------------------------------------------------------------------
# update_status <plan_file> <story_id> <new_status>
#   指定ストーリーの status フィールドを更新する。
#   有効なステータス: pending, in_progress, completed, failed, skipped
# ---------------------------------------------------------------------------
update_status() {
  local plan_file="$1"
  local story_id="$2"
  local new_status="$3"
  _jq_update_plan "${plan_file}" \
    '.stories |= map(if .id == $sid then .status = $val else . end)' \
    --arg sid "${story_id}" --arg val "${new_status}"
}

# ---------------------------------------------------------------------------
# update_current_step <plan_file> <story_id> <step>
#   指定ストーリーの current_step フィールドを更新する。
# ---------------------------------------------------------------------------
update_current_step() {
  local plan_file="$1"
  local story_id="$2"
  local step="$3"
  _jq_update_plan "${plan_file}" \
    '.stories |= map(if .id == $sid then .current_step = $val else . end)' \
    --arg sid "${story_id}" --arg val "${step}"
}

# ---------------------------------------------------------------------------
# add_completed_step <plan_file> <story_id> <step>
#   指定ストーリーの completed_steps 配列にステップを追加する。
#   既に含まれている場合は追加しない（冪等）。
# ---------------------------------------------------------------------------
add_completed_step() {
  local plan_file="$1"
  local story_id="$2"
  local step="$3"
  _jq_update_plan "${plan_file}" \
    '.stories |= map(
      if .id == $sid
      then .completed_steps |= (if index($val) then . else . + [$val] end)
      else .
      end
    )' \
    --arg sid "${story_id}" --arg val "${step}"
}

# ---------------------------------------------------------------------------
# increment_step_attempts <plan_file> <story_id> <step>
#   指定ストーリーの step_attempts オブジェクトの該当ステップを +1 する。
#   attempts フィールド（ストーリー全体の累計）も +1 する。
# ---------------------------------------------------------------------------
increment_step_attempts() {
  local plan_file="$1"
  local story_id="$2"
  local step="$3"
  _jq_update_plan "${plan_file}" \
    '.stories |= map(
      if .id == $sid
      then (.step_attempts[$val] |= (. // 0) + 1) | (.attempts |= . + 1)
      else .
      end
    )' \
    --arg sid "${story_id}" --arg val "${step}"
}

# ---------------------------------------------------------------------------
# record_skip_reason <plan_file> <story_id> <reason>
#   指定ストーリーの skipped_reason フィールドに理由を記録する。
# ---------------------------------------------------------------------------
record_skip_reason() {
  local plan_file="$1"
  local story_id="$2"
  local reason="$3"
  _jq_update_plan "${plan_file}" \
    '.stories |= map(if .id == $sid then .skipped_reason = $val else . end)' \
    --arg sid "${story_id}" --arg val "${reason}"
}

# ---------------------------------------------------------------------------
# skip_dependents <plan_file> <story_id>
#   指定ストーリーに依存する全ストーリーを再帰的に skipped にする。
#   依存チェーン: A が failed → B (depends_on A) が skipped → C (depends_on B) も skipped
#   skipped_reason に「Dependency S-XXX failed/skipped」を記録する。
# ---------------------------------------------------------------------------
skip_dependents() {
  local plan_file="$1"
  local story_id="$2"

  # 変化がなくなるまでループして再帰的な依存を解決する
  local changed=1
  while [ "${changed}" -eq 1 ]; do
    changed=0
    # pending または in_progress のストーリーのうち、failed または skipped な
    # ストーリーに depends_on しているものを skipped に更新する
    local to_skip
    to_skip=$(jq -r '
      .stories as $all |
      .stories[] |
      . as $story |
      select(
        ($story.status == "pending" or $story.status == "in_progress") and
        (
          $story.depends_on | any(. as $dep |
            ($all | map(select(.id == $dep)) | .[0] | .status) == "failed" or
            ($all | map(select(.id == $dep)) | .[0] | .status) == "skipped"
          )
        )
      ) |
      # 依存先の failed/skipped なストーリー ID を付けて出力
      [$story.id, (
        $story.depends_on[] |
        . as $dep |
        if ($all | map(select(.id == $dep)) | .[0] | .status) == "failed" or
           ($all | map(select(.id == $dep)) | .[0] | .status) == "skipped"
        then $dep
        else empty
        end
      )] | @tsv
    ' "${plan_file}" 2>/dev/null || true)

    if [ -n "${to_skip}" ]; then
      while IFS=$'\t' read -r sid dep_id; do
        [ -z "${sid}" ] && continue
        # 依存先のステータスを取得して理由文を作る
        local dep_status
        dep_status=$(jq -r --arg d "${dep_id}" '.stories[] | select(.id==$d) | .status' "${plan_file}")
        local reason="Dependency ${dep_id} ${dep_status}"
        update_status "${plan_file}" "${sid}" "skipped"
        record_skip_reason "${plan_file}" "${sid}" "${reason}"
        changed=1
      done <<< "${to_skip}"
    fi
  done
}

# ---------------------------------------------------------------------------
# record_learning <learnings_file> <story_id> <step> <type> <content>
#   learnings.jsonl に1行 JSONL 形式で追記する。
#   フォーマット: {"date":"YYYY-MM-DD","story":"S-001","step":"tdd","type":"pattern","content":"..."}
# ---------------------------------------------------------------------------
record_learning() {
  local learnings_file="$1"
  local story_id="$2"
  local step="$3"
  local type="$4"
  local content="$5"
  local date
  date="$(date +%Y-%m-%d)"
  printf '%s\n' "$(jq -cn \
    --arg date "${date}" \
    --arg story "${story_id}" \
    --arg step "${step}" \
    --arg type "${type}" \
    --arg content "${content}" \
    '{date: $date, story: $story, step: $step, type: $type, content: $content}')" \
    >> "${learnings_file}"
}

# ---------------------------------------------------------------------------
# extract_learnings <output_text> <learnings_file> <story_id> <step>
#   テキストから "LEARNING: type=XXX content="YYY"" 形式の行を抽出して
#   record_learning で learnings_file に追記する。
#   フォーマットに合わない行はスキップする（エラーにしない）。
# ---------------------------------------------------------------------------
extract_learnings() {
  local output_text="$1"
  local learnings_file="$2"
  local story_id="$3"
  local step="$4"

  while IFS= read -r line; do
    # "LEARNING: " で始まる行のみ処理する
    if [[ "${line}" != LEARNING:* ]]; then
      continue
    fi

    # "LEARNING: " プレフィックスを除去する
    local payload="${line#LEARNING: }"

    # type=XXX を抽出する（空でないこと）
    local type=""
    if [[ "${payload}" =~ type=([^[:space:]]+) ]]; then
      type="${BASH_REMATCH[1]}"
    fi

    # content="YYY" を抽出する
    local content=""
    if [[ "${payload}" =~ content=\"([^\"]*)\" ]]; then
      content="${BASH_REMATCH[1]}"
    fi

    # type が空の場合はスキップする
    if [ -z "${type}" ]; then
      continue
    fi

    # content が取得できなかった場合はスキップする
    if [ -z "${content}" ] && [[ "${payload}" != *'content=""'* ]]; then
      continue
    fi

    record_learning "${learnings_file}" "${story_id}" "${step}" "${type}" "${content}"
  done <<< "${output_text}"
}

# ---------------------------------------------------------------------------
# get_learnings_for_story <learnings_file> <plan_file> <story_id>
#   指定ストーリー + depends_on で指定された依存ストーリーの learnings を抽出し、
#   各エントリの content を改行区切りで stdout に出力する。
# ---------------------------------------------------------------------------
get_learnings_for_story() {
  local learnings_file="$1"
  local plan_file="$2"
  local story_id="$3"

  # plan.json から依存チェーンを再帰的に解決してストーリー ID のリストを作る
  local story_ids
  story_ids="$(jq -r \
    --arg sid "${story_id}" \
    '
      # 指定ストーリーの depends_on を再帰的にたどって全祖先を収集する
      . as $plan |
      def ancestors($id):
        ($plan.stories[] | select(.id == $id) | .depends_on) as $deps |
        if ($deps | length) == 0
        then []
        else $deps + [$deps[] | ancestors(.)[]]
        end;
      [$sid] + ancestors($sid) | unique | .[]
    ' "${plan_file}" 2>/dev/null || true)"

  if [ -z "${learnings_file}" ] || [ ! -f "${learnings_file}" ]; then
    return 0
  fi

  # 収集したストーリー ID に一致するエントリの content を出力する
  while IFS= read -r sid; do
    [ -z "${sid}" ] && continue
    jq -r --arg sid "${sid}" \
      'select(.story == $sid) | .content' "${learnings_file}" 2>/dev/null || true
  done <<< "${story_ids}"
}

# ---------------------------------------------------------------------------
# archive_learnings <learnings_file> <archive_file> <story_id>
#   指定ストーリーの全エントリを learnings_file から削除し、
#   archive_file に移動する。
# ---------------------------------------------------------------------------
archive_learnings() {
  local learnings_file="$1"
  local archive_file="$2"
  local story_id="$3"

  if [ ! -f "${learnings_file}" ]; then
    return 0
  fi

  local tmpfile
  tmpfile="$(mktemp "${TMPDIR:-/tmp}/learnings-update.XXXXXX")"

  # 1回の jq 呼び出しで該当エントリを archive に追記し、
  # もう1回の jq 呼び出しで残りを tmpfile に書き出す。
  jq -c --arg sid "${story_id}" 'select(.story == $sid)' "${learnings_file}" >> "${archive_file}"
  jq -c --arg sid "${story_id}" 'select(.story != $sid)' "${learnings_file}" > "${tmpfile}"

  mv "${tmpfile}" "${learnings_file}"
}

# ---------------------------------------------------------------------------
# generate_summary <plan_file> <run_id>
#   ラン全体のサマリ JSON を生成して stdout に出力する。
# ---------------------------------------------------------------------------
generate_summary() {
  local plan_file="$1"
  local run_id="$2"
  local completed_at
  completed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  jq -r \
    --arg run_id "${run_id}" \
    --arg completed_at "${completed_at}" \
    '{
      run_id: $run_id,
      completed_at: $completed_at,
      total: (.stories | length),
      completed: (.stories | map(select(.status == "completed")) | length),
      failed: (.stories | map(select(.status == "failed")) | length),
      skipped: (.stories | map(select(.status == "skipped")) | length),
      stories: [.stories[] | {id, status, completed_steps, attempts}]
    }' "${plan_file}"
}
