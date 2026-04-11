#!/usr/bin/env bats
# runner/meta-loop/test/archive.bats
# Tests for runner/meta-loop/lib/archive.sh — archive_workspace function.

load "helpers"

ARCHIVE_LIB="${BATS_TEST_DIRNAME}/../lib/archive.sh"

setup() {
  # shellcheck source=../lib/archive.sh
  source "${ARCHIVE_LIB}"
  meta_loop_setup_tmp_workspace
}

# ---------------------------------------------------------------------------
# AC-TC-1: 正常退避 — workspace が archive-root/<ts>/ に移動する
# ---------------------------------------------------------------------------

@test "archive_workspace moves workspace to archive-root/<timestamp>/ and workspace is gone" {
  local archive_root="${BATS_TEST_TMPDIR}/archive"

  # Given: workspace exists with a file
  touch "${MLTEST_WORKSPACE}/README.md"

  # When: archive_workspace is called
  run archive_workspace "${MLTEST_WORKSPACE}" "${archive_root}"

  # Then: exit 0
  [ "${status}" -eq 0 ]
  # workspace no longer exists at original path
  [ ! -e "${MLTEST_WORKSPACE}" ]
  # archive-root was created
  [ -d "${archive_root}" ]
  # stdout is the destination path
  [ -n "${output}" ]
  # destination directory exists
  [ -d "${output}" ]
}

# ---------------------------------------------------------------------------
# AC-TC-2: ファイル揃い — サブファイルが退避先に揃う
# ---------------------------------------------------------------------------

@test "archive_workspace preserves subdirectory structure and files in archive destination" {
  local archive_root="${BATS_TEST_TMPDIR}/archive"

  # Given: workspace with nested files
  mkdir -p "${MLTEST_WORKSPACE}/src"
  echo '{}' > "${MLTEST_WORKSPACE}/package.json"
  echo 'export {}' > "${MLTEST_WORKSPACE}/src/index.ts"

  # When
  run archive_workspace "${MLTEST_WORKSPACE}" "${archive_root}"

  [ "${status}" -eq 0 ]
  local dest="${output}"

  # Then: all files are present at destination
  [ -f "${dest}/package.json" ]
  [ -f "${dest}/src/index.ts" ]
}

# ---------------------------------------------------------------------------
# AC-TC-3: タイムスタンプ衝突時の suffix — 2回目は <ts>-1/ になる
# ---------------------------------------------------------------------------

@test "archive_workspace appends -1 suffix when timestamp directory already exists" {
  local archive_root="${BATS_TEST_TMPDIR}/archive"

  # Given: a directory at <archive_root>/<ts> already exists (simulate collision)
  # We create it manually with the same timestamp format that archive_workspace would use
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "${archive_root}/${ts}"

  # workspace to archive
  touch "${MLTEST_WORKSPACE}/file.txt"

  # When
  run archive_workspace "${MLTEST_WORKSPACE}" "${archive_root}"

  [ "${status}" -eq 0 ]
  local dest="${output}"

  # Then: destination ends with -1
  [[ "${dest}" == *"-1" ]]
  [ -d "${dest}" ]
  [ -f "${dest}/file.txt" ]
}

# ---------------------------------------------------------------------------
# AC-TC-4: workspace 不在時のエラー — 非 0 終了 + stderr にメッセージ
# ---------------------------------------------------------------------------

@test "archive_workspace exits non-zero and prints error to stderr when workspace does not exist" {
  local archive_root="${BATS_TEST_TMPDIR}/archive"
  local nonexistent="${BATS_TEST_TMPDIR}/no-such-workspace"

  # When
  run archive_workspace "${nonexistent}" "${archive_root}"

  # Then: non-zero exit
  [ "${status}" -ne 0 ]
  # stderr contains an error message (bats captures combined output in $output when using run)
  # We use --separate-stderr not available in bats 1.x; check lines for error hint
  [ -n "${output}" ]
}
