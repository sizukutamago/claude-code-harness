#!/usr/bin/env bash
# runner/ralph-autonomous/test/helpers.bash
# Common test helpers for ralph-autonomous bats tests.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ralph_autonomous_setup_tmp_workspace
#   BATS_TEST_TMPDIR 内に一時 workspace を作成し RATEST_WORKSPACE に export する。
#   .ralph/ サブディレクトリも一緒に作る。
ralph_autonomous_setup_tmp_workspace() {
  local dir="${BATS_TEST_TMPDIR}/workspace-${RANDOM}"
  mkdir -p "${dir}/.ralph"
  export RATEST_WORKSPACE="${dir}"
}

# ralph_autonomous_write_config <dir> [allow_paths_json] [forbidden_paths_json]
#   dir/.ralph/config.json にテスト用の config.json を書き込む。
#   allow_paths_json: デフォルト '["src/**","tests/**"]'
#   forbidden_paths_json: デフォルト '[".claude/**","docs/decisions/**"]'
ralph_autonomous_write_config() {
  local dir="$1"
  local allow_paths="${2:-[\"src/**\",\"tests/**\"]}"
  local forbidden_paths="${3:-[\".claude/**\",\"docs/decisions/**\"]}"
  mkdir -p "${dir}/.ralph"
  cat > "${dir}/.ralph/config.json" <<JSON
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
    "allowed_paths": ${allow_paths},
    "forbidden_paths": ${forbidden_paths},
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
}

# ralph_autonomous_path_stub <command-name> <stub-script-path>
#   stub を $BATS_TEST_TMPDIR/stubs/ にコピーして PATH に追加する。
ralph_autonomous_path_stub() {
  local cmd_name="$1"
  local stub_src="$2"
  local stubs_dir="${BATS_TEST_TMPDIR}/stubs"
  mkdir -p "${stubs_dir}"
  cp "${stub_src}" "${stubs_dir}/${cmd_name}"
  chmod +x "${stubs_dir}/${cmd_name}"
  if [[ ":${PATH}:" != *":${stubs_dir}:"* ]]; then
    export PATH="${stubs_dir}:${PATH}"
  fi
}

# ralph_autonomous_assert_file_contains <file> <substring>
ralph_autonomous_assert_file_contains() {
  local file="$1"
  local substring="$2"
  if ! grep -qF "${substring}" "${file}"; then
    echo "Expected file '${file}' to contain '${substring}', but it did not." >&2
    return 1
  fi
}

# ralph_autonomous_assert_file_missing <file>
ralph_autonomous_assert_file_missing() {
  local file="$1"
  if [ -e "${file}" ]; then
    echo "Expected file '${file}' to be missing, but it exists." >&2
    return 1
  fi
}

# ralph_autonomous_reset_fake_env
#   すべての FAKE_CLAUDE_*, FAKE_TMUX_*, FAKE_GIT_* 変数を unset する。
ralph_autonomous_reset_fake_env() {
  unset FAKE_CLAUDE_EXIT_CODE  || true
  unset FAKE_CLAUDE_STDOUT     || true
  unset FAKE_CLAUDE_STDERR     || true
  unset FAKE_CLAUDE_LOG_FILE   || true
  unset FAKE_TMUX_SESSIONS     || true
  unset FAKE_TMUX_LOG_FILE     || true
  unset FAKE_GIT_EXIT_CODE     || true
  unset FAKE_GIT_STDOUT        || true
  unset FAKE_GIT_LOG_FILE      || true
}
