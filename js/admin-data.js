async function fetchOrders() {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function updateOrderStatus(orderNumber, currentStatus, shippingFee, courier, trackingNumber) {
  if (currentStatus === "출고완료") {
    throw new Error("출고완료 취소는 재고복원 기능을 사용해야 합니다.");
  }

  const { error } = await supabaseClient
    .from("orders")
    .update({
      status: "출고완료",
      shipping_fee: shippingFee,
      courier,
      tracking_number: trackingNumber
    })
    .eq("order_number", orderNumber);

  if (error) throw error;
}

async function undoCompletedOrder(orderNumber) {
  const { data, error } = await supabaseClient.rpc("undo_completed_order", {
    p_order_number: orderNumber,
    p_device_name: "주문관리 출고취소"
  });
  if (error) throw error;
  return data;
}

async function updateSoldout(id, isChecked) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ is_soldout: isChecked })
    .eq("id", id);

  if (error) throw error;
}
