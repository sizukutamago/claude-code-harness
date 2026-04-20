#!/usr/bin/env bats
# runner/ralph-autonomous/test/state.bats

load "helpers"

setup() {
  ralph_autonomous_setup_tmp_workspace
}

# AC-1: state_init - ファイル不在時に初期 state.json を作成
@test "state_init creates initial state.json when not present" {
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"

  ralph_autonomous_assert_file_missing "${state_file}"
  state_init "${state_file}"

  [ -f "${state_file}" ]
  run jq -r '.iter' "${state_file}"
  [ "${output}" = "0" ]
  run jq -r '.consecutive_failures' "${state_file}"
  [ "${output}" = "0" ]
  run jq -r '.no_progress_streak' "${state_file}"
  [ "${output}" = "0" ]
  run jq -r '.same_error_streak' "${state_file}"
  [ "${output}" = "0" ]
  run jq -r '.last_error_hash' "${state_file}"
  [ "${output}" = "" ]
  run jq -r '.test_only_streak' "${state_file}"
  [ "${output}" = "0" ]
  run jq -c '.checkpoint_tags' "${state_file}"
  [ "${output}" = "[]" ]
}

# AC-2: state_init - ファイル存在時は上書きしない（idempotent）
@test "state_init does not overwrite existing state.json" {
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"

  # 事前に iter=5 の state.json を作成
  cat > "${state_file}" <<'JSON'
{
  "iter": 5,
  "consecutive_failures": 2,
  "no_progress_streak": 0,
  "same_error_streak": 0,
  "last_error_hash": "",
  "test_only_streak": 0,
  "checkpoint_tags": []
}
JSON

  state_init "${state_file}"

  run jq -r '.iter' "${state_file}"
  [ "${output}" = "5" ]
  run jq -r '.consecutive_failures' "${state_file}"
  [ "${output}" = "2" ]
}

# AC-3: state_read - iter フィールドを読み取る
@test "state_read returns iter field value" {
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"

  state_init "${state_file}"
  run state_read "${state_file}" "iter"
  [ "${status}" -eq 0 ]
  [ "${output}" = "0" ]
}

# AC-4: state_increment - consecutive_failures を +1 する
@test "state_increment increments consecutive_failures" {
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"

  state_init "${state_file}"
  state_increment "${state_file}" "consecutive_failures"

  run state_read "${state_file}" "consecutive_failures"
  [ "${output}" = "1" ]

  state_increment "${state_file}" "consecutive_failures"
  run state_read "${state_file}" "consecutive_failures"
  [ "${output}" = "2" ]
}

# AC-5: state_reset_failure - consecutive_failures を 0 にリセット
@test "state_reset_failure resets consecutive_failures to 0" {
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"

  state_init "${state_file}"
  state_increment "${state_file}" "consecutive_failures"
  state_increment "${state_file}" "consecutive_failures"
  state_increment "${state_file}" "consecutive_failures"

  run state_read "${state_file}" "consecutive_failures"
  [ "${output}" = "3" ]

  state_reset_failure "${state_file}"

  run state_read "${state_file}" "consecutive_failures"
  [ "${output}" = "0" ]
}

# AC-6: state_push_checkpoint_tag - checkpoint_tags 配列に追加
@test "state_push_checkpoint_tag appends tag to checkpoint_tags" {
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"

  state_init "${state_file}"
  state_push_checkpoint_tag "${state_file}" "iter-1-green"
  state_push_checkpoint_tag "${state_file}" "iter-2-green"

  run jq -r '.checkpoint_tags[0]' "${state_file}"
  [ "${output}" = "iter-1-green" ]
  run jq -r '.checkpoint_tags[1]' "${state_file}"
  [ "${output}" = "iter-2-green" ]
  run jq '.checkpoint_tags | length' "${state_file}"
  [ "${output}" = "2" ]
}
