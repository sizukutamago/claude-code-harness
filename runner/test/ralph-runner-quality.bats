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
