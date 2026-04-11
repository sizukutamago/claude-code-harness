#!/usr/bin/env bash
# runner/meta-loop/init-workspace.sh
# Initialize the EC sample workspace for meta-loop operation.
#
# Usage:
#   init-workspace.sh [--force]
#
# Exit codes:
#   0 - success
#   1 - argument error
#   2 - precondition error (workspace already exists without --force)

set -euo pipefail

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# Environment variable overrides (for testability)
# ---------------------------------------------------------------------------

META_LOOP_HARNESS_ROOT="${META_LOOP_HARNESS_ROOT:-${SCRIPT_DIR}/../..}"
# Resolve to absolute path
META_LOOP_HARNESS_ROOT="$(cd "${META_LOOP_HARNESS_ROOT}" && pwd)"

META_LOOP_WORKSPACE_DIR="${META_LOOP_WORKSPACE_DIR:-${META_LOOP_HARNESS_ROOT}/workspace/ec-sample}"
META_LOOP_CLAUDE_SOURCE="${META_LOOP_CLAUDE_SOURCE:-${META_LOOP_HARNESS_ROOT}/.claude}"
META_LOOP_MODULES_SOURCE="${META_LOOP_MODULES_SOURCE:-${META_LOOP_HARNESS_ROOT}/modules}"
META_LOOP_GIT_BIN="${META_LOOP_GIT_BIN:-git}"

# ---------------------------------------------------------------------------
# _parse_args
# ---------------------------------------------------------------------------

_parse_args() {
  FORCE=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)
        FORCE=1
        shift
        ;;
      *)
        echo "Unknown argument: $1" >&2
        echo "Usage: init-workspace.sh [--force]" >&2
        exit 1
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# _check_existing
# ---------------------------------------------------------------------------

_check_existing() {
  if [ -d "${META_LOOP_WORKSPACE_DIR}" ] || [ -L "${META_LOOP_WORKSPACE_DIR}" ]; then
    if [ "${FORCE}" -eq 1 ]; then
      rm -rf "${META_LOOP_WORKSPACE_DIR}"
    else
      echo "Error: workspace already exists: ${META_LOOP_WORKSPACE_DIR}" >&2
      echo "Use --force to overwrite." >&2
      exit 2
    fi
  fi
}

# ---------------------------------------------------------------------------
# _create_workspace
# ---------------------------------------------------------------------------

_create_workspace() {
  mkdir -p "${META_LOOP_WORKSPACE_DIR}"
}

# ---------------------------------------------------------------------------
# _create_symlinks
# ---------------------------------------------------------------------------

_create_symlinks() {
  ln -sf "${META_LOOP_CLAUDE_SOURCE}" "${META_LOOP_WORKSPACE_DIR}/.claude"
  ln -sf "${META_LOOP_MODULES_SOURCE}" "${META_LOOP_WORKSPACE_DIR}/modules"
}

# ---------------------------------------------------------------------------
# _create_progress_txt
# ---------------------------------------------------------------------------

_create_progress_txt() {
  cat > "${META_LOOP_WORKSPACE_DIR}/progress.txt" <<'EOF'
# Project: EC Sample

## Stories (TODO)
- [ ] Story-1: プロジェクト初期化（package.json, tsconfig, lint, test setup）
- [ ] Story-2: 認証スキャフォールド（登録・ログイン・セッション）
- [ ] Story-3: 商品モデル + 在庫管理
- [ ] Story-4: 商品一覧 API + UI
- [ ] Story-5: 商品詳細ページ
- [ ] Story-6: カート機能
- [ ] Story-7: 注文作成フロー
- [ ] Story-8: 決済シミュレーション（外部決済呼び出しのモック）
- [ ] Story-9: 注文履歴 UI
- [ ] Story-10: 管理画面（在庫更新）

## Stories (DONE)

## Learnings
EOF
}

# ---------------------------------------------------------------------------
# _create_state_file
# ---------------------------------------------------------------------------

_create_state_file() {
  echo "consecutive_failures=0" > "${META_LOOP_WORKSPACE_DIR}/.meta-loop-state"
}

# ---------------------------------------------------------------------------
# _git_with_identity <args...>
#
# Runs META_LOOP_GIT_BIN in META_LOOP_WORKSPACE_DIR with a fixed commit
# identity so the initial commit does not depend on the user's git config.
# ---------------------------------------------------------------------------

_git_with_identity() {
  "${META_LOOP_GIT_BIN}" \
    -C "${META_LOOP_WORKSPACE_DIR}" \
    -c user.email=meta-loop@example.local \
    -c user.name=meta-loop \
    "$@"
}

# ---------------------------------------------------------------------------
# _init_git_repo
# ---------------------------------------------------------------------------

_init_git_repo() {
  # Initialize the repository
  "${META_LOOP_GIT_BIN}" init "${META_LOOP_WORKSPACE_DIR}" >/dev/null 2>&1

  # Minimal .gitignore
  cat > "${META_LOOP_WORKSPACE_DIR}/.gitignore" <<'EOF'
node_modules/
dist/
EOF

  # Stage and commit all initial files
  _git_with_identity add .          >/dev/null 2>&1
  _git_with_identity commit -m "init workspace" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

main() {
  _parse_args "$@"
  _check_existing
  _create_workspace
  _create_symlinks
  _create_progress_txt
  _create_state_file
  _init_git_repo
}

main "$@"
