# Getting Started

claude-code-harness をプロジェクトに導入する手順。

## 前提条件

| ツール | バージョン | 確認コマンド |
|--------|----------|------------|
| Git | 任意 | `git --version` |
| Python | 3.9+ | `python3 --version` |
| Copier | 9.0.0+ | `copier --version` |
| Claude Code | 最新 | `claude --version` |

**Copier のインストール:**

```bash
# pipx 推奨
pipx install copier

# pip でもOK
pip install --user copier
```

**オプション（モジュール使用時）:**

| モジュール | 追加の前提条件 |
|-----------|--------------|
| Playwright MCP | Node.js 18+ |
| Figma MCP | Figma アカウント（Dev/Full シート推奨）、初回 OAuth 認証 |

**重要:** このハーネスは**プロジェクトスコープ**（プロジェクトルートの `.claude/`）専用です。ユーザスコープ（`~/.claude/`）には展開しないでください。フックのパス解決がプロジェクトルート基準のため、ユーザスコープでは動作しません。

## インストール

### 方法 1: セットアップスクリプト（推奨）

```bash
cd <your-project>
bash <(curl -fsSL https://raw.githubusercontent.com/sizukutamago/claude-code-harness/main/scripts/setup.sh)
```

スクリプトが以下を行う:
1. Copier の存在確認（なければインストール）
2. モジュール選択（対話式）
3. テンプレート展開
4. .gitignore 設定
5. 前提条件チェック

### 方法 2: 手動

```bash
cd <your-project>
copier copy --trust gh:sizukutamago/claude-code-harness .
```

`--trust` はテンプレートの後処理タスク（空ファイル削除）の実行に必要。

対話で聞かれること:
- `Playwright MCP を使用する？` — ブラウザ操作が必要なら `true`
- `Figma MCP を使用する？` — Figma 参照が必要なら `true`

## セットアップ確認

展開後、以下のファイルが存在することを確認:

```bash
ls -la .claude/
# 期待される出力:
#   agents/     — エージェント定義
#   skills/     — スキル定義
#   rules/      — 常時有効ルール
#   hooks/      — イベント駆動フック
#   harness/    — ランタイムデータ（空）

ls .copier-answers.yml
# Copier のメタデータ（更新時に必要）

# Playwright MCP を選択した場合のみ
ls .mcp.json
```

## Git にコミット

```bash
git add .claude/ .copier-answers.yml .gitignore
# Playwright/Figma を選択した場合
git add .mcp.json
git commit -m 'feat: claude-code-harness 導入'
```

チームメンバーは `git pull` するだけでハーネスが有効になる。

## 使い始める

1. プロジェクトディレクトリで Claude Code を開く
2. `/onboarding` を実行 — ハーネスの使い方を対話的に教えてくれる
3. 実際のタスクで `/requirements` から始める（Normal ワークフロー）

## 更新

ハーネスの新バージョンが出たら:

```bash
# 通常（モジュール選択を再確認）
copier update --trust

# モジュール選択をスキップ（前回の回答を再利用）
copier update --trust --defaults
```

`--defaults` は前回の `.copier-answers.yml` の回答をそのまま使う。新しい質問が追加された場合はデフォルト値が適用される。

3-way merge でプロジェクト固有の変更を保持しつつ更新される。
コンフリクトが発生した場合は `docs/guides/troubleshooting.md` を参照。

## 次のステップ

- [ワークフロー詳細](../../.claude/rules/workflow.md) — 12ステップの適用ルール
- [配布ガイド](distribution-workflow.md) — メンテナー向けの運用手順
- [トラブルシューティング](troubleshooting.md) — よくある問題と解決策
