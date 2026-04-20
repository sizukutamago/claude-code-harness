#!/usr/bin/env bats
# runner/ralph-autonomous/test/checkpoint.bats

load "helpers"

setup() {
  ralph_autonomous_setup_tmp_workspace
  # checkpoint_every=5 を含む config.json を書き込む
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
    "allowed_paths": ["src/**","tests/**"],
    "forbidden_paths": [".claude/**","docs/decisions/**"],
    "max_files_changed": 30
  },
  "stop_conditions": {
    "max_iter": 10,
    "no_progress_iter": 3,
    "same_error_iter": 5,
    "test_only_ratio_threshold": 0.3,
    "time_budget_seconds": 7200,
    "checkpoint_every": 5
  },
  "gates": {
    "quality": ["00-test.sh"],
    "reviewers": ["spec-compliance", "quality", "security"],
    "enforce_review_memory_hot": true
  },
  "exit_signal": {
    "required": true,
    "marker": "EXIT_SIGNAL"
  }
}
JSON

  ralph_autonomous_path_stub "git" "${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"
  source "${BATS_TEST_DIRNAME}/../lib/config.sh"
  source "${BATS_TEST_DIRNAME}/../lib/state.sh"
  source "${BATS_TEST_DIRNAME}/../lib/checkpoint.sh"
}

# AC-1: should_checkpoint - iter が checkpoint_every の倍数なら exit 0
@test "should_checkpoint: iter is multiple of checkpoint_every -> exit 0" {
  run should_checkpoint "${RATEST_WORKSPACE}/.ralph/config.json" 5
  [ "${status}" -eq 0 ]
}

# AC-2: should_checkpoint - 倍数でなければ exit 1
@test "should_checkpoint: iter is not multiple of checkpoint_every -> exit 1" {
  run should_checkpoint "${RATEST_WORKSPACE}/.ralph/config.json" 3
  [ "${status}" -eq 1 ]
}

# AC-3: checkpoint_create - git tag が実行され、state.json の checkpoint_tags に追加される
@test "checkpoint_create: runs git tag and appends to state checkpoint_tags" {
  local state_file="${RATEST_WORKSPACE}/.ralph/state.json"
  local git_log="${RATEST_WORKSPACE}/git-calls.log"
  export FAKE_GIT_LOG_FILE="${git_log}"

  state_init "${state_file}"
  checkpoint_create "${RATEST_WORKSPACE}/.ralph/config.json" "${state_file}" 5

  # git tag が呼ばれたことを確認
  [ -f "${git_log}" ]
  grep -q "tag" "${git_log}"
  grep -q "ralph-checkpoint-5" "${git_log}"

  # state.json の checkpoint_tags に追加されたことを確認
  run jq -r '.checkpoint_tags[0]' "${state_file}"
  [ "${output}" = "ralph-checkpoint-5" ]
}
