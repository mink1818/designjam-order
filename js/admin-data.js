async function fetchOrders() {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function adminCustomerPriceKey(customerId,itemNumber){return `${String(customerId||'')}::${String(itemNumber||'').trim().normalize('NFKC').toUpperCase().replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/,'')}`;}
async function fetchAdminCustomerItemPrices(){
  const rpc=await supabaseClient.rpc('get_admin_customer_item_prices');
  if(!rpc.error)return rpc.data||[];
  const fallback=await supabaseClient.from('customer_item_prices').select('customer_id,item_number,price');
  if(fallback.error){console.warn('거래처별 단가 조회 실패:',fallback.error.message);return[];}
  return fallback.data||[];
}
function applyAdminCustomerItemPrices(orderRows,priceRows){
  const priceMap=new Map((priceRows||[]).map(row=>[adminCustomerPriceKey(row.customer_id,row.item_number),Number(row.price)]));
  return (orderRows||[]).map(row=>{const price=priceMap.get(adminCustomerPriceKey(row.customer_id,row.item_number));return Number.isFinite(price)&&price>0?{...row,price,total:Number(row.qty||0)*price}:row;});
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
