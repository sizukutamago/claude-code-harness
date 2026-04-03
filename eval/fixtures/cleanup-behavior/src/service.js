import { unused } from "./unused-dep.js"; // lint: unused import
import { db } from "./db.js";

// TODO: REQ-001 で対応済み — 削除してよい
// TODO: パフォーマンス改善（未着手）

export function getUser(id) {
  console.log("getUser called", id); // lint: console.log
  // const oldImpl = db.findById(id); // 旧実装コメントアウト
  return db.findOne({ id });
}

// function deprecatedHelper() {
//   return "this was removed in v2";
// }
