#!/usr/bin/env bats
# runner/meta-loop/test/init-workspace.bats
# Tests for runner/meta-loop/init-workspace.sh
#
# AC-2 (FR-3): EC sample workspace initialization
# AC-3 (FR-3): symlink-based reads reflect harness changes

load "helpers"

INIT_WORKSPACE_SCRIPT="${BATS_TEST_DIRNAME}/../init-workspace.sh"
FIXTURE_SAMPLE_RULE="${BATS_TEST_DIRNAME}/fixtures/sample-rule.md"

# ---------------------------------------------------------------------------
# setup: fake-harness-root に fixture .claude/ と modules/ を配置
# teardown: 不要（bats が BATS_TEST_TMPDIR を自動掃除）
# ---------------------------------------------------------------------------

setup() {
  local harness_root="${BATS_TEST_TMPDIR}/fake-harness-root"
  mkdir -p "${harness_root}/.claude/rules"
  mkdir -p "${harness_root}/modules"

  # AC-3 のテスト用: sample-rule.md を fixture .claude/rules/ に配置
  cp "${FIXTURE_SAMPLE_RULE}" "${harness_root}/.claude/rules/sample-rule.md"

  # 環境変数で上書き
  export META_LOOP_HARNESS_ROOT="${harness_root}"
  export META_LOOP_WORKSPACE_DIR="${harness_root}/workspace/ec-sample"
  export META_LOOP_CLAUDE_SOURCE="${harness_root}/.claude"
  export META_LOOP_MODULES_SOURCE="${harness_root}/modules"
}

# ---------------------------------------------------------------------------
# TC-1 (AC-2): symlink .claude
# Given: fake-harness-root に .claude/ が存在する
# When:  init-workspace.sh を実行する
# Then:  workspace/ec-sample/.claude が symlink として存在し、
#        readlink -f の結果が META_LOOP_CLAUDE_SOURCE を指す
# ---------------------------------------------------------------------------

@test "init-workspace: .claude symlink is created and points to source" {
  # When
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local ws="${META_LOOP_WORKSPACE_DIR}"

  # symlink として存在する
  [ -L "${ws}/.claude" ]

  # readlink -f で実体が META_LOOP_CLAUDE_SOURCE を指す
  local resolved
  resolved="$(readlink -f "${ws}/.claude")"
  local expected
  expected="$(readlink -f "${META_LOOP_CLAUDE_SOURCE}")"
  [ "${resolved}" = "${expected}" ]
}

# ---------------------------------------------------------------------------
# TC-2 (AC-2): symlink modules
# Given: fake-harness-root に modules/ が存在する
# When:  init-workspace.sh を実行する
# Then:  workspace/ec-sample/modules が symlink として存在し、
#        readlink -f の結果が META_LOOP_MODULES_SOURCE を指す
# ---------------------------------------------------------------------------

@test "init-workspace: modules symlink is created and points to source" {
  # When
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local ws="${META_LOOP_WORKSPACE_DIR}"

  # symlink として存在する
  [ -L "${ws}/modules" ]

  # readlink -f で実体が META_LOOP_MODULES_SOURCE を指す
  local resolved
  resolved="$(readlink -f "${ws}/modules")"
  local expected
  expected="$(readlink -f "${META_LOOP_MODULES_SOURCE}")"
  [ "${resolved}" = "${expected}" ]
}

# ---------------------------------------------------------------------------
# TC-3 (AC-2): progress.txt 生成
# Given: workspace/ec-sample が存在しない
# When:  init-workspace.sh を実行する
# Then:  progress.txt が生成され、テンプレートの文字列を含む
# ---------------------------------------------------------------------------

@test "init-workspace: progress.txt is generated with template content" {
  # When
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local progress_file="${META_LOOP_WORKSPACE_DIR}/progress.txt"

  # ファイルが存在する
  [ -f "${progress_file}" ]

  # テンプレートの必須文字列を含む
  meta_loop_assert_file_contains "${progress_file}" "Story-1"
  meta_loop_assert_file_contains "${progress_file}" "Learnings"
}

# ---------------------------------------------------------------------------
# TC-4 (AC-2): .meta-loop-state 初期値
# Given: workspace/ec-sample が存在しない
# When:  init-workspace.sh を実行する
# Then:  .meta-loop-state に consecutive_failures=0 が記録されている
# ---------------------------------------------------------------------------

@test "init-workspace: .meta-loop-state contains consecutive_failures=0" {
  # When
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local state_file="${META_LOOP_WORKSPACE_DIR}/.meta-loop-state"

  # ファイルが存在する
  [ -f "${state_file}" ]

  # consecutive_failures=0 が記録されている
  meta_loop_assert_file_contains "${state_file}" "consecutive_failures=0"
}

# ---------------------------------------------------------------------------
# TC-5 (AC-2): 初期コミット（実 git を使用）
# Given: workspace/ec-sample が存在しない
# When:  init-workspace.sh を実行する（META_LOOP_GIT_BIN 未指定 = 実 git）
# Then:  git log -1 --oneline で "init workspace" を含む初期コミットが取得できる
# ---------------------------------------------------------------------------

@test "init-workspace: initial git commit contains 'init workspace'" {
  # META_LOOP_GIT_BIN は未設定（実 git を使用）
  unset META_LOOP_GIT_BIN || true

  # When
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local ws="${META_LOOP_WORKSPACE_DIR}"

  # git log -1 --oneline で "init workspace" を含む
  run git -C "${ws}" log -1 --oneline
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"init workspace"* ]]
}

# ---------------------------------------------------------------------------
# TC-6 (AC-2): 既存時 --force なし拒否
# Given: META_LOOP_WORKSPACE_DIR が既に存在する
# When:  init-workspace.sh を --force なしで実行する
# Then:  exit 2、stderr にエラーメッセージが出力される
# ---------------------------------------------------------------------------

@test "init-workspace: exits 2 without --force when workspace already exists" {
  # Given: workspace ディレクトリを事前に作成
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"

  # When: --force なしで実行
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 2
  [ "${status}" -eq 2 ]

  # エラーメッセージが出力されている
  [ -n "${output}" ]
}

# ---------------------------------------------------------------------------
# TC-7 (AC-3): symlink 経由読み取り
# Given: fixture .claude/rules/sample-rule.md が存在する
# When:  init-workspace.sh を実行し、workspace 経由でファイルを読む
# Then:  workspace/ec-sample/.claude/rules/sample-rule.md の内容が
#        fixture の内容と一致する
# ---------------------------------------------------------------------------

@test "init-workspace: symlink allows reading .claude/rules/sample-rule.md" {
  # When
  run "${INIT_WORKSPACE_SCRIPT}"

  # Then: exit 0
  [ "${status}" -eq 0 ]

  local via_symlink="${META_LOOP_WORKSPACE_DIR}/.claude/rules/sample-rule.md"
  local original="${META_LOOP_CLAUDE_SOURCE}/rules/sample-rule.md"

  # symlink 経由でファイルが読める
  [ -f "${via_symlink}" ]

  # fixture の内容と一致する
  local content_via_symlink
  content_via_symlink="$(cat "${via_symlink}")"
  local content_original
  content_original="$(cat "${original}")"
  [ "${content_via_symlink}" = "${content_original}" ]
}
