#!/usr/bin/env bats
# runner/meta-loop/test/state.bats
# Tests for runner/meta-loop/lib/state.sh

load "helpers"

STATE_LIB="${BATS_TEST_DIRNAME}/../lib/state.sh"

setup() {
  meta_loop_setup_tmp_workspace
  # shellcheck source=../lib/state.sh
  source "${STATE_LIB}"
  STATE_FILE="${MLTEST_WORKSPACE}/.meta-loop-state"
}

# ---------------------------------------------------------------------------
# TC-1: state_read — 初期値（ファイル不在 or キー不在）で 0
# ---------------------------------------------------------------------------

@test "state_read: returns 0 when state file does not exist" {
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "state_read: returns 0 when key is absent from existing file" {
  echo "other_key=hello" > "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "state_read: returns value when key exists" {
  echo "consecutive_failures=3" > "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$status" -eq 0 ]
  [ "$output" = "3" ]
}

@test "state_read: ignores comment lines" {
  printf "# this is a comment\nconsecutive_failures=5\n" > "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$status" -eq 0 ]
  [ "$output" = "5" ]
}

@test "state_read: ignores empty lines" {
  printf "\nconsecutive_failures=2\n\n" > "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

# ---------------------------------------------------------------------------
# TC-2: state_increment_failure — 0→1→2→3 と増える
# ---------------------------------------------------------------------------

@test "state_increment_failure: creates file with consecutive_failures=1 when file absent" {
  [ ! -f "${STATE_FILE}" ]
  state_increment_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$output" = "1" ]
}

@test "state_increment_failure: increments from 1 to 2" {
  echo "consecutive_failures=1" > "${STATE_FILE}"
  state_increment_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$output" = "2" ]
}

@test "state_increment_failure: increments from 2 to 3" {
  echo "consecutive_failures=2" > "${STATE_FILE}"
  state_increment_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$output" = "3" ]
}

@test "state_increment_failure: increments 0→1→2→3 in sequence" {
  state_increment_failure "${STATE_FILE}"
  state_increment_failure "${STATE_FILE}"
  state_increment_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$output" = "3" ]
}

# ---------------------------------------------------------------------------
# TC-3: state_reset_failure — 2 の状態から 0 に戻る
# ---------------------------------------------------------------------------

@test "state_reset_failure: sets consecutive_failures to 0 from value 2" {
  echo "consecutive_failures=2" > "${STATE_FILE}"
  state_reset_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$output" = "0" ]
}

@test "state_reset_failure: creates file with consecutive_failures=0 when file absent" {
  [ ! -f "${STATE_FILE}" ]
  state_reset_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "consecutive_failures"
  [ "$output" = "0" ]
}

# ---------------------------------------------------------------------------
# TC-4: KEY=VALUE 保全 — 既存の other_key=hello が残る
# ---------------------------------------------------------------------------

@test "state_increment_failure: preserves other keys in file" {
  printf "other_key=hello\nconsecutive_failures=0\n" > "${STATE_FILE}"
  state_increment_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "other_key"
  [ "$output" = "hello" ]
}

@test "state_reset_failure: preserves other keys in file" {
  printf "other_key=hello\nconsecutive_failures=3\n" > "${STATE_FILE}"
  state_reset_failure "${STATE_FILE}"
  run state_read "${STATE_FILE}" "other_key"
  [ "$output" = "hello" ]
}

# ---------------------------------------------------------------------------
# TC-5: 原子性 — 書き戻し後に半端な内容がない
# ---------------------------------------------------------------------------

@test "state_increment_failure: file has valid KEY=VALUE content after write" {
  printf "other_key=hello\nconsecutive_failures=1\n" > "${STATE_FILE}"
  state_increment_failure "${STATE_FILE}"
  # 全行が KEY=VALUE 形式か空行・コメントであること
  while IFS= read -r line; do
    if [ -z "$line" ] || [[ "$line" == \#* ]]; then
      continue
    fi
    [[ "$line" == *=* ]]
  done < "${STATE_FILE}"
}

@test "state_reset_failure: file has valid KEY=VALUE content after write" {
  printf "other_key=hello\nconsecutive_failures=3\n" > "${STATE_FILE}"
  state_reset_failure "${STATE_FILE}"
  while IFS= read -r line; do
    if [ -z "$line" ] || [[ "$line" == \#* ]]; then
      continue
    fi
    [[ "$line" == *=* ]]
  done < "${STATE_FILE}"
}

@test "state_increment_failure: no tmp file remains after write" {
  state_increment_failure "${STATE_FILE}"
  # tmp ファイルが残っていないこと（STATE_FILE 本体のみ存在する）
  local dir
  dir="$(dirname "${STATE_FILE}")"
  local tmp_count
  tmp_count=$(find "${dir}" -name "*.tmp.*" -o -name ".tmp.*" 2>/dev/null | wc -l | tr -d ' ')
  [ "${tmp_count}" -eq 0 ]
}
