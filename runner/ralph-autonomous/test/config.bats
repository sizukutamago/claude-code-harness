#!/usr/bin/env bats
# runner/ralph-autonomous/test/config.bats
# TDD tests for runner/ralph-autonomous/lib/config.sh

load "helpers"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"
}

# AC-1: config_read returns mode field (scalar value)
@test "config_read returns mode field" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  run config_read "${RATEST_WORKSPACE}/.ralph/config.json" ".mode"
  [ "${status}" -eq 0 ]
  [ "${output}" = "autonomous" ]
}

# AC-2: config_read returns nested references.plan field
@test "config_read returns nested references.plan field" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  run config_read "${RATEST_WORKSPACE}/.ralph/config.json" ".references.plan"
  [ "${status}" -eq 0 ]
  [ "${output}" = "docs/plans/test.md" ]
}

# AC-3: config_read exits with 2 when file does not exist
@test "config_read exits with 2 when file does not exist" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  run config_read "${RATEST_WORKSPACE}/.ralph/nonexistent.json" ".mode"
  [ "${status}" -eq 2 ]
}

# AC-4: config_read_array outputs scope.allowed_paths one element per line
@test "config_read_array outputs scope.allowed_paths one element per line" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  run config_read_array "${RATEST_WORKSPACE}/.ralph/config.json" ".scope.allowed_paths"
  [ "${status}" -eq 0 ]
  [ "${lines[0]}" = "src/**" ]
  [ "${lines[1]}" = "tests/**" ]
}

# AC-5: config_validate exits 0 for valid config.json
@test "config_validate exits 0 for valid config.json" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  run config_validate "${RATEST_WORKSPACE}/.ralph/config.json"
  [ "${status}" -eq 0 ]
}

# AC-6: config_validate exits 2 with error message when required field is missing
@test "config_validate exits 2 with error message when required field is missing" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  # Write config without schema_version
  cat > "${RATEST_WORKSPACE}/.ralph/config.json" <<JSON
{
  "plan_id": "test-plan",
  "branch_name": "ralph/test-plan",
  "mode": "autonomous",
  "references": {
    "requirements": "docs/requirements/test.md",
    "design": "docs/design/test.md",
    "plan": "docs/plans/test.md"
  },
  "scope": {
    "allowed_paths": ["src/**"],
    "forbidden_paths": [".claude/**"],
    "max_files_changed": 30
  },
  "stop_conditions": {
    "max_iter": 10
  },
  "gates": {
    "quality": ["00-test.sh"],
    "reviewers": ["spec-compliance"]
  },
  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
JSON
  run config_validate "${RATEST_WORKSPACE}/.ralph/config.json"
  [ "${status}" -eq 2 ]
  [[ "${output}" == *"missing required field: schema_version"* ]]
}

# AC-7: config_validate exits 2 with error message when file does not exist
@test "config_validate exits 2 with error message when file does not exist" {
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  run config_validate "${RATEST_WORKSPACE}/.ralph/nonexistent.json"
  [ "${status}" -eq 2 ]
  [[ "${output}" == *"config.json not found"* ]]
}
