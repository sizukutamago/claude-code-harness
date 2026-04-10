#!/usr/bin/env bats

load "test_helper"

GATES_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../gates" && pwd)"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  MOCK_DIR="$TEST_TMPDIR/mock-bin"
  mkdir -p "$MOCK_DIR"
  export PATH="$MOCK_DIR:$PATH"
}

teardown() {
  if [ -d "${TEST_TMPDIR}" ]; then
    rm -rf "${TEST_TMPDIR}"
  fi
}

# --- Helper: mock creators ---

create_successful_npm_mock() {
  cat > "$MOCK_DIR/npm" << 'MOCK'
#!/bin/bash
echo "all tests passed"
exit 0
MOCK
  chmod +x "$MOCK_DIR/npm"
}

create_failing_npm_mock() {
  cat > "$MOCK_DIR/npm" << 'MOCK'
#!/bin/bash
echo "1 test failed" >&2
exit 1
MOCK
  chmod +x "$MOCK_DIR/npm"
}

create_successful_npx_mock() {
  cat > "$MOCK_DIR/npx" << 'MOCK'
#!/bin/bash
echo "success"
exit 0
MOCK
  chmod +x "$MOCK_DIR/npx"
}

create_failing_npx_mock() {
  cat > "$MOCK_DIR/npx" << 'MOCK'
#!/bin/bash
echo "command failed" >&2
exit 1
MOCK
  chmod +x "$MOCK_DIR/npx"
}

# --- 00-test.sh ---

# AC-1: npm test succeeds -> exit 0
@test "00-test.sh: exits 0 when npm test succeeds" {
  create_successful_npm_mock
  run "$GATES_DIR/00-test.sh"
  [ "$status" -eq 0 ]
}

# AC-2: npm test fails -> exit 1
@test "00-test.sh: exits 1 when npm test fails" {
  create_failing_npm_mock
  run "$GATES_DIR/00-test.sh"
  [ "$status" -eq 1 ]
}

# AC-3: npm not found -> exit 1 + message to stderr
@test "00-test.sh: exits 1 and prints to stderr when npm is not found" {
  # Restrict PATH to MOCK_DIR only (no npm mock = npm absent)
  PATH="$MOCK_DIR" run "$GATES_DIR/00-test.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"npm"* ]]
}

# --- 01-typecheck.sh ---

# AC-4: tsc succeeds -> exit 0
@test "01-typecheck.sh: exits 0 when tsc succeeds" {
  create_successful_npx_mock
  run "$GATES_DIR/01-typecheck.sh"
  [ "$status" -eq 0 ]
}

# AC-5: tsc fails -> exit 1
@test "01-typecheck.sh: exits 1 when tsc fails" {
  create_failing_npx_mock
  run "$GATES_DIR/01-typecheck.sh"
  [ "$status" -eq 1 ]
}

# AC-6: npx not found -> exit 1 + message to stderr
@test "01-typecheck.sh: exits 1 and prints to stderr when npx is not found" {
  # Restrict PATH to MOCK_DIR only (no npx mock = npx absent)
  PATH="$MOCK_DIR" run "$GATES_DIR/01-typecheck.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"npx"* ]]
}

# --- 02-e2e.sh ---

# AC-7: playwright succeeds -> exit 0
@test "02-e2e.sh: exits 0 when playwright succeeds" {
  create_successful_npx_mock
  run "$GATES_DIR/02-e2e.sh"
  [ "$status" -eq 0 ]
}

# AC-8: playwright fails -> exit 1
@test "02-e2e.sh: exits 1 when playwright fails" {
  create_failing_npx_mock
  run "$GATES_DIR/02-e2e.sh"
  [ "$status" -eq 1 ]
}

# AC-9: npx not found -> exit 1 + message to stderr
@test "02-e2e.sh: exits 1 and prints to stderr when npx is not found" {
  # Restrict PATH to MOCK_DIR only (no npx mock = npx absent)
  PATH="$MOCK_DIR" run "$GATES_DIR/02-e2e.sh"
  [ "$status" -eq 1 ]
  [[ "$output" == *"npx"* ]]
}
