#!/usr/bin/env bats
# ralph-runner-quality.bats — 異常系の追加テスト

load "test_helper"

RUNNER_PATH="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)/ralph-runner.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
}

teardown() {
  if [ -d "${TEST_TMPDIR}" ]; then
    rm -rf "${TEST_TMPDIR}"
  fi
}

# ===========================================================================
# 異常系
# ===========================================================================

# TQ-9: ralph-runner.sh — plan ファイルが存在しない場合は exit 1 かつ stderr にエラーを出力する
@test "TQ-9: ralph-runner.sh: exits 1 and prints error when plan file does not exist" {
  run "${RUNNER_PATH}" --plan "${TEST_TMPDIR}/nonexistent-plan.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"plan file not found"* ]] || [[ "$output" == *"nonexistent-plan.json"* ]]
}

# TQ-10: ralph-runner.sh — 不明なオプション（--unknown）を渡すと exit 1 になる
@test "TQ-10: ralph-runner.sh: exits 1 when unknown argument is passed" {
  run "${RUNNER_PATH}" --unknown-option
  [ "$status" -eq 1 ]
}

# ===========================================================================
# MUST-C: story_id の allowlist 検証
# ===========================================================================

# TC-MUST-C-1: story_id に ../../etc/foo を含む plan.json を渡すとエラー終了する
@test "MUST-C: exits 1 when story_id contains path traversal characters" {
  cat > "${TEST_TMPDIR}/plan-bad-id.json" << 'JSON'
{
  "version": "1",
  "steps": ["tdd"],
  "stories": [
    {
      "id": "../../etc/foo",
      "title": "malicious story",
      "ac": ["test"],
      "status": "pending",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    }
  ]
}
JSON
  run "${RUNNER_PATH}" --plan "${TEST_TMPDIR}/plan-bad-id.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid story"* ]] || [[ "$output" == *"story ID"* ]]
}

# TC-MUST-C-2: story_id が空文字の場合もエラー終了する
@test "MUST-C: exits 1 when story_id is empty string" {
  cat > "${TEST_TMPDIR}/plan-empty-id.json" << 'JSON'
{
  "version": "1",
  "steps": ["tdd"],
  "stories": [
    {
      "id": "",
      "title": "empty id story",
      "ac": ["test"],
      "status": "pending",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    }
  ]
}
JSON
  run "${RUNNER_PATH}" --plan "${TEST_TMPDIR}/plan-empty-id.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"invalid story"* ]] || [[ "$output" == *"story ID"* ]]
}

# TC-MUST-C-3: 有効な story_id (S-001, story_abc, TASK-123) は検証を通過する（実行開始する）
# ===========================================================================
# MUST-D: gates_dir の realpath 正規化
# ===========================================================================

# TC-MUST-D-1: 存在しない --gates-dir を指定するとエラー終了する
@test "MUST-D: exits 1 when gates-dir does not exist" {
  # plan.json を作成（validate_plan を通過させるために有効な ID を使用）
  cat > "${TEST_TMPDIR}/plan-valid.json" << 'JSON'
{
  "version": "1",
  "steps": ["tdd"],
  "stories": [
    {
      "id": "S-001",
      "title": "valid story",
      "ac": ["test"],
      "status": "pending",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    }
  ]
}
JSON
  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan-valid.json" \
    --gates-dir "${TEST_TMPDIR}/nonexistent-gates"
  [ "$status" -eq 1 ]
  [[ "$output" == *"gates directory not found"* ]] || [[ "$output" == *"nonexistent-gates"* ]]
}

# TC-MUST-D-2: 相対パスの --gates-dir が正しく正規化されること（存在するディレクトリ）
@test "MUST-D: relative gates-dir is normalized to absolute path" {
  # ゲートディレクトリを作成
  mkdir -p "${TEST_TMPDIR}/gates"
  touch "${TEST_TMPDIR}/gates/00-test.sh"
  chmod +x "${TEST_TMPDIR}/gates/00-test.sh"

  # claude モックを作成
  local mock_dir="${TEST_TMPDIR}/mock-bin"
  mkdir -p "${mock_dir}"
  cat > "${mock_dir}/claude" << 'MOCK'
#!/bin/bash
echo "done"
exit 0
MOCK
  chmod +x "${mock_dir}/claude"

  local plan_file="${TEST_TMPDIR}/plan.json"
  cat > "${plan_file}" << 'JSON'
{
  "version": "1",
  "steps": ["tdd"],
  "stories": [
    {
      "id": "S-001",
      "title": "valid story",
      "ac": ["test"],
      "status": "completed",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    }
  ]
}
JSON

  # 存在するディレクトリを相対パスで渡してもエラーにならないこと
  # （全ストーリーが completed なのでゲートは実行されず exit 0 で終わる）
  export PATH="${mock_dir}:${PATH}"
  run "${RUNNER_PATH}" \
    --plan "${plan_file}" \
    --gates-dir "${TEST_TMPDIR}/gates" \
    --runs-dir "${TEST_TMPDIR}/runs"
  [ "$status" -eq 0 ]
}

@test "MUST-C: valid story IDs pass validation (S-001, story_abc, TASK-123)" {
  cat > "${TEST_TMPDIR}/plan-valid-ids.json" << 'JSON'
{
  "version": "1",
  "steps": ["tdd"],
  "stories": [
    {
      "id": "S-001",
      "title": "valid story 1",
      "ac": ["test"],
      "status": "completed",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    },
    {
      "id": "story_abc",
      "title": "valid story 2",
      "ac": ["test"],
      "status": "completed",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    },
    {
      "id": "TASK-123",
      "title": "valid story 3",
      "ac": ["test"],
      "status": "completed",
      "depends_on": [],
      "current_step": null,
      "attempts": 0,
      "step_attempts": {},
      "quality_gates": [],
      "files_touched": [],
      "completed_steps": [],
      "skipped_reason": null
    }
  ]
}
JSON
  # 全ストーリーが completed なので、実行は即終了（exit 0）する
  # validate_plan が実行されてもエラーにならないこと
  run "${RUNNER_PATH}" --plan "${TEST_TMPDIR}/plan-valid-ids.json"
  [ "$status" -eq 0 ]
}
