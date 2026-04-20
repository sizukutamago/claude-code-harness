#!/usr/bin/env bats
# runner/ralph-autonomous/test/workspace-setup.bats
# TDD tests for workspace setup scripts:
#   bootstrap.sh, init-workspace.sh, reset.sh
#
# AC-1: bootstrap - 全コマンドが揃っていれば exit 0 + "bootstrap OK"
# AC-2: bootstrap - 1コマンド欠如で exit 2 + エラーメッセージ
# AC-3: init-workspace - config.json が存在しない場合に雛形を生成（plan_id が埋め込まれる）
# AC-4: init-workspace - config.json が存在する場合は上書きしない（exit 0）
# AC-5: init-workspace - --plan-id に基づいて branch_name が設定される
# AC-6: reset - state.json が削除される
# AC-7: reset - ralph-loop.log がアーカイブされる（存在する場合）

load "helpers"

BOOTSTRAP_SCRIPT="${BATS_TEST_DIRNAME}/../bootstrap.sh"
INIT_WORKSPACE_SCRIPT="${BATS_TEST_DIRNAME}/../init-workspace.sh"
RESET_SCRIPT="${BATS_TEST_DIRNAME}/../reset.sh"

FAKE_GIT_SRC="${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

setup() {
  ralph_autonomous_reset_fake_env
  ralph_autonomous_setup_tmp_workspace
}

# ---------------------------------------------------------------------------
# AC-1: bootstrap - 全コマンドが揃っていれば exit 0 + "bootstrap OK"
# Given: jq, git, tmux, claude が全て PATH に存在する
# When:  bootstrap.sh を実行する
# Then:  exit 0, stdout に "[ralph] bootstrap OK" が含まれる
# ---------------------------------------------------------------------------

@test "bootstrap: all commands present exits 0 with bootstrap OK" {
  # Given: create stubs for all required commands in a temp stubs dir
  local stubs_dir="${BATS_TEST_TMPDIR}/stubs-all"
  mkdir -p "${stubs_dir}"

  for cmd in jq git tmux claude; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "${stubs_dir}/${cmd}"
    chmod +x "${stubs_dir}/${cmd}"
  done

  # When
  run env PATH="${stubs_dir}:/usr/bin:/bin" "${BOOTSTRAP_SCRIPT}"

  # Then
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"bootstrap OK"* ]]
}

# ---------------------------------------------------------------------------
# AC-2: bootstrap - 1コマンド欠如で exit 2 + エラーメッセージ
# Given: claude が PATH に存在しない
# When:  bootstrap.sh を実行する
# Then:  exit 2, stderr に "[ralph] missing: claude" が含まれる
# ---------------------------------------------------------------------------

@test "bootstrap: missing one command exits 2 with missing error message" {
  # Given: stubs for jq, git, tmux only (claude missing)
  local stubs_dir="${BATS_TEST_TMPDIR}/stubs-missing"
  mkdir -p "${stubs_dir}"

  for cmd in jq git tmux; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "${stubs_dir}/${cmd}"
    chmod +x "${stubs_dir}/${cmd}"
  done
  # claude is intentionally not added

  # When
  run env PATH="${stubs_dir}:/usr/bin:/bin" "${BOOTSTRAP_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # stderr contains "[ralph] missing: claude"
  [[ "${output}" == *"[ralph] missing: claude"* ]]
}

# ---------------------------------------------------------------------------
# AC-3: init-workspace - config.json が存在しない場合に雛形を生成
# Given: .ralph/ ディレクトリは存在するが config.json は存在しない
# When:  init-workspace.sh --config <.ralph-dir> --plan-id myplan を実行する
# Then:  .ralph/config.json が生成され、plan_id が "myplan" になっている
# ---------------------------------------------------------------------------

@test "init-workspace: generates config.json with plan_id when it does not exist" {
  # Given
  local config_dir="${RATEST_WORKSPACE}/.ralph"
  ralph_autonomous_assert_file_missing "${config_dir}/config.json"

  # fake git stub to prevent real git branch operations
  ralph_autonomous_path_stub "git" "${FAKE_GIT_SRC}"

  # When
  run "${INIT_WORKSPACE_SCRIPT}" --config "${config_dir}" --plan-id "myplan"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # config.json exists
  [ -f "${config_dir}/config.json" ]

  # plan_id is embedded
  run jq -r '.plan_id' "${config_dir}/config.json"
  [ "${output}" = "myplan" ]
}

