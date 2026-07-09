async function fetchOrders() {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function updateOrderStatus(orderNumber, currentStatus, shippingFee, courier, trackingNumber) {
  const nextStatus = currentStatus === "출고완료" ? "주문접수" : "출고완료";

  const updateData = { status: nextStatus };

  if (nextStatus === "출고완료") {
    updateData.shipping_fee = shippingFee;
    updateData.courier = courier;
    updateData.tracking_number = trackingNumber;
  }

  const { error } = await supabaseClient
    .from("orders")
    .update(updateData)
    .eq("order_number", orderNumber);

  if (error) throw error;
}

async function updateSoldout(id, isChecked) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ is_soldout: isChecked })
    .eq("id", id);

  if (error) throw error;
}