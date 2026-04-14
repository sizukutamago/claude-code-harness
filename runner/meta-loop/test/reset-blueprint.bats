#!/usr/bin/env bats
# runner/meta-loop/test/reset-blueprint.bats
# Tests for runner/meta-loop/reset-blueprint.sh
#
# TC-1: meta-loop-bp session running — exit 2
# TC-2: workspace not found — exit 2
# TC-3: normal reset (archive + init-workspace-blueprint --force)

load "helpers"

RESET_BLUEPRINT_SCRIPT="${BATS_TEST_DIRNAME}/../reset-blueprint.sh"
FAKE_TMUX_FIXTURE="${BATS_TEST_DIRNAME}/fixtures/fake-tmux.sh"

# ---------------------------------------------------------------------------
# setup: shared test environment
#
# - fake-tmux is installed via META_LOOP_TMUX_BIN
# - META_LOOP_WORKSPACE_DIR points to a temp directory
# - META_LOOP_ARCHIVE_ROOT points to a temp directory
# - META_LOOP_INIT_WORKSPACE_BIN is a stub that logs calls
# ---------------------------------------------------------------------------

setup() {
  meta_loop_reset_fake_env

  # Build the fake-init-workspace-blueprint stub
  local stub="${BATS_TEST_TMPDIR}/fake-init-workspace-blueprint.sh"
  cat > "${stub}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${STUB_INIT_LOG_FILE:-}" ]; then
  echo "args: $*" >> "${STUB_INIT_LOG_FILE}"
  echo "workspace: ${META_LOOP_WORKSPACE_DIR:-}" >> "${STUB_INIT_LOG_FILE}"
fi
# Re-create workspace as an empty directory with a .gitignore
mkdir -p "${META_LOOP_WORKSPACE_DIR:-/dev/null}"
touch "${META_LOOP_WORKSPACE_DIR:-/dev/null}/.gitignore"
STUB
  chmod +x "${stub}"

  export META_LOOP_WORKSPACE_DIR="${BATS_TEST_TMPDIR}/ec-sample-blueprint"
  export META_LOOP_ARCHIVE_ROOT="${BATS_TEST_TMPDIR}/archive"
  export META_LOOP_TMUX_BIN="${FAKE_TMUX_FIXTURE}"
  export META_LOOP_INIT_WORKSPACE_BIN="${stub}"
  export META_LOOP_TMUX_SESSION_NAME="meta-loop-bp"
}

# ---------------------------------------------------------------------------
# TC-1: meta-loop-bp session running — exit 2
# Given: fake-tmux reports meta-loop-bp as active
#        workspace dummy exists
# When:  reset-blueprint.sh is executed
# Then:  exit 2, message mentions meta-loop-bp, workspace is untouched
# ---------------------------------------------------------------------------

@test "reset-blueprint: exits 2 when tmux session meta-loop-bp is running" {
  # Given
  export FAKE_TMUX_SESSIONS="meta-loop-bp"
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
  touch "${META_LOOP_WORKSPACE_DIR}/dummy.txt"

  # When
  run "${RESET_BLUEPRINT_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # output contains reference to the session name
  [[ "${output}" == *"meta-loop-bp"* ]] || [[ "${output}" == *"running"* ]] || [[ "${output}" == *"active"* ]]

  # workspace is still at its original location (not moved/removed)
  [ -d "${META_LOOP_WORKSPACE_DIR}" ]
  [ -f "${META_LOOP_WORKSPACE_DIR}/dummy.txt" ]
}

# ---------------------------------------------------------------------------
# TC-2: workspace not found — exit 2
# Given: fake-tmux reports no active sessions
#        workspace directory does not exist
# When:  reset-blueprint.sh is executed
# Then:  exit 2, error message in output
# ---------------------------------------------------------------------------

@test "reset-blueprint: exits 2 when workspace does not exist" {
  # Given
  export FAKE_TMUX_SESSIONS=""
  # META_LOOP_WORKSPACE_DIR is not created

  # When
  run "${RESET_BLUEPRINT_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # error message is present
  [ -n "${output}" ]
}

# ---------------------------------------------------------------------------
# TC-3: normal reset — archive + init-workspace-blueprint --force
# Given: fake-tmux reports no active sessions
#        workspace exists with marker.txt
# When:  reset-blueprint.sh is executed
# Then:  exit 0
#        archive root contains marker.txt under a timestamp subdirectory
#        init-workspace-blueprint stub was called with --force
# ---------------------------------------------------------------------------

@test "reset-blueprint: archives workspace and calls init-workspace-blueprint --force" {
  # Given
  export FAKE_TMUX_SESSIONS=""
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
  touch "${META_LOOP_WORKSPACE_DIR}/marker.txt"

  local stub_log="${BATS_TEST_TMPDIR}/stub-init-bp.log"
  export STUB_INIT_LOG_FILE="${stub_log}"

  # When
  run "${RESET_BLUEPRINT_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # archive root contains marker.txt under some timestamp directory
  local found
  found="$(find "${META_LOOP_ARCHIVE_ROOT}" -name "marker.txt" 2>/dev/null | head -1)"
  [ -n "${found}" ]

  # init-workspace-blueprint stub was called with --force
  [ -f "${stub_log}" ]
  grep -qF -- "--force" "${stub_log}"
}
