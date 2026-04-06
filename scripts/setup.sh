#!/usr/bin/env bash
set -euo pipefail

# claude-code-harness setup script
# Usage: curl -fsSL <raw-url>/scripts/setup.sh | bash
#   or:  bash scripts/setup.sh (from harness repo)

HARNESS_REPO="gh:sizukutamago/claude-code-harness"

echo "=== claude-code-harness セットアップ ==="
echo ""

# --- 0. 前提条件チェック ---
errors=0

if ! command -v git &> /dev/null; then
  echo "ERROR: git が見つかりません。先にインストールしてください。"
  errors=$((errors + 1))
fi

if ! command -v copier &> /dev/null; then
  echo "Copier が見つかりません。インストールします..."
  if command -v pipx &> /dev/null; then
    pipx install copier
  elif command -v pip &> /dev/null; then
    pip install --user copier
  else
    echo "ERROR: pip または pipx が必要です。先にインストールしてください。"
    echo "  推奨: https://pipx.pypa.io/ をインストールし、pipx install copier"
    errors=$((errors + 1))
  fi
fi

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "前提条件が満たされていません。上記のエラーを解決してから再実行してください。"
  exit 1
fi

# Copier バージョン確認
COPIER_VERSION=$(copier --version 2>/dev/null || echo "unknown")
echo "Copier $COPIER_VERSION"
echo ""

# --- 1. モジュール説明 ---
echo "=== 利用可能なモジュール ==="
echo ""
echo "  playwright-mcp  — ブラウザ操作・画面確認"
echo "                    Claude がブラウザを操作・観察できるようにする"
echo "                    用途: 要件理解時の画面確認、実装中の動作確認、E2Eテスト作成"
echo "                    前提: Node.js 18+"
echo ""
echo "  figma-mcp       — Figma 参照・編集"
echo "                    Claude が Figma ファイルの参照・編集を行えるようにする"
echo "                    用途: デザイン参照、コンポーネント確認、デザインシステム操作"
echo "                    前提: Figma アカウント（Dev/Full シート推奨）、OAuth 認証"
echo ""
echo "Copier の対話で使用するモジュールを選択できます。"
echo ""

# --- 2. copier copy 実行 ---
echo "=== ハーネス導入 ==="
if ! copier copy --trust "$HARNESS_REPO" .; then
  echo ""
  echo "ERROR: copier copy が失敗しました。"
  echo "よくある原因:"
  echo "  - ネットワーク接続の問題"
  echo "  - GitHub へのアクセス権限"
  echo "  - Copier のバージョンが古い（9.0.0+ が必要）"
  echo "詳細: docs/guides/troubleshooting.md"
  exit 1
fi

echo ""

# --- 3. 展開結果の検証 ---
if [ ! -d .claude/skills ] || [ ! -d .claude/agents ] || [ ! -d .claude/rules ]; then
  echo "ERROR: テンプレート展開が不完全です。.claude/ 配下に必要なディレクトリが見つかりません。"
  echo "copier copy を再実行してください。"
  exit 1
fi

# --- 4. 後続セットアップ ---
echo "=== 後続セットアップ ==="

# .gitignore に .claude/harness/ を追加
if [ -f .gitignore ]; then
  if ! grep -q '.claude/harness/' .gitignore; then
    echo "" >> .gitignore
    echo "# Harness runtime data" >> .gitignore
    echo ".claude/harness/" >> .gitignore
    echo "  .gitignore に .claude/harness/ を追加しました"
  else
    echo "  .gitignore に .claude/harness/ は既に含まれています"
  fi
else
  echo "# Harness runtime data" > .gitignore
  echo ".claude/harness/" >> .gitignore
  echo "  .gitignore を作成し .claude/harness/ を追加しました"
fi

# Node.js チェック（Playwright MCP 選択時）
if [ -f .mcp.json ] && grep -q "playwright" .mcp.json 2>/dev/null; then
  if command -v node &> /dev/null; then
    NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
      echo "  WARNING: Playwright MCP には Node.js 18+ が必要です（現在: $(node -v)）"
    else
      echo "  Node.js $(node -v) — Playwright MCP の前提条件OK"
    fi
  else
    echo "  WARNING: Node.js が見つかりません。Playwright MCP には Node.js 18+ が必要です"
  fi
fi

# Figma 認証チェック
if [ -f .mcp.json ] && grep -q "figma" .mcp.json 2>/dev/null; then
  echo "  Figma MCP を選択しました。初回使用時にブラウザで OAuth 認証が必要です"
fi

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo "  1. git add .claude/ .copier-answers.yml .gitignore"
if [ -f .mcp.json ]; then
  echo "     git add .mcp.json"
fi
echo "  2. git commit -m 'feat: claude-code-harness 導入'"
echo "  3. Claude Code を開いて /onboarding を実行"
echo ""
echo "ハーネス更新時: copier update"
