#!/usr/bin/env bash
# runner/meta-loop/test/helpers.bash
# Common test helpers for meta-loop bats tests.
#
# Usage in test files:
#   load "helpers"          (from runner/meta-loop/test/)
#   load "../helpers"       (from runner/meta-loop/test/fixtures/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# meta_loop_setup_tmp_workspace
#
# Creates a temporary workspace directory under BATS_TEST_TMPDIR and exports
# the path as MLTEST_WORKSPACE. BATS auto-cleans BATS_TEST_TMPDIR after each
# test, so no explicit teardown is needed.
# ---------------------------------------------------------------------------
meta_loop_setup_tmp_workspace() {
  local dir="${BATS_TEST_TMPDIR}/workspace-${RANDOM}"
  mkdir -p "${dir}"
  export MLTEST_WORKSPACE="${dir}"
}

# ---------------------------------------------------------------------------
# meta_loop_path_stub <command-name> <stub-script-path>
#
# Copies <stub-script-path> to $BATS_TEST_TMPDIR/stubs/<command-name> with
# executable permissions and prepends the stubs directory to PATH (once).
# ---------------------------------------------------------------------------
meta_loop_path_stub() {
  local cmd_name="$1"
  local stub_src="$2"

  local stubs_dir="${BATS_TEST_TMPDIR}/stubs"
  mkdir -p "${stubs_dir}"
  cp "${stub_src}" "${stubs_dir}/${cmd_name}"
  chmod +x "${stubs_dir}/${cmd_name}"

  # Add stubs dir to PATH only if not already present
  if [[ ":${PATH}:" != *":${stubs_dir}:"* ]]; then
    export PATH="${stubs_dir}:${PATH}"
  fi
}

# ---------------------------------------------------------------------------
# meta_loop_assert_file_contains <file> <substring>
#
# Succeeds if <file> contains <substring>, fails otherwise.
# ---------------------------------------------------------------------------
meta_loop_assert_file_contains() {
  local file="$1"
  local substring="$2"

  if ! grep -qF "${substring}" "${file}"; then
    echo "Expected file '${file}' to contain '${substring}', but it did not." >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# meta_loop_assert_file_missing <file>
#
# Succeeds if <file> does not exist, fails if it does.
# ---------------------------------------------------------------------------
meta_loop_assert_file_missing() {
  local file="$1"

  if [ -e "${file}" ]; then
    echo "Expected file '${file}' to be missing, but it exists." >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# meta_loop_reset_fake_env
#
# Unsets all FAKE_CLAUDE_*, FAKE_TMUX_*, and FAKE_GIT_* environment variables
# used by the fake-* stubs.
# ---------------------------------------------------------------------------
meta_loop_reset_fake_env() {
  unset FAKE_CLAUDE_EXIT_CODE  || true
  unset FAKE_CLAUDE_STDOUT     || true
  unset FAKE_CLAUDE_STDERR     || true
  unset FAKE_CLAUDE_LOG_FILE   || true

  unset FAKE_TMUX_SESSIONS     || true
  unset FAKE_TMUX_LOG_FILE     || true

  unset FAKE_GIT_EXIT_CODE     || true
  unset FAKE_GIT_LOG_FILE      || true
}
