#!/usr/bin/env bats
# runner/meta-loop/test/bootstrap-blueprint.bats
# Tests for runner/meta-loop/bootstrap-blueprint.sh
#
# TC-1: first-time clone via fake-git stub
# TC-2: target existing — idempotent skip (warning + exit 0)
# TC-3: git not in PATH — exit 2
# TC-4: clone failure — exit 2

load "helpers"

BOOTSTRAP_BLUEPRINT_SCRIPT="${BATS_TEST_DIRNAME}/../bootstrap-blueprint.sh"
FAKE_GIT_SRC="${BATS_TEST_DIRNAME}/fixtures/fake-git.sh"

setup() {
  meta_loop_reset_fake_env
}

# ---------------------------------------------------------------------------
# TC-1: first-time clone
# Given: vendor/blueprint does not exist
# When:  bootstrap-blueprint.sh runs with fake-git stub
# Then:  exit 0, fake-git log records "clone --depth 1 <url> <target>"
# ---------------------------------------------------------------------------

@test "bootstrap-blueprint: first clone invokes git clone and exits 0" {
  # Given
  local log_file="${BATS_TEST_TMPDIR}/git-calls.log"
  local target_dir="${BATS_TEST_TMPDIR}/vendor/blueprint"

  export FAKE_GIT_LOG_FILE="${log_file}"
  export META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR="${target_dir}"
  meta_loop_path_stub git "${FAKE_GIT_SRC}"

  # vendor/blueprint does not exist
  [ ! -d "${target_dir}" ]

  # When
  run "${BOOTSTRAP_BLUEPRINT_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  # fake-git log records a clone call with expected arguments
  [ -f "${log_file}" ]
  grep -q "clone" "${log_file}"
  grep -q -- "--depth" "${log_file}"
  grep -q "https://github.com/sizukutamago/blueprint-plugin.git" "${log_file}"
  grep -q "${target_dir}" "${log_file}"
}

# ---------------------------------------------------------------------------
# TC-2: existing vendor/blueprint is skipped (idempotent)
# Given: META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR points to an existing directory
# When:  bootstrap-blueprint.sh runs
# Then:  exit 0, no git clone call, warning in stderr
# ---------------------------------------------------------------------------

@test "bootstrap-blueprint: idempotent — skips clone when vendor/blueprint already exists, exits 0" {
  # Given
  local log_file="${BATS_TEST_TMPDIR}/git-calls.log"
  local target_dir="${BATS_TEST_TMPDIR}/vendor/blueprint"

  # pre-create the target directory (simulate existing state)
  mkdir -p "${target_dir}"

  export FAKE_GIT_LOG_FILE="${log_file}"
  export META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR="${target_dir}"
  meta_loop_path_stub git "${FAKE_GIT_SRC}"

  # When
  run "${BOOTSTRAP_BLUEPRINT_SCRIPT}"

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
# TC-3: git not in PATH — exit 2
# Given: PATH contains no git binary
# When:  bootstrap-blueprint.sh runs
# Then:  exit 2, output contains "git" in error message
# ---------------------------------------------------------------------------

@test "bootstrap-blueprint: git not in PATH exits 2 with error message" {
  # Given: PATH restricted to /bin only
  local target_dir="${BATS_TEST_TMPDIR}/vendor/blueprint"
  export META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR="${target_dir}"
  export PATH="/bin"

  # When
  run "${BOOTSTRAP_BLUEPRINT_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # error message mentions git
  [ -n "${output}" ]
  [[ "${output}" == *"git"* ]]
}

# ---------------------------------------------------------------------------
# TC-4: clone failure is normalized to exit 2
# Given: fake-git returns exit code 128
# When:  bootstrap-blueprint.sh runs
# Then:  exit 2 (bootstrap normalizes the failure code)
# ---------------------------------------------------------------------------

@test "bootstrap-blueprint: clone failure is normalized to exit 2" {
  # Given
  local target_dir="${BATS_TEST_TMPDIR}/vendor/blueprint"
  export FAKE_GIT_EXIT_CODE=128
  export META_LOOP_BOOTSTRAP_BLUEPRINT_TARGET_DIR="${target_dir}"
  meta_loop_path_stub git "${FAKE_GIT_SRC}"

  # vendor/blueprint does not exist
  [ ! -d "${target_dir}" ]

  # When
  run "${BOOTSTRAP_BLUEPRINT_SCRIPT}"

  # Then: exit 2 (not 128)
  [ "${status}" -eq 2 ]
}
