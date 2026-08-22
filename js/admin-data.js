async function fetchOrders() {
  // Supabase 한 번 응답 상한(1000행)을 넘는 과거 주문도 미입금 누적 조회에서 빠지지 않게 모두 불러옵니다.
  const rows=[];
  for(let from=0;;from+=1000){
    const {data,error}=await supabaseClient.from("orders").select("*").order("created_at",{ascending:false}).order("id",{ascending:false}).range(from,from+999);
    if(error)throw error;
    rows.push(...(data||[]));
    if(!data||data.length<1000)break;
  }
  return rows;
}

async function fetchInventorySnapshot() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseClient
      .from("inventory_items")
      .select("item_number,barcode,quantity")
      .range(from, from + 999);
    if (error) {
      console.warn("ERP 재고 조회 실패:", error.message);
      return null;
    }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function updateOrderStatus(orderNumber, currentStatus, shippingFee, courier, trackingNumber) {
  if (currentStatus === "출고완료") {
    throw new Error("출고완료 취소는 재고복원 기능을 사용해야 합니다.");
  }

  const { error } = await supabaseClient.rpc('complete_order_shipping',{
    p_order_number:orderNumber,p_shipping_fee:shippingFee,p_courier:courier,p_tracking_number:trackingNumber
  });

  if (error) throw new Error(`${error.message} (V6.5.63 SQL 실행 필요)`);
}

async function undoCompletedOrder(orderNumber) {
  const { data, error } = await supabaseClient.rpc("undo_completed_order", {
    p_order_number: orderNumber,
    p_device_name: "주문관리 출고취소"
  });
  if (error) throw error;
  // 구버전 RPC가 남기던 피킹 담당·세션 상태도 즉시 정리합니다.
  // 재고는 RPC에서 한 번만 복원하고 여기서는 피킹 상태 필드만 초기화합니다.
  const { error: cleanupError } = await supabaseClient
    .from("orders")
    .update({
      picking_session_active: false,
      picking_assigned_to: null,
      picking_assigned_name: null,
      picking_assigned_device: null,
      picking_assigned_at: null,
      picking_scan_increment: 1,
      picking_batch_id: null,
      s_outbound_confirmed: false,
      b_outbound_confirmed: false,
      i_outbound_confirmed: false
    })
    .eq("order_number", orderNumber);
  if (cleanupError) {
    throw new Error(`재고는 복원됐지만 피킹 상태 초기화에 실패했습니다. V6.6.11 SQL을 실행해주세요. ${cleanupError.message}`);
  }
  return data;
}

async function updateSoldout(id, isChecked) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ is_soldout: isChecked })
    .eq("id", id);

  if (error) throw error;
}
