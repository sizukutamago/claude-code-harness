# ハーネス開発ガイド

このハーネスにスキル・エージェント・ルール・フックを追加・修正する手順。

## スキル追加フロー

### 1. スキルディレクトリを作成

```
.claude/skills/<skill-name>/SKILL.md
```

### 2. SKILL.md の構成

```markdown
---
name: <skill-name>
description: "1行の説明"
---

# Skill Name

## 概要
**入力:** 何を受け取るか
**出力:** 何を返すか

## Iron Law
このスキルで絶対に守るべき1つのルール。

## いつ使うか
**常に:** トリガー条件
**例外:** スキップ条件（人間パートナーに確認すること）

## プロセス
ステップバイステップの手順。

## よくある合理化
「〜だからスキップしていい」への反論テーブル。

## 危険信号
チェックリスト形式で警告。

## 委譲指示
どのエージェントにディスパッチするか。コンテキスト埋め込みの指示。

## Integration
前提スキル / 必須ルール / 次のステップ / 逆方向の依存
```

### 3. Integration セクションのルール

- **前提スキル** — このスキルの前に完了すべきスキル
- **必須ルール** — このスキル実行中に適用されるルール
- **次のステップ** — このスキルの後に進むスキル
- **このスキルを使うスキル / 出力を参照するエージェント** — 逆方向の依存

既存スキルの Integration も更新すること（双方向リンク）。

### 4. skills/README.md を更新

`.claude/skills/README.md` の一覧テーブルに追加。

---

## エージェント追加フロー

### 1. エージェント定義を作成

```
.claude/agents/<agent-name>.md
```

### 2. frontmatter の構成

```yaml
---
name: <agent-name>
description: 1行の説明
tools: Read, Grep, Glob          # 必要なツールのみ
model: opus                       # opus | sonnet | haiku
---
```

### 3. tools の選定基準

| 役割 | tools | 根拠 |
|------|-------|------|
| レビュー（読み取り専用） | Read, Grep, Glob | コードを変更させない |
| 実装・修正 | Read, Grep, Glob, Write, Edit, Bash | コード変更に必要 |
| 検証（実行のみ） | Read, Grep, Glob, Bash | テスト実行に必要、コード変更不可 |
| 分析・調査 | Read, Grep, Glob | 情報収集のみ |
| 人間への質問あり | + AskUserQuestion | 不明点の確認が必要 |

**原則: 最小権限。** 必要ないツールは含めない。

### 4. model の選定基準

| model | 用途 | コスト |
|-------|------|--------|
| opus | 高度な分析・判断（要件定義、レビュー、計画） | 高 |
| sonnet | 実装・実行（コード生成、テスト実行、整理） | 中 |
| haiku | 単純な分類・フィルタリング | 低 |

### 5. Status 定義に従う

`_shared/status-definition.md` と `_shared/completion-report-format.md` を参照し、エージェントの種別（レビュー系/実装系/分析系）に合った Status を使う。

### 6. agents/README.md を更新

一覧テーブルにエージェントを追加。

---

## ルール追加フロー

### 1. ルールファイルを作成

```
.claude/rules/<rule-name>.md
```

### 2. 構成

```markdown
# Rule Name

## 原則
1行の原則。

## 必須ルール
番号付きリスト。

## 禁止事項
やってはいけないことのリスト。
```

### 3. 既存ルールとの競合チェック

`rules/README.md` の優先順位を確認し、新ルールの位置を決める:

1. security（最優先）
2. testing
3. git-workflow
4. coding-style
5. docs-structure
6. feedback-recording

新ルールが既存ルールと矛盾する場合、優先順位に基づいて解決方法を README.md に記載。

### 4. rules/README.md を更新

テーブルと優先順位に追加。

---

## フック追加フロー

### 1. スクリプトを作成

```
.claude/hooks/scripts/<hook-name>.mjs
```

### 2. Claude Code の Hook イベント

| イベント | タイミング | 用途 |
|---------|----------|------|
| PreToolUse | ツール実行前 | ブロック（exit 2）/ 許可（exit 0） |
| PostToolUse | ツール実行後 | ログ記録 |
| PermissionDenied | ユーザーが拒否 | 拒否記録 |
| SessionEnd | セッション終了 | リマインダー |
| Notification | 通知 | （未使用） |
| Stop | 停止 | （未使用） |
| SubagentStop | サブエージェント停止 | （未使用） |

### 3. exit code の意味

| exit code | 意味 |
|-----------|------|
| 0 | 許可（hook 成功） |
| 1 | hook 自体のエラー（ユーザーに通知） |
| 2 | ブロック（ツール実行を拒否） |

### 4. エラー処理方針

| スクリプトの種類 | catch での exit code | 根拠 |
|----------------|---------------------|------|
| セキュリティ境界（coordinator-write-guard 等） | exit(2) | エラー時はブロック（安全側に倒す） |
| ログ・通知（post-tool-log 等） | exit(0) | ログ失敗でユーザーの作業をブロックしない |

### 5. hooks.json に登録

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/scripts/<hook-name>.mjs",
      "timeout": 5
    }
  ]
}
```

### 6. stdin の構造

Hook は stdin から JSON を受け取る:

```json
{
  "tool_name": "Edit",
  "tool_input": { "file_path": "...", "old_string": "...", "new_string": "..." },
  "agent_id": "subagent-id (optional)",
  "agent_type": "agent-name (optional)",
  "session_id": "...",
  "cwd": "/project/root"
}
```

---

## Copier テンプレート（条件付きファイル）

モジュール対応のファイルは `.jinja` 拡張子を使う:

```
.claude/agents/browser-operator.md.jinja
.claude/skills/e2e-test/SKILL.md.jinja
.mcp.json.jinja
```

### Jinja 条件の書き方

```jinja
{%- if use_playwright_mcp %}
（モジュールが有効な場合のみ展開される内容）
{%- endif %}
```

### copier.yml への質問追加

```yaml
use_new_module:
  type: bool
  default: false
  help: "New Module を使用する？"
```

---

## チェックリスト

新しいコンポーネントを追加したら確認:

- [ ] ファイルを作成した
- [ ] README.md（該当するもの）を更新した
- [ ] Integration セクション（スキルの場合）を記載した
- [ ] 双方向リンク（参照元・参照先）を更新した
- [ ] 人間パートナーにレビューを依頼した