# ---------------------------------------------------------------------------
# AC-4: init-workspace - config.json が存在する場合は上書きしない（exit 0）
# Given: .ralph/config.json が既に存在する
# When:  init-workspace.sh --config <.ralph-dir> --plan-id newplan を実行する
# Then:  exit 0, config.json の plan_id は変更されない
# ---------------------------------------------------------------------------

@test "init-workspace: does not overwrite existing config.json, exits 0" {
  # Given: pre-existing config.json
  local config_dir="${RATEST_WORKSPACE}/.ralph"
  ralph_autonomous_write_config "${RATEST_WORKSPACE}"

  # When
  run "${INIT_WORKSPACE_SCRIPT}" --config "${config_dir}" --plan-id "newplan"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # stdout indicates already exists
  [[ "${output}" == *"already exists"* ]]

  # plan_id remains unchanged (still "test-plan" from helper)
  run jq -r '.plan_id' "${config_dir}/config.json"
  [ "${output}" = "test-plan" ]
}

# ---------------------------------------------------------------------------
# AC-5: init-workspace - --plan-id に基づいて branch_name が設定される
# Given: .ralph/ ディレクトリは存在するが config.json は存在しない
# When:  init-workspace.sh --config <.ralph-dir> --plan-id feature-001 を実行する
# Then:  config.json の branch_name が "ralph/feature-001" になっている
# ---------------------------------------------------------------------------

@test "init-workspace: sets branch_name based on plan-id when branch not specified" {
  # Given
  local config_dir="${RATEST_WORKSPACE}/.ralph"
  ralph_autonomous_assert_file_missing "${config_dir}/config.json"

  # fake git stub
  ralph_autonomous_path_stub "git" "${FAKE_GIT_SRC}"

  # When
  run "${INIT_WORKSPACE_SCRIPT}" --config "${config_dir}" --plan-id "feature-001"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # branch_name is ralph/<plan-id>
  run jq -r '.branch_name' "${config_dir}/config.json"
  [ "${output}" = "ralph/feature-001" ]
}

# ---------------------------------------------------------------------------
# AC-6: reset - state.json が削除される
# Given: .ralph/state.json が存在する
# When:  reset.sh --config <.ralph-dir> を実行する
# Then:  exit 0, .ralph/state.json が存在しない
# ---------------------------------------------------------------------------

@test "reset: deletes state.json" {
  # Given: pre-existing state.json
  local config_dir="${RATEST_WORKSPACE}/.ralph"
  cat > "${config_dir}/state.json" <<'JSON'
{"iter": 3, "consecutive_failures": 0}
JSON

  # fake git to handle tag deletion
  export FAKE_GIT_STDOUT=""
  ralph_autonomous_path_stub "git" "${FAKE_GIT_SRC}"

  # When
  run "${RESET_SCRIPT}" --config "${config_dir}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # state.json is deleted
  ralph_autonomous_assert_file_missing "${config_dir}/state.json"
}

# ---------------------------------------------------------------------------
# AC-7: reset - ralph-loop.log がアーカイブされる（存在する場合）
# Given: .ralph/ralph-loop.log が存在する
# When:  reset.sh --config <.ralph-dir> を実行する
# Then:  exit 0, ralph-loop.log が存在しない, ralph-loop-archive-<timestamp>.log が存在する
# ---------------------------------------------------------------------------

@test "reset: archives ralph-loop.log when it exists" {
  # Given: pre-existing ralph-loop.log
  local config_dir="${RATEST_WORKSPACE}/.ralph"
  echo "some log content" > "${config_dir}/ralph-loop.log"

  # fake git to handle tag deletion
  export FAKE_GIT_STDOUT=""
  ralph_autonomous_path_stub "git" "${FAKE_GIT_SRC}"

  # When
  run "${RESET_SCRIPT}" --config "${config_dir}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # original ralph-loop.log is gone
  ralph_autonomous_assert_file_missing "${config_dir}/ralph-loop.log"

  # archive file exists with timestamp suffix
  local archive_count
  archive_count="$(find "${config_dir}" -name 'ralph-loop-archive-*.log' | wc -l | tr -d ' ')"
  [ "${archive_count}" -ge 1 ]
}
