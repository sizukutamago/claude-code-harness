#!/usr/bin/env bats

load "test_helper"

# state-manager.sh をロードする
STATE_MANAGER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/state-manager.sh"

setup() {
  # TEST_TMPDIR 作成
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  # shellcheck source=/dev/null
  source "${STATE_MANAGER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
  LEARNINGS="${TEST_TMPDIR}/learnings.jsonl"
  ARCHIVE="${TEST_TMPDIR}/learnings-archive.jsonl"
}

# ---------------------------------------------------------------------------
# record_learning
# ---------------------------------------------------------------------------

# AC-1: learnings.jsonl に正しい JSONL 形式で追記される
@test "record_learning: appends a valid JSONL entry to learnings file" {
  record_learning "${LEARNINGS}" "S-001" "tdd" "pattern" "Hono の router は app.route() でマウントする"

  run jq -r '.story' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" = "S-001" ]

  run jq -r '.step' "${LEARNINGS}"
  [ "$output" = "tdd" ]

  run jq -r '.type' "${LEARNINGS}"
  [ "$output" = "pattern" ]

  run jq -r '.content' "${LEARNINGS}"
  [ "$output" = "Hono の router は app.route() でマウントする" ]
}

# AC-2: date フィールドが自動生成される
@test "record_learning: auto-generates date field in YYYY-MM-DD format" {
  record_learning "${LEARNINGS}" "S-001" "tdd" "pattern" "test content"

  run jq -r '.date' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  # YYYY-MM-DD フォーマットの検証
  [[ "$output" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

# ---------------------------------------------------------------------------
# extract_learnings
# ---------------------------------------------------------------------------

# AC-3: LEARNING: 行が正しく抽出される (JSONL フォーマット)
@test "extract_learnings: extracts LEARNING lines from output text" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' \
    'Some output text' \
    'LEARNING: {"type":"pattern","content":"Hono の router は app.route() でマウントする"}' \
    'More output text' \
    > "${log_file}"

  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"

  run wc -l < "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  run jq -r '.content' "${LEARNINGS}"
  [ "$output" = "Hono の router は app.route() でマウントする" ]
}

# AC-4: type=pattern と type=gotcha の両方が抽出される (JSONL フォーマット)
@test "extract_learnings: extracts both type=pattern and type=gotcha entries" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' \
    'LEARNING: {"type":"pattern","content":"パターンの学習"}' \
    'LEARNING: {"type":"gotcha","content":"落とし穴の学習"}' \
    > "${log_file}"

  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"

  run wc -l < "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 2 ]

  run jq -r '.type' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"pattern"* ]]
  [[ "$output" == *"gotcha"* ]]
}

# AC-5: LEARNING: フォーマットに合わない行はスキップされる (JSONL フォーマット)
@test "extract_learnings: skips lines that do not match the LEARNING format" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' \
    'LEARNING: invalid format without json' \
    'LEARNING: {"type":"pattern","content":"有効なエントリ"}' \
    'LEARNING: {"type":"","content":"type が空"}' \
    > "${log_file}"

  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"

  run wc -l < "${LEARNINGS}"
  [ "$status" -eq 0 ]
  # フォーマットに合う行だけが追記される
  [ "$output" -eq 1 ]

  run jq -r '.content' "${LEARNINGS}"
  [ "$output" = "有効なエントリ" ]
}

# AC-5b: content に " を含む LEARNING は正しく抽出される (JSONL の利点)
@test "extract_learnings: correctly extracts LEARNING with double-quote in content" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' 'LEARNING: {"type":"pattern","content":"use \"const\" instead of \"let\""}' \
    > "${log_file}"

  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"

  run wc -l < "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  run jq -r '.content' "${LEARNINGS}"
  [ "$output" = 'use "const" instead of "let"' ]
}

# AC-5c: type が pattern/gotcha/fix 以外の場合はスキップされる
@test "extract_learnings: skips LEARNING with invalid type" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' \
    'LEARNING: {"type":"invalid_type","content":"有効なコンテンツ"}' \
    'LEARNING: {"type":"pattern","content":"有効なエントリ"}' \
    > "${log_file}"

  extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"

  run wc -l < "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  run jq -r '.content' "${LEARNINGS}"
  [ "$output" = "有効なエントリ" ]
}

# AC-6: LEARNING: 行がない場合もエラーにならない
@test "extract_learnings: does not error when no LEARNING lines exist" {
  local log_file="${TEST_TMPDIR}/test.log"
  printf '%s\n' \
    'Some output text without any LEARNING lines' \
    'Just normal output' \
    > "${log_file}"

  run extract_learnings "${log_file}" "${LEARNINGS}" "S-001" "tdd"
  [ "$status" -eq 0 ]

  # ファイルが作成されないか空である
  if [ -f "${LEARNINGS}" ]; then
    run wc -l < "${LEARNINGS}"
    [ "$output" -eq 0 ]
  fi
}

# ---------------------------------------------------------------------------
# get_learnings_for_story
# ---------------------------------------------------------------------------

# AC-7: 指定ストーリーの learnings が返される
@test "get_learnings_for_story: returns learnings for the specified story" {
  cp "${FIXTURES_DIR}/learnings.jsonl" "${LEARNINGS}"

  run get_learnings_for_story "${LEARNINGS}" "${PLAN}" "S-002"
  [ "$status" -eq 0 ]
  [[ "$output" == *"JWT の秘密鍵は環境変数から取得する"* ]]
}

# AC-8: 依存ストーリーの learnings も含まれる
@test "get_learnings_for_story: also includes learnings from dependent stories" {
  cp "${FIXTURES_DIR}/learnings.jsonl" "${LEARNINGS}"

  # S-002 は S-001 に depends_on している
  # S-001 の learnings も含まれるはず
  run get_learnings_for_story "${LEARNINGS}" "${PLAN}" "S-002"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Hono の router は app.route() でマウントする"* ]]
}

# AC-9: 無関係なストーリーの learnings は含まれない
@test "get_learnings_for_story: does not include learnings from unrelated stories" {
  # ここでは S-001 のみの learnings を取得し、S-002 の learnings が含まれないことを確認
  cp "${FIXTURES_DIR}/learnings.jsonl" "${LEARNINGS}"

  run get_learnings_for_story "${LEARNINGS}" "${PLAN}" "S-001"
  [ "$status" -eq 0 ]
  # S-002 の learnings (JWT の秘密鍵) は含まれない
  [[ "$output" != *"JWT の秘密鍵は環境変数から取得する"* ]]
}

# ---------------------------------------------------------------------------
# archive_learnings
# ---------------------------------------------------------------------------

# AC-10: 指定ストーリーのエントリが archive に移動する
@test "archive_learnings: moves specified story entries to archive file" {
  cp "${FIXTURES_DIR}/learnings.jsonl" "${LEARNINGS}"

  archive_learnings "${LEARNINGS}" "${ARCHIVE}" "S-001"

  # archive に S-001 のエントリが存在する
  run jq -r '.story' "${ARCHIVE}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"S-001"* ]]
}

# AC-11: 他のストーリーのエントリは learnings.jsonl に残る
@test "archive_learnings: leaves other story entries in learnings file" {
  cp "${FIXTURES_DIR}/learnings.jsonl" "${LEARNINGS}"

  archive_learnings "${LEARNINGS}" "${ARCHIVE}" "S-001"

  # learnings.jsonl に S-002 のエントリが残っている
  run jq -r '.story' "${LEARNINGS}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"S-002"* ]]

  # learnings.jsonl に S-001 のエントリが残っていない
  [[ "$output" != *"S-001"* ]]
}
