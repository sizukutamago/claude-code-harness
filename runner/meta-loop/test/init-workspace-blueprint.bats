#!/usr/bin/env bats
# runner/meta-loop/test/init-workspace-blueprint.bats
# Tests for runner/meta-loop/init-workspace-blueprint.sh
#
# TC-1: normal workspace creation (.claude / modules / .claude-plugin-source symlinks,
#        progress.txt with "EC Sample (Blueprint)" header, git log with init commit)
# TC-2: existing workspace without --force exits 2
# TC-3: --force overwrites existing workspace
# TC-4: symlinks point to real targets

load "helpers"

INIT_WORKSPACE_BLUEPRINT_SCRIPT="${BATS_TEST_DIRNAME}/../init-workspace-blueprint.sh"
FIXTURE_SAMPLE_RULE="${BATS_TEST_DIRNAME}/fixtures/sample-rule.md"

# ---------------------------------------------------------------------------
# setup: fake-harness-root with fixture .claude/, modules/, and vendor/blueprint/
# teardown: not needed (bats auto-cleans BATS_TEST_TMPDIR)
# ---------------------------------------------------------------------------

setup() {
  local harness_root="${BATS_TEST_TMPDIR}/fake-harness-root"
  mkdir -p "${harness_root}/.claude/rules"
  mkdir -p "${harness_root}/modules"
  mkdir -p "${harness_root}/runner/meta-loop/vendor/blueprint"

  # Populate blueprint fixture with a marker file
  echo "blueprint-plugin" > "${harness_root}/runner/meta-loop/vendor/blueprint/README.md"

  # AC TC-4: sample-rule.md for symlink content verification
  cp "${FIXTURE_SAMPLE_RULE}" "${harness_root}/.claude/rules/sample-rule.md"

  # Environment variable overrides
  export META_LOOP_HARNESS_ROOT="${harness_root}"
  export META_LOOP_WORKSPACE_DIR="${harness_root}/workspace/ec-sample-blueprint"
  export META_LOOP_CLAUDE_SOURCE="${harness_root}/.claude"
  export META_LOOP_MODULES_SOURCE="${harness_root}/modules"
  export META_LOOP_BLUEPRINT_SOURCE="${harness_root}/runner/meta-loop/vendor/blueprint"
}

# ---------------------------------------------------------------------------
# TC-1: normal workspace creation
# Given: fake-harness-root with .claude/, modules/, vendor/blueprint/ present
# When:  init-workspace-blueprint.sh is executed
# Then:  exit 0
#        .claude / modules / .claude-plugin-source symlinks created
#        progress.txt contains "EC Sample (Blueprint)"
#        git log -1 --oneline contains "init workspace"
# ---------------------------------------------------------------------------

@test "init-workspace-blueprint: creates workspace with 3 symlinks, progress.txt header, and init commit" {
  # META_LOOP_GIT_BIN uses real git
  unset META_LOOP_GIT_BIN || true

  # When
  run "${INIT_WORKSPACE_BLUEPRINT_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local ws="${META_LOOP_WORKSPACE_DIR}"

  # .claude symlink exists
  [ -L "${ws}/.claude" ]

  # modules symlink exists
  [ -L "${ws}/modules" ]

  # .claude-plugin-source symlink exists
  [ -L "${ws}/.claude-plugin-source" ]

  # progress.txt contains blueprint header
  [ -f "${ws}/progress.txt" ]
  meta_loop_assert_file_contains "${ws}/progress.txt" "EC Sample (Blueprint)"

  # git initial commit
  run git -C "${ws}" log -1 --oneline
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"init workspace"* ]]
}

# ---------------------------------------------------------------------------
# TC-2: existing workspace without --force exits 2
# Given: META_LOOP_WORKSPACE_DIR already exists
# When:  init-workspace-blueprint.sh is executed without --force
# Then:  exit 2, error message in output
# ---------------------------------------------------------------------------

@test "init-workspace-blueprint: exits 2 without --force when workspace already exists" {
  # Given: workspace directory pre-created
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"

  # When: no --force flag
  run "${INIT_WORKSPACE_BLUEPRINT_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # error message is present
  [ -n "${output}" ]
}

# ---------------------------------------------------------------------------
# TC-3: --force overwrites existing workspace
# Given: META_LOOP_WORKSPACE_DIR exists with an old file
# When:  init-workspace-blueprint.sh --force is executed
# Then:  exit 0, old file is gone, new symlinks and progress.txt exist
# ---------------------------------------------------------------------------

@test "init-workspace-blueprint: --force overwrites existing workspace" {
  unset META_LOOP_GIT_BIN || true

  # Given: workspace with an old marker
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
  touch "${META_LOOP_WORKSPACE_DIR}/old-marker.txt"

  # When
  run "${INIT_WORKSPACE_BLUEPRINT_SCRIPT}" --force

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local ws="${META_LOOP_WORKSPACE_DIR}"

  # old marker is gone
  [ ! -f "${ws}/old-marker.txt" ]

  # symlinks are present
  [ -L "${ws}/.claude" ]
  [ -L "${ws}/modules" ]
  [ -L "${ws}/.claude-plugin-source" ]

  # progress.txt was created
  [ -f "${ws}/progress.txt" ]
  meta_loop_assert_file_contains "${ws}/progress.txt" "EC Sample (Blueprint)"
}

# ---------------------------------------------------------------------------
# TC-4: symlinks point to real targets
# Given: fake-harness-root with .claude/, modules/, vendor/blueprint/ present
# When:  init-workspace-blueprint.sh is executed
# Then:  each symlink resolves to the expected source directory
# ---------------------------------------------------------------------------

@test "init-workspace-blueprint: all symlinks resolve to expected source directories" {
  unset META_LOOP_GIT_BIN || true

  # When
  run "${INIT_WORKSPACE_BLUEPRINT_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local ws="${META_LOOP_WORKSPACE_DIR}"

  # .claude resolves to META_LOOP_CLAUDE_SOURCE
  local resolved_claude
  resolved_claude="$(readlink -f "${ws}/.claude")"
  local expected_claude
  expected_claude="$(readlink -f "${META_LOOP_CLAUDE_SOURCE}")"
  [ "${resolved_claude}" = "${expected_claude}" ]

  # modules resolves to META_LOOP_MODULES_SOURCE
  local resolved_modules
  resolved_modules="$(readlink -f "${ws}/modules")"
  local expected_modules
  expected_modules="$(readlink -f "${META_LOOP_MODULES_SOURCE}")"
  [ "${resolved_modules}" = "${expected_modules}" ]

  # .claude-plugin-source resolves to META_LOOP_BLUEPRINT_SOURCE
  local resolved_bp
  resolved_bp="$(readlink -f "${ws}/.claude-plugin-source")"
  local expected_bp
  expected_bp="$(readlink -f "${META_LOOP_BLUEPRINT_SOURCE}")"
  [ "${resolved_bp}" = "${expected_bp}" ]
}
