#!/usr/bin/env bats

load "test_helper"

# AC-1: test_helper.bash is loaded
@test "test_helper sets BATS_SUPPORT_LOADED to true" {
  [ "${BATS_SUPPORT_LOADED}" = "true" ]
}

# AC-2: jq is available
@test "jq command is available" {
  command -v jq
}

@test "jq returns version string" {
  run jq --version
  [ "$status" -eq 0 ]
  [[ "$output" == jq* ]]
}

# AC-3: fixtures are readable
@test "fixtures/plan.json exists" {
  [ -f "${FIXTURES_DIR}/plan.json" ]
}

@test "fixtures/plan.json is valid JSON" {
  run jq '.' "${FIXTURES_DIR}/plan.json"
  [ "$status" -eq 0 ]
}

@test "fixtures/plan.json contains 3 stories" {
  run jq '.stories | length' "${FIXTURES_DIR}/plan.json"
  [ "$status" -eq 0 ]
  [ "$output" = "3" ]
}

@test "fixtures/learnings.jsonl exists" {
  [ -f "${FIXTURES_DIR}/learnings.jsonl" ]
}

@test "fixtures/learnings.jsonl has 4 lines" {
  run grep -c '' "${FIXTURES_DIR}/learnings.jsonl"
  [ "$status" -eq 0 ]
  [ "$output" = "4" ]
}

@test "each line of fixtures/learnings.jsonl is valid JSON" {
  while IFS= read -r line; do
    run jq '.' <<< "$line"
    [ "$status" -eq 0 ]
  done < "${FIXTURES_DIR}/learnings.jsonl"
}

@test "fixtures/conventions.md exists" {
  [ -f "${FIXTURES_DIR}/conventions.md" ]
}

@test "fixtures/conventions.md is not empty" {
  [ -s "${FIXTURES_DIR}/conventions.md" ]
}

# AC-4: setup/teardown helpers work
@test "setup creates TEST_TMPDIR directory" {
  [ -d "$TEST_TMPDIR" ]
}

@test "copy_fixture copies file to TEST_TMPDIR" {
  copy_fixture "plan.json"
  [ -f "${TEST_TMPDIR}/plan.json" ]
}
