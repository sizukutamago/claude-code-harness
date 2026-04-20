#!/usr/bin/env bats
# runner/ralph-autonomous/test/test-only-detect.bats

load "helpers"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  source "${BATS_TEST_DIRNAME}/../lib/test-only-detect.sh"
}

# AC-1: 変更ファイルにテスト以外が含まれる -> exit 0 + streak=0
@test "detect_test_only_iter: non-test file changed -> exit 0 and streak=0" {
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"
  state_init "${state_file}"

  # streak を事前に 1 にしておく
  state_increment "${state_file}" "test_only_streak"
  run jq -r '.test_only_streak' "${state_file}"
  [ "${output}" = "1" ]

  FAKE_GIT_STDOUT="src/main.ts
tests/main.test.ts"
  export FAKE_GIT_STDOUT

  run detect_test_only_iter "${RATEST_WORKSPACE}/.ralph/config.json" "${state_file}" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 0 ]

  run jq -r '.test_only_streak' "${state_file}"
  [ "${output}" = "0" ]
}

# AC-2: 変更ファイルがテストのみ -> streak が 1 になる（exit 0）
@test "detect_test_only_iter: only test files changed -> streak incremented to 1" {
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"
  state_init "${state_file}"

  FAKE_GIT_STDOUT="tests/foo.test.ts
src/__tests__/bar.spec.js"
  export FAKE_GIT_STDOUT

  run detect_test_only_iter "${RATEST_WORKSPACE}/.ralph/config.json" "${state_file}" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 0 ]

  run jq -r '.test_only_streak' "${state_file}"
  [ "${output}" = "1" ]
}

# AC-3: streak が閾値を超える -> exit 3
# max_iter=10, test_only_ratio_threshold=0.3 -> 閾値=3
# streak を 3 にした状態でテストのみの変更 -> streak=4 > 3 -> exit 3
@test "detect_test_only_iter: streak exceeds threshold -> exit 3" {
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"
  state_init "${state_file}"

  # streak=3 に設定（閾値ちょうど。次の increment で 4 になり超える）
  state_increment "${state_file}" "test_only_streak"
  state_increment "${state_file}" "test_only_streak"
  state_increment "${state_file}" "test_only_streak"

  FAKE_GIT_STDOUT="tests/foo.test.ts"
  export FAKE_GIT_STDOUT

  run detect_test_only_iter "${RATEST_WORKSPACE}/.ralph/config.json" "${state_file}" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 3 ]
}

# AC-4: 変更なし（git diff が空） -> exit 0
@test "detect_test_only_iter: no changes (empty git diff) -> exit 0" {
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"
  state_init "${state_file}"

  FAKE_GIT_STDOUT=""
  export FAKE_GIT_STDOUT

  run detect_test_only_iter "${RATEST_WORKSPACE}/.ralph/config.json" "${state_file}" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 0 ]
}
