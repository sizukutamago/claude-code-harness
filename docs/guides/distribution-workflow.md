# ハーネス配布・更新ワークフロー

ハーネスの配布・更新は Copier テンプレート方式で行う。

## 登場人物

- **ハーネスリポジトリ** (claude-code-harness) — テンプレートのソース
- **導入先プロジェクト** (kondate 等) — ハーネスを使うプロジェクト
- **メンテナー** — ハーネス管理者
- **チームメンバー** — プロジェクトの開発者

## パターン一覧

| パターン | 誰が実行 | Copier 使用 | チームメンバーの作業 |
|---|---|---|---|
| 初回導入 | メンテナー | `copier copy` | `git pull` |
| core 更新 | メンテナー | `copier update` | `git pull` |
| 新モジュール追加 | メンテナー | `copier update` | `git pull` |
| プロジェクト固有カスタマイズ | 誰でも | 不要 | `git pull` |
| ハーネスへの還元 | メンテナー | harness-contribute スキル | なし |
| コンフリクト解決 | メンテナー | `copier update` | `git pull` |

**チームメンバーがやることは常に `git pull` だけ。Copier に触るのはメンテナーのみ。**

## パターン1: 初回導入

新しいプロジェクトにハーネスを入れるとき。

```bash
# メンテナー
cd /path/to/project
copier copy gh:sizukutamago/claude-code-harness .
# → 質問に答える（プロジェクト名、使用モジュールの選択）

git add .claude/ .mcp.json .copier-answers.yml
git commit -m "feat: ハーネス導入"
git push
```

```bash
# チームメンバー
git pull
# → .claude/ が展開済み。そのまま使える
```

### 導入後のディレクトリ構成

```
project/
  .claude/
    agents/          ← core + 選択モジュールのエージェント
    skills/          ← core + 選択モジュールのスキル
    rules/           ← core のルール
    hooks/           ← core のフック
  .mcp.json          ← 選択モジュールの MCP 設定（マージ済み）
  .copier-answers.yml ← メタデータ（バージョン、選択モジュール）
  CLAUDE.md          ← プロジェクト既存（上書きしない）
```

## パターン2: ハーネスの core が更新された

ハーネス側でルール改善、エージェント追加、スキル修正などがあったとき。

```bash
# メンテナー
cd /path/to/project
copier update
# → 3-way merge でプロジェクト固有の変更は保持

# コンフリクトがあれば解決
git add .claude/ .copier-answers.yml
git commit -m "chore: ハーネス更新 (vX.Y.Z)"
git push
```

```bash
# チームメンバー
git pull
```

## パターン3: ハーネスに新しいモジュールが追加された

ハーネス側に新モジュール（例: supabase-mcp）が追加されたとき。

```bash
# メンテナー
cd /path/to/project
copier update
# → modules の選択肢に新モジュールが表示される
#   modules: (前回: [playwright-mcp, figma-mcp])
#     [x] playwright-mcp
#     [x] figma-mcp
#     [ ] supabase-mcp    ← NEW
# → 必要なら選択、不要ならそのまま

git add .claude/ .copier-answers.yml
git commit -m "chore: ハーネス更新 + supabase-mcp モジュール追加"
git push
```

```bash
# チームメンバー
git pull
```

## パターン4: プロジェクト固有のカスタマイズ

プロジェクト独自のルールやエージェントを追加したいとき。Copier は関与しない。

```bash
# メンテナーまたはチームメンバー
vim .claude/rules/my-project-rule.md
git add .claude/rules/my-project-rule.md
git commit -m "feat: プロジェクト固有ルール追加"
git push
```

```bash
# 他のメンバー
git pull
```

次回の `copier update` でもこのファイルは保持される（3-way merge）。

## パターン5: プロジェクトの改善をハーネスに還元

振り返りで「これは他プロジェクトでも使える」と判断したとき。

### 手動フロー

```bash
# メンテナー: ハーネスリポジトリで feature branch を作成
cd /path/to/claude-code-harness
git checkout -b improve/better-testing-rule

# .claude/ 内の対応ファイルを修正
vim .claude/rules/testing.md

# 導入先プロジェクトでテスト（マージ前に検証）
cd /path/to/project
copier update --vcs-ref improve/better-testing-rule

# 問題なければ PR
cd /path/to/claude-code-harness
gh pr create --title "Improve testing rule"
```

### 自動フロー（harness-contribute スキル）

```
メンテナー: 「.claude/rules/testing.md の改善をハーネスに還元して」
Claude Code:
  1. .copier-answers.yml からハーネスリポジトリを特定
  2. プロジェクト側の変更内容を読む
  3. ハーネスリポジトリで feature branch 作成
  4. .claude/ 内の対応ファイルに変更を適用
  5. copier update --vcs-ref でテスト適用
  6. PR を作成
メンテナー: PR をレビュー・マージ
```

マージ後は **パターン2** の流れで各プロジェクトに反映。

## パターン6: プロジェクト固有のカスタマイズとハーネス更新がコンフリクト

ハーネス側で変更したファイルを、プロジェクト側でも独自に変更していた場合。

```bash
# メンテナー
cd /path/to/project
copier update
# → inline conflict markers が出る
#   <<<<<<< BEFORE (project)
#   プロジェクト側の変更
#   =======
#   ハーネス側の変更
#   >>>>>>> AFTER (template)

# IDE のマージツール等でコンフリクト解決
git add .claude/ .copier-answers.yml
git commit -m "chore: ハーネス更新（コンフリクト解決）"
git push
```

```bash
# チームメンバー
git pull
```

## 技術的な前提

- **Copier のインストール**: メンテナーのみ必要。`pip install copier` または `pipx install copier`
- **Node.js 18+**: Playwright MCP モジュール使用時に必要
- **Git タグ**: ハーネスリポジトリはリリースごとに Git タグ（v1.0.0 等）を付ける。Copier はタグベースでバージョン追跡する
- **`.copier-answers.yml`**: 必ず git 管理する。これがないと `copier update` でバージョン追跡できない
