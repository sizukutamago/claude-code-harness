#!/usr/bin/env bats
# runner/ralph-autonomous/test/helpers.bats

load "helpers"

@test "ralph_autonomous_setup_tmp_workspace creates dir and sets RATEST_WORKSPACE" {
  ralph_autonomous_setup_tmp_workspace
  [ -d "${RATEST_WORKSPACE}" ]
  [ -d "${RATEST_WORKSPACE}/.ralph" ]
}

@test "ralph_autonomous_write_config creates valid config.json" {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
  [ -f "${RATEST_WORKSPACE}/.ralph/config.json" ]
  run jq -r '.mode' "${RATEST_WORKSPACE}/.ralph/config.json"
  [ "${output}" = "autonomous" ]
}

@test "ralph_autonomous_write_config accepts custom allowed_paths" {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_write_config "${RATEST_WORKSPACE}" '["apps/**"]'
  run jq -r '.scope.allowed_paths[0]' "${RATEST_WORKSPACE}/.ralph/config.json"
  [ "${output}" = "apps/**" ]
}

@test "ralph_autonomous_path_stub adds stub to PATH" {
  local stub="${BATS_TEST_TMPDIR}/my-stub.sh"
  echo '#!/usr/bin/env bash
echo "stub-output"' > "${stub}"
  chmod +x "${stub}"
  ralph_autonomous_path_stub "my-cmd" "${stub}"
  run my-cmd
  [ "${status}" -eq 0 ]
  [ "${output}" = "stub-output" ]
}

@test "ralph_autonomous_assert_file_contains succeeds when substring found" {
  local f="${BATS_TEST_TMPDIR}/test.txt"
  echo "hello world" > "${f}"
  ralph_autonomous_assert_file_contains "${f}" "hello"
}

@test "ralph_autonomous_assert_file_contains fails when substring not found" {
  local f="${BATS_TEST_TMPDIR}/test.txt"
  echo "hello world" > "${f}"
  run ralph_autonomous_assert_file_contains "${f}" "goodbye"
  [ "${status}" -ne 0 ]
}
