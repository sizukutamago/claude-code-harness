# Playwright MCP モジュール

ブラウザ操作・画面確認を Claude のワークフローに統合するモジュール。

## 概要

Playwright MCP サーバーを通じて、Claude がブラウザを操作・観察できるようにする。
テスト実行はライブラリ（Playwright Test）側の責務。このモジュールが提供するのは「Claude の目と手」としてのブラウザアクセス。

## ユースケース

| ワークフローステップ | 用途 |
|---|---|
| [1] 要件理解 | 既存画面を実際にブラウザで見て現状把握 |
| [4] 実装 | 実装中にブラウザで動作確認しながら進める |
| [5] テスト | ブラウザ操作してテスト実施 |
| [9] 完了検証 | 最終動作確認 |

## 構成

| ファイル | 役割 |
|---|---|
| `mcp.json` | MCP サーバー設定（導入先の `.mcp.json` にマージ） |
| `agents/browser-operator.md` | ブラウザ操作を担当するサブエージェント |
| `skills/e2e-test/SKILL.md` | E2E テスト作成スキル |

## 前提条件

- Node.js 18+
- ブラウザバイナリは初回使用時に自動インストールされる

## MCP サーバーが提供する主なツール

- `browser_navigate` — URL を開く
- `browser_snapshot` — アクセシビリティスナップショット（メイン情報源）
- `browser_take_screenshot` — スクリーンショット取得
- `browser_click` / `browser_type` / `browser_fill_form` — ユーザー操作
- `browser_evaluate` — JavaScript 実行
- `browser_select_option` / `browser_hover` / `browser_press` — その他操作

## 設計判断

- **サブエージェント方式を採用**: ブラウザ操作のレスポンス（スナップショット等）はトークン消費が大きいため、メインセッションでは実行しない。専用の `browser-operator` エージェントに委譲し、結果のサマリーだけをメインセッションに返す。
