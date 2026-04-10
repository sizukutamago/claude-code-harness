#!/usr/bin/env bats
# quality-gate-quality.bats — 境界値・異常系の追加テスト

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

# ---------------------------------------------------------------------------
# Helper: 実行権限なしのゲートスクリプトを作成する
# ---------------------------------------------------------------------------
create_non_executable_gate() {
  local gates_dir="$1" name="$2"
  cat > "${gates_dir}/${name}" << MOCK
#!/bin/bash
exit 0
MOCK
  # 実行権限を付与しない（chmod +x しない）
}

# ---------------------------------------------------------------------------
# Helper: 実行可能なゲートスクリプトを作成する
# ---------------------------------------------------------------------------
create_mock_gate() {
  local gates_dir="$1" name="$2" exit_code="$3"
  cat > "${gates_dir}/${name}" << MOCK
#!/bin/bash
exit ${exit_code}
MOCK
  chmod +x "${gates_dir}/${name}"
}

# ===========================================================================
# 異常系
# ===========================================================================

# TQ-4: ゲートスクリプトに実行権限がない場合 check_quality は return 1 を返す
@test "TQ-4: check_quality: returns 1 when gate script is not executable" {
  create_non_executable_gate "${GATES_DIR}" "00-test.sh"
  # S-001 の quality_gates = ["test", "typecheck"]
  run check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 1 ]
}

# TQ-5: quality_gates が空配列のストーリーでは適用対象ステップでもゲートが実行されず return 0
@test "TQ-5: check_quality: returns 0 without running gates when quality_gates is empty array" {
  # S-001 の quality_gates を [] に変更する
  jq '.stories |= map(if .id == "S-001" then .quality_gates = [] else . end)' \
    "${PLAN}" > "${PLAN}.tmp" && mv "${PLAN}.tmp" "${PLAN}"
  # 失敗するゲートを置いておいても呼ばれないはず
  create_mock_gate "${GATES_DIR}" "00-test.sh" 1
  run check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 0 ]
  # ログファイルも作成されていないこと
  [ ! -f "${LOG_DIR}/S-001-tdd-test.log" ]
}

# ===========================================================================
# 境界値
# ===========================================================================

# TQ-20: gates_dir に .sh ファイルが1件もない場合 check_quality は return 0 を返す
@test "TQ-20: check_quality: returns 0 when no .sh files exist in gates_dir" {
  # GATES_DIR は空のまま
  run check_quality "${PLAN}" "S-001" "tdd" "${GATES_DIR}" "${LOG_DIR}"
  [ "$status" -eq 0 ]
}
