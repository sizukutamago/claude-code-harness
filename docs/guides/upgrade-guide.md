# アップグレードガイド

`copier update` でハーネスを最新バージョンに更新する手順。

## 更新前の準備

1. **ワーキングツリーをクリーンに**: 未コミットの変更がある場合は先にコミットまたは stash
   ```bash
   git status
   git stash  # 必要に応じて
   ```

2. **CHANGELOG を確認**: ハーネスリポジトリの `CHANGELOG.md` で変更内容を確認
   ```
   https://github.com/sizukutamago/claude-code-harness/blob/main/CHANGELOG.md
   ```

## 更新の実行

```bash
copier update --trust
```

Copier は 3-way merge でプロジェクト固有の変更を保持しつつ、ハーネス側の更新を適用する。

## コンフリクト解消

### 基本方針

- **ハーネス側の構造変更を優先**: スキル・エージェント・フックの構造が変わった場合、ハーネス側を採用
- **プロジェクト固有の内容は追記で対応**: カスタムルール、独自エージェント等は追記として残す

### よくあるコンフリクトパターン

| パターン | 対処 |
|---------|------|
| hooks.json にプロジェクト独自フックを追加していた | ハーネス側の hooks.json を採用し、独自フックを再追加 |
| rules/ にプロジェクト独自ルールがある | ハーネス側の変更を採用し、独自ルールファイルはそのまま残る（別ファイルなのでコンフリクトしにくい） |
| agents/ にカスタムエージェントがある | 同上。別ファイルなのでコンフリクトしにくい |
| CLAUDE.md が変更された | CLAUDE.md は `_skip_if_exists` のため上書きされない。変更なし |
| skills/ の SKILL.md をカスタマイズしていた | ハーネス側を採用し、カスタマイズを再適用。Integration セクションの整合性を確認 |

### コンフリクト解消後

```bash
# 全テストが通ることを確認
# （プロジェクトのテストコマンドを実行）

# 変更をコミット
git add .claude/
git commit -m "chore: copier update to harness vX.X.X"
```

## ロールバック

更新後に問題が発生した場合:

```bash
# .claude/ を更新前の状態に戻す
git checkout HEAD~1 -- .claude/

# .copier-answers.yml も戻す
git checkout HEAD~1 -- .copier-answers.yml
```

## 参照

- 配布ワークフロー詳細: `docs/guides/distribution-workflow.md`
- トラブルシューティング: `docs/guides/troubleshooting.md`
