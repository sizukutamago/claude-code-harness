/**
 * 注文処理。品質レビューで「関数を分割せよ」と指摘された想定のコード。
 */
export function processOrder(order) {
  // バリデーション
  if (!order) throw new Error("order is required");
  if (!order.items || order.items.length === 0) throw new Error("items required");
  if (!order.customer) throw new Error("customer required");
  if (!order.customer.email) throw new Error("customer email required");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(order.customer.email)) throw new Error("invalid email");

  // 変換
  const subtotal = order.items.reduce((sum, item) => {
    if (item.quantity <= 0) throw new Error("invalid quantity");
    if (item.price < 0) throw new Error("invalid price");
    return sum + item.price * item.quantity;
  }, 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const orderNumber = `ORD-${Date.now()}`;

  // 保存（ダミー）
  const result = {
    orderNumber,
    customer: order.customer,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      lineTotal: item.price * item.quantity,
    })),
    subtotal,
    tax,
    total,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  return result;
}
