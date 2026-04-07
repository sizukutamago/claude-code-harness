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

## エラーリファレンス

フックが出力するエラーメッセージと、その原因・対処を一覧にまとめる。

### coordinator-write-guard

**トリガー:** Edit または Write ツール実行前（PreToolUse）

---

#### メインセッションからの書き込みブロック

**エラーメッセージ:**
```
[harness] コーディネーターは直接コードを書けません。implementer エージェントにディスパッチしてください。
対象ファイル: <file_path>
```

**エラー分類:** Fatal（スコープ違反 — 自動リトライで解決不可）

**原因:** メインセッション（coordinator）が、ホワイトリスト外のファイルに直接 Edit/Write しようとした。

**対処手順:**
1. メインセッションからのコード直書きをやめる
2. implementer エージェントにタスクをディスパッチして代わりに書かせる
3. ホワイトリスト対象ファイルへの書き込みが目的なら、対象パスを確認する

**ホワイトリスト（直接書き込み可）:**
- `.claude/harness/` 配下（`session-feedback.jsonl` 等の運用ファイル）
- `HANDOVER.md`
- `CLAUDE.md`
- `requirements/` 配下

**設計意図:** Invariant「メインセッションはコードを書かない」を構造的に強制し、coordinatorがエージェントを経由せずに実装を直書きすることを防ぐ。

---

### secret-scanner

**トリガー:** Edit または Write ツール実行前（PreToolUse）

---

#### シークレットパターン検出

**エラーメッセージ:**
```
[harness] シークレットの可能性を検出しました:
  - <パターン名>
対象ファイル: <file_path>
環境変数や .env ファイルを使用してください。誤検知の場合はこの操作を再承認してください。
```

**エラー分類:** Fatal（セキュリティ問題 — 人間介入必須）

**原因:** 書き込み内容に以下のいずれかのパターンが含まれていた:
- AWS Access Key / Secret Key
- GitHub / GitLab / npm / PyPI トークン
- Slack / Stripe / Anthropic / OpenAI キー
- Google サービスアカウント JSON
- DB 接続文字列（postgres://, mysql://, mongodb:// 等）
- PEM 形式の秘密鍵
- 汎用的なシークレット代入（`password = "..."` 等）

**対処手順（本物のシークレットの場合）:**
1. 書き込みを中止する
2. シークレットを環境変数または `.env` ファイルに移動する
3. コード内では `process.env.SECRET_NAME` のように参照する
4. `.env` を `.gitignore` に追加する

**対処手順（誤検知の場合）:**
1. Claude Code が表示する確認プロンプトで「再承認」を選択する
2. 誤検知が繰り返す場合は、テストファイル（`*.test.*`）やフィクスチャ（`fixtures/`）に移動する

**スキャン対象外（自動スキップ）:**
- `*.test.js`, `*.test.ts` 等のテストファイル
- `__tests__/` ディレクトリ
- `fixtures/` または `fixture/` ディレクトリ
- `.example` 拡張子のファイル（`.env.example` 等）
- `eval/cases/` 配下（eval ケースファイル）

**設計意図:** Invariant「シークレットのハードコード禁止」を構造的に強制し、機密情報がリポジトリに混入することを防ぐ。

---

#### スキャン失敗（フォールバック）

**エラーメッセージ:**
```
[secret-scanner] スキャン失敗（安全側に倒してブロック）: <error_message>
```

**エラー分類:** Fatal（fail-closed 設計）

**原因:** スキャンスクリプト自体が例外で失敗した（stdin のパース失敗等）。

**対処手順:** フックスクリプト自体の問題の可能性がある。`[harness] フックが実行されない` の確認手順でスクリプトの状態を確認する。

---

### verification-gate

**トリガー:** `git commit` を含む Bash コマンド実行前（PreToolUse）

---

#### 検証証拠ファイルが存在しない

**エラーメッセージ:**
```
[harness] 検証証拠が見つかりません。
verification スキル（/verification）を実行してからコミットしてください。
期待されるファイル: .claude/harness/last-verification.json
```

**エラー分類:** Suspension（人間承認ゲート — 検証スキル実行が必要）

**原因:** `.claude/harness/last-verification.json` が存在しない。verification スキルを一度も実行していない。

**対処手順:**
1. `/verification` スキルを実行して検証を行う
2. 検証が通れば `last-verification.json` が生成され、コミットが許可される

---

#### 検証証拠が古い

**エラーメッセージ:**
```
[harness] 検証証拠が古すぎます（<N>時間前）。
verification スキル（/verification）を再実行してからコミットしてください。
```

**エラー分類:** Suspension（検証の再実行が必要）

**原因:** `last-verification.json` の最終更新から2時間以上経過している。古い検証結果でコミットしようとした。

**対処手順:**
1. `/verification` スキルを再実行する
2. 検証完了後、2時間以内にコミットする

---

#### 検証結果が FAIL

**エラーメッセージ:**
```
[harness] 検証が FAIL のままです。
理由: <reason>
問題を修正し、/verification を再実行してからコミットしてください。
```

**エラー分類:** Retryable（コードの修正で解決可能）

**原因:** `last-verification.json` に `"status": "FAIL"` が記録されている。テスト失敗や品質チェック未通過の状態でコミットしようとした。

**対処手順:**
1. エラーメッセージ内の「理由」を確認する
2. 問題を修正する
3. `/verification` を再実行して GREEN を確認してからコミットする

**設計意図:** Invariant「検証証拠なしに完了を宣言しない」を構造的に強制し、テスト未通過のコードがコミットされることを防ぐ。

---

### post-verification-scan

**トリガー:** `git commit` を含む Bash コマンド実行前（PreToolUse）

---

#### 一時ファイル・一時ディレクトリの検出

**エラーメッセージ:**（警告のみ、コミットはブロックしない）
```
[harness] 不要ファイルの可能性を検出しました:
  - 一時ファイル: <filename>
  - 一時ディレクトリ: <dirname>/
cleanup スキル（/cleanup）で整理してからコミットすることを推奨します。
```

**エラー分類:** 警告（ブロックなし）— 対応は任意

**原因:** プロジェクトルート直下に以下のパターンに一致するファイルまたはディレクトリが存在する:
- ファイル: `.tmp`, `.bak`, `.orig`, `~`, `.swp`, `.debug.js`, `.debug.ts` 等
- ディレクトリ: `tmp/`, `temp/`, `.temp/`

**対処手順:**
1. `/cleanup` スキルを実行して一時ファイルを整理する
2. または、該当ファイルが意図したものであれば `.gitignore` に追加してそのままコミットする

**設計意図:** ワークフロー step [10]（整理）の実行を促し、デバッグ用の一時ファイルがコミットに混入することを防ぐ。

---

> **エラー分類の詳細定義:** `.claude/agents/_shared/error-classification.md` を参照。

---

## その他

### 問題が解決しない場合

1. [GitHub Issues](https://github.com/sizukutamago/claude-code-harness/issues) で既知の問題を検索
2. 見つからなければ Issue を作成（エラーメッセージ + 環境情報を添付）
