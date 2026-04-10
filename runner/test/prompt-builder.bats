#!/usr/bin/env bats

load "test_helper"

# prompt-builder.sh をロードする
PROMPT_BUILDER_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/prompt-builder.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  cp "${FIXTURES_DIR}/learnings.jsonl" "${TEST_TMPDIR}/learnings.jsonl"
  cp "${FIXTURES_DIR}/conventions.md" "${TEST_TMPDIR}/conventions.md"
  # shellcheck source=/dev/null
  source "${PROMPT_BUILDER_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
  LEARNINGS="${TEST_TMPDIR}/learnings.jsonl"
  CONVENTIONS="${TEST_TMPDIR}/conventions.md"
}

# ---------------------------------------------------------------------------
# build_prompt
# ---------------------------------------------------------------------------

# TC-1: プロンプトにストーリー ID が含まれる
@test "build_prompt: prompt contains the story ID" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"S-001"* ]]
}

# TC-2: プロンプトにストーリーのタイトルが含まれる
@test "build_prompt: prompt contains the story title" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ユーザー登録APIの実装"* ]]
}

# TC-3: プロンプトに AC が箇条書きで含まれる
@test "build_prompt: prompt contains acceptance criteria as bullet list" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"- POST /users でユーザー作成ができる"* ]]
  [[ "$output" == *"- メール重複で 409 Conflict を返す"* ]]
}

# TC-4: プロンプトに conventions.md の内容が全文含まれる
@test "build_prompt: prompt contains full content of conventions.md" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"エンドポイントのパスは kebab-case を使う"* ]]
  [[ "$output" == *"D1 は INSERT OR IGNORE をサポートしない"* ]]
  [[ "$output" == *"Hono の router は \`app.route()\` でマウントする"* ]]
}

# TC-5: プロンプトに関連ストーリーの learnings が含まれる
@test "build_prompt: prompt contains learnings from relevant stories" {
  # S-002 は S-001 に depends_on しているので S-001 の learnings も含まれる
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-002" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Hono の router は app.route() でマウントする"* ]]
  [[ "$output" == *"JWT の秘密鍵は環境変数から取得する"* ]]
}

# TC-6: プロンプトに無関係なストーリーの learnings は含まれない
@test "build_prompt: prompt does not contain learnings from unrelated stories" {
  # S-001 の learnings を取得する。S-002 の learnings (JWT) は含まれないはず
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" != *"JWT の秘密鍵は環境変数から取得する"* ]]
}

# TC-7: プロンプトに completed_steps が含まれる
@test "build_prompt: prompt contains completed_steps" {
  # S-001 に completed_steps を追加してからプロンプトを生成する
  jq '.stories |= map(if .id == "S-001" then .completed_steps = ["tdd", "simplify"] else . end)' \
    "${PLAN}" > "${TEST_TMPDIR}/plan_modified.json"
  run build_prompt "${TEST_TMPDIR}/plan_modified.json" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "code-review"
  [ "$status" -eq 0 ]
  [[ "$output" == *"tdd"* ]]
  [[ "$output" == *"simplify"* ]]
}

# TC-8: プロンプトに正しいスキルコマンドが含まれる
@test "build_prompt: prompt contains correct skill command for tdd step" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/tdd"* ]]
}

# TC-8b: simplify ステップでは /simplify コマンドが含まれる
@test "build_prompt: prompt contains correct skill command for simplify step" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "simplify"
  [ "$status" -eq 0 ]
  [[ "$output" == *"/simplify"* ]]
}

# TC-9: プロンプトに LEARNING 出力指示が含まれる (JSONL フォーマット)
@test "build_prompt: prompt contains LEARNING output instruction" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${CONVENTIONS}" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *'LEARNING: {"type":"pattern","content":"..."}'* ]]
}

# TC-10: conventions.md が存在しない場合もエラーにならない
@test "build_prompt: does not error when conventions.md does not exist" {
  run build_prompt "${PLAN}" "${LEARNINGS}" "${TEST_TMPDIR}/nonexistent-conventions.md" "S-001" "tdd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"(no conventions yet)"* ]]
}
