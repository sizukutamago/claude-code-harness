#!/usr/bin/env bats
# integration.bats -- E2E integration tests: ralph-runner.sh with claude -p mock

load "test_helper"

# runner/ralph-runner.sh absolute path
RUNNER_PATH="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)/ralph-runner.sh"

# ---------------------------------------------------------------------------
# helper: create claude mock
#   mode: success         -- succeeds and outputs a unique LEARNING line per story
#   mode: success_unique  -- succeeds with unique LEARNING per invocation
# ---------------------------------------------------------------------------
create_claude_mock() {
  local mode="${1:-success}"
  case "${mode}" in
    success)
      # Use a counter to make each learning unique to avoid unintended promotion
      local counter_file="${TEST_TMPDIR}/claude-call-count"
      echo "0" > "${counter_file}"
      cat > "${MOCK_DIR}/claude" << MOCK
#!/bin/bash
count=\$(cat "${counter_file}")
count=\$((count + 1))
echo "\${count}" > "${counter_file}"
echo "Implementation done."
echo "LEARNING: type=pattern content=\"claude call \${count}\""
exit 0
MOCK
      ;;
  esac
  chmod +x "${MOCK_DIR}/claude"
}

# ---------------------------------------------------------------------------
# helper: create quality gate mock
# ---------------------------------------------------------------------------
create_gate_mock() {
  local name="$1"
  local exit_code="$2"
  cat > "${GATES_DIR}/${name}" << MOCK
#!/bin/bash
exit ${exit_code}
MOCK
  chmod +x "${GATES_DIR}/${name}"
}

# ---------------------------------------------------------------------------
# helper: create a counting gate mock that fails after N successful calls
#   Sets up 00-test.sh to succeed for the first <success_count> calls,
#   then fail for all subsequent calls.
# ---------------------------------------------------------------------------
create_counting_gate_mock() {
  local success_count="$1"
  local counter_file="${TEST_TMPDIR}/gate-call-count"
  echo "0" > "${counter_file}"
  cat > "${GATES_DIR}/00-test.sh" << GATEEOF
#!/bin/bash
count=\$(cat "${counter_file}")
count=\$((count + 1))
echo "\${count}" > "${counter_file}"
if [ "\${count}" -le ${success_count} ]; then
  exit 0
fi
exit 1
GATEEOF
  chmod +x "${GATES_DIR}/00-test.sh"
}

setup() {
  # Override test_helper.bash setup: create TEST_TMPDIR directly
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-integration.XXXXXX")"

  # Mock directory
  MOCK_DIR="${TEST_TMPDIR}/mock-bin"
  mkdir -p "${MOCK_DIR}"

  # Gate directory
  GATES_DIR="${TEST_TMPDIR}/gates"
  mkdir -p "${GATES_DIR}"

  # Run directory
  RUNS_DIR="${TEST_TMPDIR}/runs"
  mkdir -p "${RUNS_DIR}"

  # Copy fixtures (fresh plan.json for each test)
  copy_fixture "plan.json"
  touch "${TEST_TMPDIR}/learnings.jsonl"
  touch "${TEST_TMPDIR}/conventions.md"

  # Default claude mock: success
  create_claude_mock "success"

  # Default gate mocks: all success
  create_gate_mock "00-test.sh" 0
  create_gate_mock "01-typecheck.sh" 0

  export PATH="${MOCK_DIR}:${PATH}"
  export LEARNINGS_FILE="${TEST_TMPDIR}/learnings.jsonl"
  export CONVENTIONS_FILE="${TEST_TMPDIR}/conventions.md"
}

teardown() {
  if [ -d "${TEST_TMPDIR}" ]; then
    rm -rf "${TEST_TMPDIR}"
  fi
}

# ===========================================================================
# Scenario 1: happy path -- all 3 stories complete in order
# ===========================================================================

# ---------------------------------------------------------------------------
# TC-01: all 3 stories become completed
# ---------------------------------------------------------------------------
@test "integration: happy path -- all 3 stories become completed" {
  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  run jq -r '.stories[] | select(.id=="S-001") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "completed" ]

  run jq -r '.stories[] | select(.id=="S-002") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "completed" ]

  run jq -r '.stories[] | select(.id=="S-003") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "completed" ]
}

# ---------------------------------------------------------------------------
# TC-02: summary JSON shows completed=3
# ---------------------------------------------------------------------------
@test "integration: happy path -- summary JSON completed=3" {
  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  local summary_file
  summary_file="$(find "${RUNS_DIR}" -name "summary.json" | head -1)"
  [ -n "${summary_file}" ]
  [ -f "${summary_file}" ]

  run jq -r '.completed' "${summary_file}"
  [ "$output" = "3" ]
}

# ---------------------------------------------------------------------------
# TC-03: learnings.jsonl has entries appended
# ---------------------------------------------------------------------------
@test "integration: happy path -- learnings.jsonl has entries appended" {
  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # learnings.jsonl should have at least one entry (unique patterns won't be promoted)
  local entry_count
  entry_count="$(wc -l < "${LEARNINGS_FILE}" | tr -d ' ')"
  [ "${entry_count}" -gt 0 ]
}

