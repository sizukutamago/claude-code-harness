# 蒸留済み規約

## API 設計

- エンドポイントのパスは kebab-case を使う（例: `/user-profiles`）
- エラーレスポンスは `{ "error": { "code": "...", "message": "..." } }` 形式に統一する
- HTTPException を使ってエラーハンドリングを行う

## データベース

- D1 は INSERT OR IGNORE をサポートしない。INSERT と ON CONFLICT 句を使う
- トランザクションは明示的に BEGIN/COMMIT する

## 認証

- JWT の秘密鍵は環境変数 `JWT_SECRET` から取得する
- トークンの有効期限は 1 時間とする

## ルーティング

- Hono の router は `app.route()` でマウントする
- ルートごとにファイルを分割し、`src/routes/` に配置する
