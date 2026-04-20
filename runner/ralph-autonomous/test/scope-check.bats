#!/usr/bin/env bats
# runner/ralph-autonomous/test/scope-check.bats

load "helpers"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_write_config "${RATEST_WORKSPACE}" '["src/**","tests/**"]'
  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  source "${BATS_TEST_DIRNAME}/../lib/scope-check.sh"
}

# AC-1: files within allowed_paths and within max_files_changed -> exit 0
@test "files within allowed_paths and within max_files_changed: exit 0" {
  FAKE_GIT_STDOUT="src/foo.ts
tests/foo.test.ts"
  export FAKE_GIT_STDOUT
  run scope_check_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 0 ]
}

# AC-2: file count exceeds max_files_changed -> exit 2
@test "file count exceeds max_files_changed: exit 2" {
  # max_files_changed is 30, so generate 31 files
  local files=""
  for i in $(seq 1 31); do
    files+="src/file${i}.ts"$'\n'
  done
  FAKE_GIT_STDOUT="${files%$'\n'}"
  export FAKE_GIT_STDOUT
  run scope_check_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 2 ]
  [[ "${output}" == *"max_files_changed"* ]]
}

# AC-3: changed file is outside allowed_paths -> exit 2
@test "changed file outside allowed_paths: exit 2" {
  FAKE_GIT_STDOUT="docs/unexpected.md"
  export FAKE_GIT_STDOUT
  run scope_check_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 2 ]
  [[ "${output}" == *"allowed_paths"* ]]
}

# AC-4: git diff returns empty (no changes) -> exit 0
@test "git diff returns empty (no changes): exit 0" {
  FAKE_GIT_STDOUT=""
  export FAKE_GIT_STDOUT
  run scope_check_run "${RATEST_WORKSPACE}/.ralph/config.json" "${RATEST_WORKSPACE}"
  [ "${status}" -eq 0 ]
}
