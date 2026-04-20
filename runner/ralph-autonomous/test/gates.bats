#!/usr/bin/env bats
# runner/ralph-autonomous/test/gates.bats
# TDD tests for runner/ralph-autonomous/lib/gates.sh

load "helpers"

GATES_LIB="${BATS_TEST_DIRNAME}/../lib/gates.sh"

setup() {
  ralph_autonomous_setup_tmp_workspace
  ralph_autonomous_reset_fake_env

  # gates.quality に 2 スクリプトを持つ config を書き込む
  mkdir -p "${RATEST_WORKSPACE}/.ralph"
  cat > "${RATEST_WORKSPACE}/.ralph/config.json" <<JSON
{
  "schema_version": "1.0",
  "plan_id": "test-plan",
  "branch_name": "ralph/test-plan",
  "mode": "autonomous",
  "references": {
    "requirements": "docs/requirements/test.md",
    "design": "docs/design/test.md",
    "plan": "docs/plans/test.md"
  },
  "scope": {
    "allowed_paths": ["src/**", "tests/**"],
    "forbidden_paths": [".claude/**", "docs/decisions/**"],
    "max_files_changed": 30
  },
  "stop_conditions": {
    "max_iter": 10,
    "no_progress_iter": 3,
    "same_error_iter": 5,
    "test_only_ratio_threshold": 0.3,
    "time_budget_seconds": 7200
  },
  "gates": {
    "quality": ["00-test.sh", "01-typecheck.sh"],
    "reviewers": ["spec-compliance", "quality", "security"],
    "enforce_review_memory_hot": true
  },
  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
JSON

  # fake gates ディレクトリを作成
  export RATEST_GATES_DIR="${BATS_TEST_TMPDIR}/gates"
  mkdir -p "${RATEST_GATES_DIR}"

  # log ディレクトリ
  export RATEST_LOG_DIR="${BATS_TEST_TMPDIR}/logs"
}

# AC-1: gates_run_quality: 全ゲートが成功 → exit 0
@test "gates_run_quality exits 0 when all quality gates succeed" {
  # 全て成功する fake gates を作成
  cat > "${RATEST_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: PASS"
exit 0
SCRIPT
  cat > "${RATEST_GATES_DIR}/01-typecheck.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "typecheck gate: PASS"
exit 0
SCRIPT
  chmod +x "${RATEST_GATES_DIR}/00-test.sh" "${RATEST_GATES_DIR}/01-typecheck.sh"

  source "${GATES_LIB}"
  run gates_run_quality \
    "${RATEST_WORKSPACE}/.ralph/config.json" \
    "${RATEST_GATES_DIR}" \
    "${RATEST_LOG_DIR}"

  [ "${status}" -eq 0 ]
}

# AC-2: gates_run_quality: 1つのゲートが失敗 → exit 5
@test "gates_run_quality exits 5 when one quality gate fails" {
  # 01-typecheck.sh が失敗する fake gates を作成
  cat > "${RATEST_GATES_DIR}/00-test.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "test gate: PASS"
exit 0
SCRIPT
  cat > "${RATEST_GATES_DIR}/01-typecheck.sh" <<'SCRIPT'
#!/usr/bin/env bash
echo "typecheck gate: FAIL"
exit 1
SCRIPT
  chmod +x "${RATEST_GATES_DIR}/00-test.sh" "${RATEST_GATES_DIR}/01-typecheck.sh"

  source "${GATES_LIB}"
  run gates_run_quality \
    "${RATEST_WORKSPACE}/.ralph/config.json" \
    "${RATEST_GATES_DIR}" \
    "${RATEST_LOG_DIR}"

  [ "${status}" -eq 5 ]
}

# AC-3: gates_run_quality: gates.quality が空配列 → exit 0
@test "gates_run_quality exits 0 when gates.quality is empty array" {
  # quality が空配列の config を書き込む
  cat > "${RATEST_WORKSPACE}/.ralph/config.json" <<JSON
{
  "schema_version": "1.0",
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
    "max_iter": 10,
    "no_progress_iter": 3,
    "same_error_iter": 5,
    "test_only_ratio_threshold": 0.3,
    "time_budget_seconds": 7200
  },
  "gates": {
    "quality": [],
    "reviewers": ["spec-compliance"],
    "enforce_review_memory_hot": true
  },
  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
JSON

  source "${GATES_LIB}"
  run gates_run_quality \
    "${RATEST_WORKSPACE}/.ralph/config.json" \
    "${RATEST_GATES_DIR}" \
    "${RATEST_LOG_DIR}"

  [ "${status}" -eq 0 ]
}

# AC-4: gates_run_reviewers: 全 reviewer が REVIEW_OK → exit 0
@test "gates_run_reviewers exits 0 when all reviewers return REVIEW_OK" {
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="REVIEW_OK"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  source "${GATES_LIB}"
  run gates_run_reviewers \
    "${RATEST_WORKSPACE}/.ralph/config.json" \
    "${RATEST_WORKSPACE}"

  [ "${status}" -eq 0 ]
}

# AC-5: gates_run_reviewers: 1 reviewer が REVIEW_MUST を含む → exit 5
@test "gates_run_reviewers exits 5 when one reviewer returns REVIEW_MUST" {
  export FAKE_CLAUDE_EXIT_CODE=0
  export FAKE_CLAUDE_STDOUT="REVIEW_MUST: something must be fixed"
  ralph_autonomous_path_stub "claude" "${BATS_TEST_DIRNAME}/fixtures/fake-claude.sh"

  source "${GATES_LIB}"
  run gates_run_reviewers \
    "${RATEST_WORKSPACE}/.ralph/config.json" \
    "${RATEST_WORKSPACE}"

  [ "${status}" -eq 5 ]
}
