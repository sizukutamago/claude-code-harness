# トラブルシューティング

## セットアップ

### `copier copy` が失敗する

**症状:** `copier copy gh:sizukutamago/claude-code-harness .` がエラーで終了する

**原因と対処:**

| 原因 | エラーメッセージ | 対処 |
|------|----------------|------|
| Copier が古い | `_min_copier_version` エラー | `pipx upgrade copier` で 9.0.0+ にアップグレード |
| ネットワーク | `git clone` 失敗 | GitHub へのアクセスを確認。プロキシ環境なら `git config --global http.proxy` を設定 |
| 既存ファイルの競合 | `.copier-answers.yml already exists` | 初回導入なら削除して再実行。更新なら `copier update --trust` を使用 |
| Git リポジトリでない | `not a git repository` | `git init` してから再実行 |

### .claude/ が展開されない

**確認:** `ls .claude/skills/ .claude/agents/ .claude/rules/`

展開されていない場合:
1. `.copier-answers.yml` が存在するか確認
2. 存在しなければ `copier copy` が途中で失敗している。エラーメッセージを確認
3. 存在すれば `copier copy --trust gh:sizukutamago/claude-code-harness .` を再実行

## copier update（ハーネス更新）

### マージコンフリクトが発生する

**症状:** `copier update` 後に `.claude/` 内のファイルにコンフリクトマーカーが残る

**対処:**
1. `git diff` でコンフリクト箇所を確認
2. プロジェクト固有の変更（カスタムルール等）を保持しつつ、ハーネス側の更新を取り込む
3. 基本方針: ハーネス側の構造変更を優先し、プロジェクト固有の内容は追記で対応

### 更新後にスキルが動かない

**確認:**
```bash
# スキルファイルの存在確認
ls .claude/skills/*/SKILL.md

# フロントマターの確認（name, description が必要）
head -5 .claude/skills/tdd/SKILL.md
```

フロントマターが壊れている場合は `copier update --force` で上書き（プロジェクト固有の変更は失われる）。

## モジュール

### Playwright MCP が動かない

**症状:** ブラウザ操作スキルがエラーになる

**確認手順:**
1. Node.js 18+ か確認: `node -v`
2. `.mcp.json` に playwright 設定があるか確認: `cat .mcp.json`
3. `npx @playwright/mcp@latest` が手動で動くか確認

**よくある原因:**
- Node.js のバージョンが古い → nvm 等でアップグレード
- `.mcp.json` がない → `copier update --trust` で再生成（Playwright MCP を `true` に）
- バイナリのインストール失敗 → `npx playwright install` を手動実行

### Figma MCP の OAuth 認証が通らない

**症状:** Figma 操作時に認証エラー

**対処:**
1. ブラウザで Figma にログインしていることを確認
2. Claude Code を再起動して OAuth フローをやり直す
3. Figma アカウントの権限を確認（Dev または Full シートが必要）

## フック

### フックが実行されない

**確認:**
```bash
# hooks.json の構文確認
node -e "JSON.parse(require('fs').readFileSync('.claude/hooks/hooks.json','utf8')); console.log('OK')"

# フックスクリプトの実行権限確認
ls -la .claude/hooks/scripts/
```

### verification-gate がコミットをブロックする

**症状:** `git commit` 実行時に「検証証拠が見つかりません」エラー

**これは正常な動作です。** verification スキル（`/verification`）を実行してからコミットしてください。

**Tiny/Small タスクの場合:** verification ステップを省略するワークフローでは、`.claude/harness/last-verification.json` を手動作成するか、verification-gate フックを一時的に無効化:
```bash
# 一時的にフックを無効化してコミット（推奨しない）
# 代わりに /verification を実行することを推奨
```

### secret-scanner が誤検知する

**症状:** テストデータやサンプルコード内のダミー値がブロックされる

**対処:** 操作を再承認するとブロックを解除できる（Claude Code が確認プロンプトを表示する）。

テストファイル（`*.test.*`）、フィクスチャ（`fixtures/`）、`.example` ファイルは自動的にスキップされる。

## その他

### 問題が解決しない場合

1. [GitHub Issues](https://github.com/sizukutamago/claude-code-harness/issues) で既知の問題を検索
2. 見つからなければ Issue を作成（エラーメッセージ + 環境情報を添付）
