#!/usr/bin/env bash
set -euo pipefail

# claude-code-harness setup script
# Usage: curl -fsSL <raw-url>/scripts/setup.sh | bash
#   or:  bash scripts/setup.sh (from harness repo)

HARNESS_REPO="gh:sizukutamago/claude-code-harness"

echo "=== claude-code-harness セットアップ ==="
echo ""

# --- 1. Copier チェック ---
if ! command -v copier &> /dev/null; then
  echo "Copier が見つかりません。インストールします..."
  if command -v pipx &> /dev/null; then
    pipx install copier
  elif command -v pip &> /dev/null; then
    pip install --user copier
  else
    echo "ERROR: pip または pipx が必要です。先にインストールしてください。"
    exit 1
  fi
fi

echo "Copier $(copier --version)"
echo ""

# --- 2. モジュール説明 ---
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

# --- 3. copier copy 実行 ---
echo "=== ハーネス導入 ==="
copier copy --trust "$HARNESS_REPO" .

echo ""

# --- 4. 後続セットアップ ---
echo "=== 後続セットアップ ==="

# .gitignore に .claude/harness/ を追加
if [ -f .gitignore ]; then
  if ! grep -q '.claude/harness/' .gitignore; then
    echo "" >> .gitignore
    echo "# Harness runtime data" >> .gitignore
    echo ".claude/harness/" >> .gitignore
    echo "✓ .gitignore に .claude/harness/ を追加しました"
  else
    echo "✓ .gitignore に .claude/harness/ は既に含まれています"
  fi
else
  echo "# Harness runtime data" > .gitignore
  echo ".claude/harness/" >> .gitignore
  echo "✓ .gitignore を作成し .claude/harness/ を追加しました"
fi

# Node.js チェック（Playwright MCP 選択時）
if [ -f .mcp.json ] && grep -q "playwright" .mcp.json 2>/dev/null; then
  if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
      echo "⚠ Playwright MCP には Node.js 18+ が必要です（現在: $(node -v)）"
    else
      echo "✓ Node.js $(node -v) — Playwright MCP の前提条件を満たしています"
    fi
  else
    echo "⚠ Node.js が見つかりません。Playwright MCP には Node.js 18+ が必要です"
  fi
fi

# Figma 認証チェック
if [ -f .mcp.json ] && grep -q "figma" .mcp.json 2>/dev/null; then
  echo "⚠ Figma MCP を選択しました。初回使用時にブラウザで OAuth 認証が必要です"
fi

echo ""
echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo "  1. git add .claude/ .mcp.json .copier-answers.yml .gitignore"
echo "  2. git commit -m 'feat: claude-code-harness 導入'"
echo "  3. チームメンバーは git pull するだけで使えます"
echo ""
echo "ハーネス更新時: copier update"
