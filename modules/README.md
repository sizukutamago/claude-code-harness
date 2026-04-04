# Modules — 拡張モジュール

プロジェクトごとに選択して使うオプショナルなモジュール。
`copier copy` 時の質問で選択すると、対応するエージェント・スキル・MCP 設定が `.claude/` に展開される。

## 導入済みモジュール

| モジュール | 内容 | 条件付きファイル |
|---|---|---|
| [playwright-mcp](playwright-mcp/manifest.md) | ブラウザ操作・画面確認 | browser-operator, e2e-test スキル |
| [figma-mcp](figma-mcp/manifest.md) | Figma 参照・編集 | figma-operator |

## モジュールの構成

```
modules/<module-name>/
  manifest.md     — モジュール説明・前提条件・使い方
  mcp.json        — MCP サーバー設定（.mcp.json.jinja でマージ）
  agents/         — エージェント定義のソース（.claude/agents/*.md.jinja に反映）
  skills/         — スキル定義のソース（.claude/skills/**/SKILL.md.jinja に反映）
```

## モジュール追加時の手順

1. `modules/<name>/` にマニフェストと定義ファイルを作成
2. `.claude/agents/` に `.md.jinja` ファイルを追加（`{%- if "<name>" in modules %}` で条件付き）
3. `.claude/skills/` に `SKILL.md.jinja` を追加（必要な場合）
4. `.mcp.json.jinja` に MCP サーバー設定を追加
5. `copier.yml` の `modules.choices` に選択肢を追加