# ---------------------------------------------------------------------------
# TC-04: runs/ directory contains log files
# ---------------------------------------------------------------------------
@test "integration: happy path -- runs/ directory contains log files" {
  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  local log_count
  log_count="$(find "${RUNS_DIR}" -name "*.log" | wc -l | tr -d ' ')"
  [ "${log_count}" -gt 0 ]
}

# ===========================================================================
# Scenario 2: failure -- middle story fails, subsequent stories skipped
# ===========================================================================

# ---------------------------------------------------------------------------
# TC-05: when S-002 fails, S-003 is skipped
# ---------------------------------------------------------------------------
@test "integration: failure -- S-002 fails causes S-003 to be skipped" {
  # S-001 has 4 gate-applicable steps (tdd, simplify, test-quality, cleanup)
  # Succeed for those 4 calls, then fail on S-002's gate calls
  create_counting_gate_mock 4

  "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}" || true

  run jq -r '.stories[] | select(.id=="S-001") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "completed" ]

  run jq -r '.stories[] | select(.id=="S-002") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "failed" ]

  run jq -r '.stories[] | select(.id=="S-003") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "skipped" ]
}

# ---------------------------------------------------------------------------
# TC-06: summary shows completed=1, failed=1, skipped=1
# ---------------------------------------------------------------------------
@test "integration: failure -- summary completed=1 failed=1 skipped=1" {
  create_counting_gate_mock 4

  "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}" || true

  local summary_file
  summary_file="$(find "${RUNS_DIR}" -name "summary.json" | head -1)"
  [ -n "${summary_file}" ]

  run jq -r '.completed' "${summary_file}"
  [ "$output" = "1" ]

  run jq -r '.failed' "${summary_file}"
  [ "$output" = "1" ]

  run jq -r '.skipped' "${summary_file}"
  [ "$output" = "1" ]
}

# ===========================================================================
# Scenario 3: retry -- first attempt fails, second attempt succeeds
# ===========================================================================

# ---------------------------------------------------------------------------
# TC-07: 1st attempt fails, 2nd succeeds, story becomes completed
# ---------------------------------------------------------------------------
@test "integration: retry -- first fail then success results in completed" {
  # First gate call fails (tdd step attempt 1 of S-001), all subsequent calls succeed
  local gate_call_counter="${TEST_TMPDIR}/gate-call-count"
  echo "0" > "${gate_call_counter}"
  cat > "${GATES_DIR}/00-test.sh" << GATEEOF
#!/bin/bash
count=\$(cat "${gate_call_counter}")
count=\$((count + 1))
echo "\${count}" > "${gate_call_counter}"
if [ "\${count}" -eq 1 ]; then
  exit 1
fi
exit 0
GATEEOF
  chmod +x "${GATES_DIR}/00-test.sh"

  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  run jq -r '.stories[] | select(.id=="S-001") | .status' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "completed" ]
}

# ---------------------------------------------------------------------------
# TC-08: step_attempts records retry count
# ---------------------------------------------------------------------------
@test "integration: retry -- step_attempts records tdd attempt count as 2" {
  # First gate call fails (tdd step attempt 1 of S-001), all subsequent calls succeed
  local gate_call_counter="${TEST_TMPDIR}/gate-call-count"
  echo "0" > "${gate_call_counter}"
  cat > "${GATES_DIR}/00-test.sh" << GATEEOF
#!/bin/bash
count=\$(cat "${gate_call_counter}")
count=\$((count + 1))
echo "\${count}" > "${gate_call_counter}"
if [ "\${count}" -eq 1 ]; then
  exit 1
fi
exit 0
GATEEOF
  chmod +x "${GATES_DIR}/00-test.sh"

  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # S-001 tdd step_attempts should be 2 (1 fail + 1 success)
  run jq -r '.stories[] | select(.id=="S-001") | .step_attempts.tdd' "${TEST_TMPDIR}/plan.json"
  [ "$output" = "2" ]
}

# ===========================================================================
# Scenario 4: learnings accumulation -> conventions promotion
# ===========================================================================

# ---------------------------------------------------------------------------
# TC-09: learnings appearing 3+ times are promoted to conventions.md
# ---------------------------------------------------------------------------
@test "integration: conventions -- learnings appearing 3+ times promoted to conventions.md" {
  local type="pattern"
  local content="use dependency injection"

  # Pre-populate learnings.jsonl with 3 identical entries
  cat > "${LEARNINGS_FILE}" << JSONL
{"date":"2026-04-09","story":"S-000","step":"tdd","type":"${type}","content":"${content}"}
{"date":"2026-04-09","story":"S-000","step":"tdd","type":"${type}","content":"${content}"}
{"date":"2026-04-09","story":"S-000","step":"tdd","type":"${type}","content":"${content}"}
JSONL

  # Override claude mock to output NO learning lines so that only the 3 pre-loaded
  # entries trigger promotion (avoiding unintended side-effects from repeated patterns)
  cat > "${MOCK_DIR}/claude" << 'MOCK'
#!/bin/bash
echo "Implementation done."
exit 0
MOCK
  chmod +x "${MOCK_DIR}/claude"

  run "${RUNNER_PATH}" \
    --plan "${TEST_TMPDIR}/plan.json" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # conventions.md should contain the promoted entry
  grep -q "${content}" "${CONVENTIONS_FILE}"

  # learnings.jsonl should no longer contain the promoted entries
  run grep "\"${content}\"" "${LEARNINGS_FILE}"
  [ "$status" -ne 0 ]
}
