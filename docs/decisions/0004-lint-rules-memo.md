# Lint設定メモ

coding-style.md から除外した項目。導入時にプロジェクトの lint/formatter で設定する。

## lint で矯正する項目

| ルール | ESLint 相当 | 備考 |
|--------|------------|------|
| マジックナンバー・マジックストリングの禁止 | `no-magic-numbers` | 定数に切り出す |
| ネスト深度の制限（3段以下） | `max-depth: 3` | 超えたらロジックを関数に分離 |
| コメントアウトしたコードの禁止 | `no-commented-out-code` (eslint-plugin-unicorn) | 不要なら削除、必要ならバージョン管理に任せる |
| 関数の行数制限（20行目安） | `max-lines-per-function: 20` | 1関数は1つのことだけする |

## formatter で矯正する項目

| ルール | ツール | 備考 |
|--------|--------|------|
| インデント・フォーマット統一 | Prettier / Biome | プロジェクト規約に合わせて設定 |
| import 順序 | `eslint-plugin-import` / Biome | 自動ソート |

## hooks との連携

設計書のフック仕様:
- `PostToolUse: auto-format` — ファイル保存時に自動フォーマット
- `PostToolUse: typecheck` — .ts/.tsx 編集後に tsc

導入時に hooks.json で lint/format を自動実行する設定を組み込む。
