#!/usr/bin/env bats
# runner/meta-loop/test/bootstrap.bats
# Tests for runner/meta-loop/bootstrap.sh — vendor/ralph git clone setup.
#
# AC-1 (FR-1): first-time clone via fake-git stub
# AC-1 (FR-1 idempotency): skip clone when vendor/ralph already exists
# AC-1 (FR-1 error): exit 2 when git is not in PATH
# AC-1 (FR-1 error): exit 2 when clone fails

load "helpers"

BOOTSTRAP_SCRIPT="${BATS_TEST_DIRNAME}/../bootstrap.sh"
FAKE_GIT_SRC="${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

setup() {
  meta_loop_reset_fake_env
}

# ---------------------------------------------------------------------------
# TC-1 (AC-1): first-time clone
# Given: vendor/ralph does not exist
# When:  bootstrap.sh runs with fake-git stub
# Then:  exit 0, fake-git log records "clone --depth 1 <url> <target>"
# ---------------------------------------------------------------------------

@test "bootstrap: first clone invokes git clone and exits 0" {
  # Given
  local log_file="${BATS_TEST_TMPDIR}/git-calls.log"
  local target_dir="${BATS_TEST_TMPDIR}/vendor/ralph"

  export FAKE_GIT_LOG_FILE="${log_file}"
  export META_LOOP_BOOTSTRAP_TARGET_DIR="${target_dir}"
  meta_loop_path_stub git "${FAKE_GIT_SRC}"

  # vendor/ralph does not exist
  [ ! -d "${target_dir}" ]

  # When
  run "${BOOTSTRAP_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # fake-git log records a clone call with expected arguments.
  # fake-git writes args tab-separated, so check each token independently.
  [ -f "${log_file}" ]
  grep -q "clone" "${log_file}"
  grep -q -- "--depth" "${log_file}"
  grep -q "https://github.com/snarktank/ralph.git" "${log_file}"
  grep -q "${target_dir}" "${log_file}"
}

# ---------------------------------------------------------------------------
# TC-2 (AC-1 idempotency): existing vendor/ralph is skipped
# Given: META_LOOP_BOOTSTRAP_TARGET_DIR points to an already existing directory
# When:  bootstrap.sh runs
# Then:  exit 0, no git clone call, warning in stderr
# ---------------------------------------------------------------------------

@test "bootstrap: idempotent — skips clone when vendor/ralph already exists, exits 0" {
  # Given
  local log_file="${BATS_TEST_TMPDIR}/git-calls.log"
  local target_dir="${BATS_TEST_TMPDIR}/vendor/ralph"

  # pre-create the target directory (simulate existing state)
  mkdir -p "${target_dir}"

  export FAKE_GIT_LOG_FILE="${log_file}"
  export META_LOOP_BOOTSTRAP_TARGET_DIR="${target_dir}"
  meta_loop_path_stub git "${FAKE_GIT_SRC}"

  # When
  run "${BOOTSTRAP_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # git clone must NOT have been called
  if [ -f "${log_file}" ]; then
    ! grep -q "clone" "${log_file}"
  fi

  # output (stdout+stderr combined by bats run) contains a skip/warning message
  [ -n "${output}" ]
}

# ---------------------------------------------------------------------------
# TC-3 (AC-1 error): git not in PATH
# Given: PATH contains no git binary
# When:  bootstrap.sh runs
# Then:  exit 2, output contains "git" in error message
# ---------------------------------------------------------------------------

@test "bootstrap: git not in PATH exits 2 with error message" {
  # Given: PATH restricted to /bin only — git lives in /usr/bin on macOS,
  # so /bin is sufficient for bash builtins and shebang resolution while
  # keeping git invisible.
  local target_dir="${BATS_TEST_TMPDIR}/vendor/ralph"
  export META_LOOP_BOOTSTRAP_TARGET_DIR="${target_dir}"
  export PATH="/bin"

  # When
  run "${BOOTSTRAP_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # error message mentions git
  [ -n "${output}" ]
  [[ "${output}" == *"git"* ]]
}

# ---------------------------------------------------------------------------
# TC-4 (AC-1 error): clone failure is normalized to exit 2
# Given: fake-git returns exit code 128
# When:  bootstrap.sh runs
# Then:  exit 2 (bootstrap normalizes the failure code)
# ---------------------------------------------------------------------------

@test "bootstrap: clone failure is normalized to exit 2" {
  # Given
  local target_dir="${BATS_TEST_TMPDIR}/vendor/ralph"
  export FAKE_GIT_EXIT_CODE=128
  export META_LOOP_BOOTSTRAP_TARGET_DIR="${target_dir}"
  meta_loop_path_stub git "${FAKE_GIT_SRC}"

  # vendor/ralph does not exist
  [ ! -d "${target_dir}" ]

  # When
  run "${BOOTSTRAP_SCRIPT}"

  # Then: exit 2 (not 128)
  [ "${status}" -eq 2 ]
}
