#!/usr/bin/env bats

load "test_helper"

QUALITY_GATE_PATH="$(cd "${BATS_TEST_DIRNAME}/../lib" && pwd)/quality-gate.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  # shellcheck source=/dev/null
  source "${QUALITY_GATE_PATH}"
  PLAN="${TEST_TMPDIR}/plan.json"
  GATES_DIR="${TEST_TMPDIR}/gates"
  LOG_DIR="${TEST_TMPDIR}/logs"
  mkdir -p "${GATES_DIR}" "${LOG_DIR}"
}

teardown() {
  if [ -d "${TEST_TMPDIR}" ]; then
    rm -rf "${TEST_TMPDIR}"
  fi
}

# --- Helper: モックゲートスクリプトを作成する ---

create_mock_gate() {
  local gates_dir="$1" name="$2" exit_code="$3"
  cat > "${gates_dir}/${name}" << MOCK
#!/bin/bash
echo "gate ${name} executed"
exit ${exit_code}
MOCK
  chmod +x "${gates_dir}/${name}"
}

# ---------------------------------------------------------------------------
# should_run_gates
# ---------------------------------------------------------------------------

# AC-1: tdd は適用対象（return 0）
@test "should_run_gates: tdd returns 0" {
  run should_run_gates "tdd"
  [ "$status" -eq 0 ]
}

# AC-2: simplify は適用対象
@test "should_run_gates: simplify returns 0" {
  run should_run_gates "simplify"
  [ "$status" -eq 0 ]
}

# AC-3: test-quality は適用対象
@test "should_run_gates: test-quality returns 0" {
  run should_run_gates "test-quality"
  [ "$status" -eq 0 ]
}

# AC-4: cleanup は適用対象
@test "should_run_gates: cleanup returns 0" {
  run should_run_gates "cleanup"
  [ "$status" -eq 0 ]
}

# AC-5: code-review は非適用（return 1）
@test "should_run_gates: code-review returns 1" {
  run should_run_gates "code-review"
  [ "$status" -eq 1 ]
}

# AC-6: verification は非適用
@test "should_run_gates: verification returns 1" {
  run should_run_gates "verification"
  [ "$status" -eq 1 ]
}

# AC-7: commit は非適用
@test "should_run_gates: commit returns 1" {
  run should_run_gates "commit"
  [ "$status" -eq 1 ]
}

# ---------------------------------------------------------------------------
# check_quality
# ---------------------------------------------------------------------------

# AC-8: quality_gates にマッチするゲートのみ実行される
@test "check_quality: only gates matching quality_gates are executed" {
  # S-001 の quality_gates = ["test", "typecheck"]
  # test にマッチする 00-test.sh と typecheck にマッチする 01-typecheck.sh のみ実行
  # e2e はマッチしないので実行されない
  create_mock_gate "${GATES_DIR}" "00-test.sh" 0
  create_mock_gate "${GATES_DIR}" "01-typecheck.sh" 0
  create_mock_gate "${GATES_DIR}" "02-e2e.sh" 0

  run check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 0 ]

  # e2e ゲートのログは作成されていないはず
  [ ! -f "${LOG_DIR}/S-001-tdd-e2e.log" ]
  # test と typecheck のログは作成されているはず
  [ -f "${LOG_DIR}/S-001-tdd-test.log" ]
  [ -f "${LOG_DIR}/S-001-tdd-typecheck.log" ]
}

# AC-9: ゲートが番号順に実行される
@test "check_quality: gates are executed in numeric order" {
  # 実行順を追跡するファイルを使う
  local order_file="${TEST_TMPDIR}/order.txt"

  cat > "${GATES_DIR}/00-test.sh" << MOCK
#!/bin/bash
echo "first" >> "${order_file}"
exit 0
MOCK
  chmod +x "${GATES_DIR}/00-test.sh"

  cat > "${GATES_DIR}/01-typecheck.sh" << MOCK
#!/bin/bash
echo "second" >> "${order_file}"
exit 0
MOCK
  chmod +x "${GATES_DIR}/01-typecheck.sh"

  # S-001 の quality_gates = ["test", "typecheck"]
  check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"

  run cat "${order_file}"
  [ "$status" -eq 0 ]
  # 最初の行が "first"、次が "second"
  first_line=$(echo "$output" | sed -n '1p')
  second_line=$(echo "$output" | sed -n '2p')
  [ "$first_line" = "first" ]
  [ "$second_line" = "second" ]
}

# AC-10: 全ゲート成功時に return 0
@test "check_quality: returns 0 when all gates succeed" {
  create_mock_gate "${GATES_DIR}" "00-test.sh" 0
  create_mock_gate "${GATES_DIR}" "01-typecheck.sh" 0

  run check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 0 ]
}

# AC-11: 1つでも失敗時に return 1
@test "check_quality: returns 1 when any gate fails" {
  create_mock_gate "${GATES_DIR}" "00-test.sh" 0
  create_mock_gate "${GATES_DIR}" "01-typecheck.sh" 1

  run check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 1 ]
}

# AC-12: ログファイルが正しいパスに作成される
@test "check_quality: log file is created at correct path" {
  create_mock_gate "${GATES_DIR}" "00-test.sh" 0
  create_mock_gate "${GATES_DIR}" "01-typecheck.sh" 0

  check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"

  [ -f "${LOG_DIR}/S-001-tdd-test.log" ]
  [ -f "${LOG_DIR}/S-001-tdd-typecheck.log" ]
}

# AC-13: 非適用ステップではゲートが実行されず return 0
@test "check_quality: returns 0 without running gates for non-applicable step" {
  create_mock_gate "${GATES_DIR}" "00-test.sh" 1

  # code-review は should_run_gates が false → ゲート実行なし → return 0
  run check_quality "${PLAN}" "S-001" "code-review" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 0 ]

  # ログファイルも作成されていないはず
  [ ! -f "${LOG_DIR}/S-001-code-review-test.log" ]
}
