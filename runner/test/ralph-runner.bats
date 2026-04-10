#!/usr/bin/env bats

load "test_helper"

# runner/ralph-runner.sh への絶対パス
RUNNER_PATH="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)/ralph-runner.sh"

setup() {
  TEST_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bats-test.XXXXXX")"
  copy_fixture "plan.json"
  copy_fixture "learnings.jsonl"
  copy_fixture "conventions.md"

  # claude モック（成功）
  MOCK_DIR="${TEST_TMPDIR}/mock-bin"
  mkdir -p "${MOCK_DIR}"
  cat > "${MOCK_DIR}/claude" << 'MOCK'
#!/bin/bash
echo "Implementation done."
echo 'LEARNING: type=pattern content="test pattern"'
exit 0
MOCK
  chmod +x "${MOCK_DIR}/claude"
  export PATH="${MOCK_DIR}:${PATH}"

  # モック品質ゲートディレクトリ（全成功）
  GATES_DIR="${TEST_TMPDIR}/gates"
  mkdir -p "${GATES_DIR}"
  cat > "${GATES_DIR}/00-test.sh" << 'GATE'
#!/bin/bash
exit 0
GATE
  chmod +x "${GATES_DIR}/00-test.sh"

  # ログディレクトリ
  LOG_DIR="${TEST_TMPDIR}/logs"
  mkdir -p "${LOG_DIR}"

  # 環境変数でテスト用ファイルパスを指定
  export PLAN_FILE="${TEST_TMPDIR}/plan.json"
  export LEARNINGS_FILE="${TEST_TMPDIR}/learnings.jsonl"
  export CONVENTIONS_FILE="${TEST_TMPDIR}/conventions.md"
  export GATES_DIR_OVERRIDE="${GATES_DIR}"
  export RUNS_DIR="${TEST_TMPDIR}/runs"
}

teardown() {
  if [ -d "${TEST_TMPDIR}" ]; then
    rm -rf "${TEST_TMPDIR}"
  fi
}

# ---------------------------------------------------------------------------
# AC-1: ralph-runner.sh が実行可能である
# ---------------------------------------------------------------------------
@test "ralph-runner.sh is executable" {
  [ -f "${RUNNER_PATH}" ]
  [ -x "${RUNNER_PATH}" ]
}

# ---------------------------------------------------------------------------
# AC-2: --dry-run: claude -p を呼ばずに実行計画が表示される
# ---------------------------------------------------------------------------
@test "--dry-run: does not invoke claude" {
  # claude モックに呼ばれたら記録するファイルを使う
  CALL_RECORD="${TEST_TMPDIR}/claude-called"
  cat > "${MOCK_DIR}/claude" << MOCK
#!/bin/bash
touch "${CALL_RECORD}"
echo "Implementation done."
exit 0
MOCK
  chmod +x "${MOCK_DIR}/claude"

  run "${RUNNER_PATH}" --plan "${PLAN_FILE}" --dry-run
  [ "$status" -eq 0 ]
  [ ! -f "${CALL_RECORD}" ]
}

# ---------------------------------------------------------------------------
# AC-3: --dry-run: ストーリー一覧が表示される
# ---------------------------------------------------------------------------
@test "--dry-run: shows story list" {
  run "${RUNNER_PATH}" --plan "${PLAN_FILE}" --dry-run
  [ "$status" -eq 0 ]
  # plan.json に含まれるストーリー ID が表示されること
  echo "${output}" | grep -q "S-001"
  echo "${output}" | grep -q "S-002"
  echo "${output}" | grep -q "S-003"
}

# ---------------------------------------------------------------------------
# AC-4: ストーリーが depends_on 順に実行される（S-001 → S-002 → S-003）
# ---------------------------------------------------------------------------
@test "stories are executed in dependency order S-001, S-002, S-003" {
  ORDER_FILE="${TEST_TMPDIR}/exec-order.txt"
  cat > "${MOCK_DIR}/claude" << MOCK
#!/bin/bash
# -p フラグを探して story ID をプロンプトから取得する
for arg in "\$@"; do
  if [[ "\$arg" == *"S-001"* ]]; then
    echo "S-001" >> "${ORDER_FILE}"
    break
  elif [[ "\$arg" == *"S-002"* ]]; then
    echo "S-002" >> "${ORDER_FILE}"
    break
  elif [[ "\$arg" == *"S-003"* ]]; then
    echo "S-003" >> "${ORDER_FILE}"
    break
  fi
done
echo 'LEARNING: type=pattern content="test pattern"'
exit 0
MOCK
  chmod +x "${MOCK_DIR}/claude"

  run "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # 実行されたストーリーの順序を確認（各ストーリーは複数ステップあるので uniq で確認）
  run sort -u "${ORDER_FILE}"
  echo "${output}" | grep -q "S-001"
  echo "${output}" | grep -q "S-002"
  echo "${output}" | grep -q "S-003"

  # S-001 が S-002 より先に最初に現れること
  first_s001=$(grep -n "S-001" "${ORDER_FILE}" | head -1 | cut -d: -f1)
  first_s002=$(grep -n "S-002" "${ORDER_FILE}" | head -1 | cut -d: -f1)
  first_s003=$(grep -n "S-003" "${ORDER_FILE}" | head -1 | cut -d: -f1)
  [ "${first_s001}" -lt "${first_s002}" ]
  [ "${first_s002}" -lt "${first_s003}" ]
}

