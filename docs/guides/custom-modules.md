# モジュール追加ガイド

## モジュールとは

ハーネスのオプショナルな拡張機能。MCP サーバーと連携したドメイン固有の機能（ブラウザ操作、デザインツール連携等）を提供する。

Copier テンプレートの bool フラグで条件付き展開され、不要なプロジェクトには含まれない。

## 既存モジュール

| モジュール | 条件フラグ | 提供する機能 |
|-----------|----------|------------|
| playwright-mcp | use_playwright_mcp | ブラウザ操作・E2Eテスト（browser-operator エージェント + e2e-test スキル） |
| figma-mcp | use_figma_mcp | Figma デザイン参照・編集（figma-operator エージェント） |

## モジュールのディレクトリ構成

playwright-mcp を例にした実際の構造:

```
modules/playwright-mcp/
  manifest.md                     — モジュールの説明・前提条件・提供機能
  mcp.json                        — MCP サーバー設定（.mcp.json.jinja にマージされる内容）
  agents/
    browser-operator.md           — エージェント定義のソース
  skills/
    e2e-test/
      SKILL.md                    — スキル定義のソース
```

figma-mcp はスキルを持たない構成（エージェントのみ）:

```
modules/figma-mcp/
  manifest.md
  mcp.json
  agents/
    figma-operator.md
```

対応する Jinja テンプレートは `.claude/` 以下に配置される:

```
.claude/agents/browser-operator.md.jinja
.claude/skills/e2e-test/SKILL.md.jinja
.mcp.json.jinja
```

## 新モジュール追加の手順

### 1. modules/<name>/ を作成

```
modules/<name>/
  manifest.md
  mcp.json
  agents/<name>-operator.md      （エージェントが必要な場合）
  skills/<skill-name>/SKILL.md   （スキルが必要な場合）
```

**manifest.md の構成:**

```markdown
# <Name> MCP モジュール

<モジュールの1行説明>

## 概要
<モジュールの目的と概要>

## ユースケース
| ワークフローステップ | 用途 |
|---|---|
| [1] 要件理解 | ... |

## 構成
| ファイル | 役割 |
|---|---|
| `mcp.json` | MCP サーバー設定 |
| `agents/<name>-operator.md` | <Name> 操作を担当するサブエージェント |

## 前提条件
- ...

## MCP サーバーが提供する主なツール
- `tool_name` — 説明

## 設計判断
- **サブエージェント方式を採用**: ...
```

**mcp.json の例:**

```json
{
  "command": "npx",
  "args": ["@<package>@latest"]
}
```

### 2. エージェント定義を作成

`.claude/agents/<name>-operator.md.jinja`:

```jinja
{%- if use_<name>_mcp %}
---
name: <name>-operator
description: "1行の説明"
tools: mcp__<name>
model: sonnet
---

（エージェント定義本文）
{%- endif %}
```

`tools` には MCP サーバー名を `mcp__<server-name>` の形式で指定する。
サーバー名は `.mcp.json.jinja` の `mcpServers` キーと一致させること。

### 3. スキル定義を作成（必要な場合）

`.claude/skills/<skill-name>/SKILL.md.jinja`:

```jinja
{%- if use_<name>_mcp %}
---
name: <skill-name>
description: "1行の説明"
---

（スキル定義本文）
{%- endif %}
```

スキルの構成は `docs/guides/harness-development.md` の「スキル追加フロー」を参照。

### 4. .mcp.json.jinja にサーバー設定を追加

既存の `.mcp.json.jinja`:

```jinja
{%- if use_playwright_mcp or use_figma_mcp -%}
{
  "mcpServers": {
    ...
  }
}
{%- endif -%}
```

新モジュールを追加する場合のパターン:

```jinja
{%- if use_playwright_mcp or use_figma_mcp or use_<name>_mcp -%}
{
  "mcpServers": {
    {%- if use_playwright_mcp %}
    "playwright": { ... }{% if use_figma_mcp or use_<name>_mcp %},{% endif %}
    {%- endif %}
    {%- if use_figma_mcp %}
    "figma": { ... }{% if use_<name>_mcp %},{% endif %}
    {%- endif %}
    {%- if use_<name>_mcp %}
    "<name>": {
      "command": "npx",
      "args": ["@<package>@latest"]
    }
    {%- endif %}
  }
}
{%- endif -%}
```

### 5. copier.yml に質問を追加

```yaml
use_<name>_mcp:
  type: bool
  default: false
  help: "<Name> MCP を使用する？（機能の説明）"
```

既存の `use_playwright_mcp` や `use_figma_mcp` のエントリを参考に追加する。

### 6. テスト

```bash
# 4パターンの展開テスト
node eval/test-modules.mjs

# ローカルで手動テスト
copier copy --trust . /tmp/test-project
# 質問で新モジュールを true にして展開を確認
```

モジュールを有効にしたとき:
- `.claude/agents/<name>-operator.md` が生成されているか
- `.claude/skills/<skill-name>/SKILL.md` が生成されているか（スキルを追加した場合）
- `.mcp.json` が生成され、サーバー設定が含まれているか

モジュールを無効にしたとき:
- 上記ファイルが存在しないか（空ファイルが残っていないこと）

## 注意事項

- 条件付きファイルは Jinja でレンダリング後に展開される。条件が false でも空ファイルが生成されるため、`copier.yml` の `_tasks` で空ファイル削除が実行される。新しいファイルを追加した場合は既存の `_tasks` で対象になっているか確認すること
- エージェントの `tools` に `mcp__<name>` を追加する際は、`.mcp.json.jinja` に定義した `mcpServers` のキー名と一致させること
- サブエージェント方式を採用すること（MCP レスポンスはトークン消費が大きいため、メインセッションでは実行しない）
- 新モジュール追加後は `CHANGELOG.md` の `[Unreleased]` セクションに記録すること

## 参照

- モジュール一覧: `modules/README.md`
- Copier テンプレートの仕組み: `docs/guides/harness-development.md`
- 配布ワークフロー: `docs/guides/distribution-workflow.md`
