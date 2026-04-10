#!/usr/bin/env bats

load "test_helper"

# conventions-builder.sh をロードする
CONVENTIONS_BUILDER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/conventions-builder.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  # shellcheck source=/dev/null
  source "${CONVENTIONS_BUILDER_PATH}"
  LEARNINGS="${TEST_TMPDIR}/learnings.jsonl"
  ARCHIVE="${TEST_TMPDIR}/learnings-archive.jsonl"
  CONVENTIONS="${TEST_TMPDIR}/conventions.md"
}

# ---------------------------------------------------------------------------
# AC-1: check_and_promote — 3回以上出現するエントリが conventions.md に昇格する
# ---------------------------------------------------------------------------
@test "check_and_promote: entries appearing 3+ times are promoted to conventions.md" {
  # type=pattern content="Hono のルーター" が3回出現
  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"Hono のルーター"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"pattern","content":"Hono のルーター"}' \
    '{"date":"2026-04-03","story":"S-003","step":"tdd","type":"pattern","content":"Hono のルーター"}' \
    > "${LEARNINGS}"

  check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"

  run grep -F "Hono のルーター" "${CONVENTIONS}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-2: check_and_promote — 3回未満のエントリは昇格しない
# ---------------------------------------------------------------------------
@test "check_and_promote: entries appearing fewer than 3 times are not promoted" {
  # 2回しか出現しないエントリ
  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"2回だけのエントリ"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"pattern","content":"2回だけのエントリ"}' \
    > "${LEARNINGS}"

  check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"

  # conventions.md が存在しないか、エントリが含まれていない
  if [ -f "${CONVENTIONS}" ]; then
    run grep -F "2回だけのエントリ" "${CONVENTIONS}"
    [ "$status" -ne 0 ]
  fi
}

# ---------------------------------------------------------------------------
# AC-3: check_and_promote — 昇格したエントリは learnings.jsonl から削除され archive に移動する
# ---------------------------------------------------------------------------
@test "check_and_promote: promoted entries are removed from learnings and moved to archive" {
  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"昇格するエントリ"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"pattern","content":"昇格するエントリ"}' \
    '{"date":"2026-04-03","story":"S-003","step":"tdd","type":"pattern","content":"昇格するエントリ"}' \
    > "${LEARNINGS}"

  check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"

  # learnings.jsonl から削除されている
  run grep -F "昇格するエントリ" "${LEARNINGS}"
  [ "$status" -ne 0 ]

  # archive に移動している
  run grep -F "昇格するエントリ" "${ARCHIVE}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-4: check_and_promote — 昇格していないエントリは learnings.jsonl に残る
# ---------------------------------------------------------------------------
@test "check_and_promote: non-promoted entries remain in learnings.jsonl" {
  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"昇格するエントリ"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"pattern","content":"昇格するエントリ"}' \
    '{"date":"2026-04-03","story":"S-003","step":"tdd","type":"pattern","content":"昇格するエントリ"}' \
    '{"date":"2026-04-04","story":"S-004","step":"tdd","type":"gotcha","content":"残るエントリ"}' \
    > "${LEARNINGS}"

  check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"

  # 残るエントリは learnings.jsonl に存在する
  run grep -F "残るエントリ" "${LEARNINGS}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-5: promote_to_conventions — conventions.md にエントリが追記される
# ---------------------------------------------------------------------------
@test "promote_to_conventions: appends entry to conventions.md" {
  promote_to_conventions "${CONVENTIONS}" "pattern" "新しい規約エントリ"

  run grep -F "新しい規約エントリ" "${CONVENTIONS}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-6: promote_to_conventions — 同じ content を2回追加しても重複しない（冪等）
# ---------------------------------------------------------------------------
@test "promote_to_conventions: adding same content twice does not duplicate (idempotent)" {
  promote_to_conventions "${CONVENTIONS}" "pattern" "重複しないエントリ"
  promote_to_conventions "${CONVENTIONS}" "pattern" "重複しないエントリ"

  run grep -c "重複しないエントリ" "${CONVENTIONS}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]
}

# ---------------------------------------------------------------------------
# AC-7: build_conventions_md — type 別にカテゴリ分けされる
# ---------------------------------------------------------------------------
@test "build_conventions_md: categorizes entries by type" {
  local entries_json='[{"type":"pattern","content":"パターン内容"},{"type":"gotcha","content":"落とし穴内容"},{"type":"fix","content":"修正内容"}]'

  build_conventions_md "${CONVENTIONS}" "${entries_json}"

  run grep -F "## pattern" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  run grep -F "## gotcha" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  run grep -F "## fix" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  run grep -F "パターン内容" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  run grep -F "落とし穴内容" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  run grep -F "修正内容" "${CONVENTIONS}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-8: build_conventions_md — ヘッダーが正しく生成される
# ---------------------------------------------------------------------------
@test "build_conventions_md: generates correct header" {
  local entries_json='[{"type":"pattern","content":"テスト内容"}]'

  build_conventions_md "${CONVENTIONS}" "${entries_json}"

  run head -1 "${CONVENTIONS}"
  [ "$status" -eq 0 ]
  [ "$output" = "# Project Conventions (auto-generated from learnings)" ]
}

# ---------------------------------------------------------------------------
# AC-9: conventions.md が初期状態（空 or 不在）から正しく生成される
# ---------------------------------------------------------------------------
@test "conventions.md is correctly generated from empty/absent state" {
  # conventions.md が存在しない状態
  [ ! -f "${CONVENTIONS}" ]

  printf '%s\n' \
    '{"date":"2026-04-01","story":"S-001","step":"tdd","type":"pattern","content":"初回生成エントリ"}' \
    '{"date":"2026-04-02","story":"S-002","step":"tdd","type":"pattern","content":"初回生成エントリ"}' \
    '{"date":"2026-04-03","story":"S-003","step":"tdd","type":"pattern","content":"初回生成エントリ"}' \
    > "${LEARNINGS}"

  check_and_promote "${LEARNINGS}" "${ARCHIVE}" "${CONVENTIONS}"

  run [ -f "${CONVENTIONS}" ]
  [ "$status" -eq 0 ]

  run grep -F "# Project Conventions (auto-generated from learnings)" "${CONVENTIONS}"
  [ "$status" -eq 0 ]

  run grep -F "初回生成エントリ" "${CONVENTIONS}"
  [ "$status" -eq 0 ]
}
