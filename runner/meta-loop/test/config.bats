#!/usr/bin/env bats
# runner/meta-loop/test/config.bats
# Tests for Task-10: .gitignore and copier.yml _exclude updates.
# AC-8: Copier 配布対象から除外される
# AC-9: .gitignore に workspace/ が追加されている

REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"

# ---------------------------------------------------------------------------
# AC-9: .gitignore に workspace/ が追加されている
# ---------------------------------------------------------------------------

@test "AC-9: .gitignore contains workspace/ entry" {
  grep -qxF "workspace/" "${REPO_ROOT}/.gitignore"
}

@test "AC-9: .gitignore contains runner/meta-loop/vendor/ entry" {
  grep -qxF "runner/meta-loop/vendor/" "${REPO_ROOT}/.gitignore"
}

# ---------------------------------------------------------------------------
# AC-8: copier.yml の _exclude に meta-loop / workspace 除外パターンが含まれる
# ---------------------------------------------------------------------------

@test "AC-8: copier.yml _exclude contains runner/meta-loop" {
  grep -qF '"runner/meta-loop"' "${REPO_ROOT}/copier.yml"
}

@test "AC-8: copier.yml _exclude contains runner/meta-loop/**" {
  grep -qF '"runner/meta-loop/**"' "${REPO_ROOT}/copier.yml"
}

@test "AC-8: copier.yml _exclude contains workspace" {
  grep -qF '"workspace"' "${REPO_ROOT}/copier.yml"
}

@test "AC-8: copier.yml _exclude contains workspace/**" {
  grep -qF '"workspace/**"' "${REPO_ROOT}/copier.yml"
}