# ---------------------------------------------------------------------------
# AC-5: 品質ゲート適用対象ステップ（tdd）でゲートが実行される
# ---------------------------------------------------------------------------
@test "quality gate is executed for tdd step" {
  GATE_CALLED="${TEST_TMPDIR}/gate-called"
  cat > "${GATES_DIR}/00-test.sh" << GATE
#!/bin/bash
touch "${GATE_CALLED}"
exit 0
GATE
  chmod +x "${GATES_DIR}/00-test.sh"

  # S-001 のみ実行できるよう S-002, S-003 を completed にする
  # actually, let's just run all and check gate was called
  run "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # tdd ステップでゲートが呼ばれること
  [ -f "${GATE_CALLED}" ]
}

# ---------------------------------------------------------------------------
# AC-6: 品質ゲート非適用ステップ（code-review）ではゲートが実行されない
# ---------------------------------------------------------------------------
@test "quality gate is NOT executed for code-review step" {
  # code-review 専用ゲートを設置（呼ばれたら記録）
  GATE_CALLED="${TEST_TMPDIR}/gate-code-review-called"
  # 00-test.sh は code-review には適用されないはず
  cat > "${GATES_DIR}/00-test.sh" << GATE
#!/bin/bash
# ステップ名で判断できないのでとにかく呼ばれたら記録
touch "${GATE_CALLED}"
exit 0
GATE
  chmod +x "${GATES_DIR}/00-test.sh"

  # S-001 だけ実行し、tdd ステップでは呼ばれ、code-review では呼ばれないことを
  # ログディレクトリで確認する
  run "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # code-review ステップのゲートログは存在しないこと
  # (ゲート名は test なので S-001-code-review-test.log は存在しないはず)
  [ ! -f "${RUNS_DIR}"/*/S-001-code-review-test.log ]
}

# ---------------------------------------------------------------------------
# AC-7: ステップ失敗時に最大3回リトライする
# ---------------------------------------------------------------------------
@test "retries up to 3 times on step failure" {
  ATTEMPT_COUNT="${TEST_TMPDIR}/attempts"
  echo "0" > "${ATTEMPT_COUNT}"
  cat > "${MOCK_DIR}/claude" << MOCK
#!/bin/bash
count=\$(cat "${ATTEMPT_COUNT}")
count=\$((count + 1))
echo "\${count}" > "${ATTEMPT_COUNT}"
echo 'LEARNING: type=pattern content="fail pattern"'
exit 1
MOCK
  chmod +x "${MOCK_DIR}/claude"

  run "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  # 全体は失敗ストーリーがあるが exit 0 で終わること（サマリ出力のため）
  # (exit code は実装次第なのでここでは確認しない)

  # S-001 の tdd ステップで3回試みられること
  attempts=$(cat "${ATTEMPT_COUNT}")
  [ "${attempts}" -eq 3 ]
}

# ---------------------------------------------------------------------------
# AC-8: 3回失敗でストーリーが failed になる
# ---------------------------------------------------------------------------
@test "story status becomes failed after 3 step failures" {
  cat > "${MOCK_DIR}/claude" << 'MOCK'
#!/bin/bash
echo 'LEARNING: type=pattern content="fail"'
exit 1
MOCK
  chmod +x "${MOCK_DIR}/claude"

  "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}" || true

  # S-001 が failed になっていること
  run jq -r '.stories[] | select(.id=="S-001") | .status' "${PLAN_FILE}"
  [ "$status" -eq 0 ]
  [ "$output" = "failed" ]
}

# ---------------------------------------------------------------------------
# AC-9: failed ストーリーの依存先が skipped になる
# ---------------------------------------------------------------------------
@test "dependents are skipped when a story fails" {
  cat > "${MOCK_DIR}/claude" << 'MOCK'
#!/bin/bash
echo 'LEARNING: type=pattern content="fail"'
exit 1
MOCK
  chmod +x "${MOCK_DIR}/claude"

  "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}" || true

  # S-002, S-003 (S-001 の依存先) が skipped になっていること
  run jq -r '.stories[] | select(.id=="S-002") | .status' "${PLAN_FILE}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]

  run jq -r '.stories[] | select(.id=="S-003") | .status' "${PLAN_FILE}"
  [ "$status" -eq 0 ]
  [ "$output" = "skipped" ]
}

# ---------------------------------------------------------------------------
# AC-10: 全ストーリー完了後にサマリ JSON が生成される
# ---------------------------------------------------------------------------
@test "summary JSON is generated after all stories complete" {
  run "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # RUNS_DIR 以下に summary.json が生成されていること
  local summary_file
  summary_file="$(find "${RUNS_DIR}" -name "summary.json" | head -1)"
  [ -n "${summary_file}" ]
  [ -f "${summary_file}" ]

  # サマリ JSON に必須フィールドがあること
  run jq -e '.run_id' "${summary_file}"
  [ "$status" -eq 0 ]
  run jq -e '.total' "${summary_file}"
  [ "$status" -eq 0 ]
  run jq -e '.completed' "${summary_file}"
  [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# AC-11: ストーリー完了時に learnings から LEARNING 行が抽出される
# ---------------------------------------------------------------------------
@test "LEARNING lines are extracted from step output" {
  # モックが LEARNING 行を出力する（setup で設定済み）
  run "${RUNNER_PATH}" \
    --plan "${PLAN_FILE}" \
    --gates-dir "${GATES_DIR}" \
    --runs-dir "${RUNS_DIR}"
  [ "$status" -eq 0 ]

  # learnings.jsonl に "test pattern" が追記されていること
  grep -q "test pattern" "${LEARNINGS_FILE}"
}
