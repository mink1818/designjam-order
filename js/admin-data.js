let adminFullOrdersCache = null;
let adminFullOrdersPromise = null;
let adminActiveOrdersCache = null;
let adminActiveOrdersCacheAt = 0;
const ADMIN_ACTIVE_CACHE_MS = 15000;

async function fetchAllOrdersForAdmin() {
  if (adminFullOrdersCache) return adminFullOrdersCache;
  if (adminFullOrdersPromise) return adminFullOrdersPromise;
  adminFullOrdersPromise = (async()=>{
    const rows=[];
    for(let from=0;;from+=1000){
      const {data,error}=await supabaseClient.from("orders").select("*").order("created_at",{ascending:false}).order("id",{ascending:false}).range(from,from+999);
      if(error)throw error;
      rows.push(...(data||[]));
      if(!data||data.length<1000)break;
    }
    adminFullOrdersCache=rows;
    return rows;
  })().finally(()=>{adminFullOrdersPromise=null});
  return adminFullOrdersPromise;
}

function warmAdminFullOrders(){
  if(adminFullOrdersCache||adminFullOrdersPromise)return;
  const run=()=>fetchAllOrdersForAdmin().catch(error=>console.warn('과거 주문 백그라운드 준비 생략:',error.message));
  if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:2500}); else setTimeout(run,900);
}

async function fetchOrders() {
  // V6.6.94: 첫 화면에서 Supabase 세션/DB 연결이 막 준비되는 순간의 일시 오류는
  // 사용자에게 실패 화면을 보여주지 않고 짧게 자동 재시도합니다.
  const runWithQuickRetry = async (runner) => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await runner(); } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 180 : 420));
      }
    }
    throw lastError;
  };
  // 첫 진입의 주문접수/출고대기는 전체 과거 주문 수천 행을 기다리지 않고 현재 진행 주문만 먼저 받습니다.
  // 전체/출고완료/미입금/검색처럼 과거 데이터가 필요한 경우에만 전체 주문 캐시를 사용합니다.
  const keyword=String(document.getElementById('adminSearch')?.value||'').trim();
  const needsHistory = Boolean(keyword) || requestedPaymentFilter==='unpaid' || adminFilter==='전체' || adminFilter==='출고완료';
  if(needsHistory)return runWithQuickRetry(()=>fetchAllOrdersForAdmin());

  const now=Date.now();
  if(adminActiveOrdersCache && now-adminActiveOrdersCacheAt<ADMIN_ACTIVE_CACHE_MS){
    return adminActiveOrdersCache;
  }
  const rows=await runWithQuickRetry(async()=>{
    const result=[];
    for(let from=0;;from+=1000){
      const {data,error}=await supabaseClient.from('orders').select('*').eq('status','주문접수').order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,from+999);
      if(error)throw error;
      result.push(...(data||[]));
      if(!data||data.length<1000)break;
    }
    return result;
  });
  adminActiveOrdersCache=rows;
  adminActiveOrdersCacheAt=now;
  // V6.6.89: 과거 전체 주문은 사용자가 전체/출고완료/검색을 열 때만 조회합니다.
  // 주문접수 첫 화면 뒤에서 수천 건을 미리 받지 않아 로딩과 Supabase Egress를 함께 줄입니다.
  return rows;
}

function invalidateAdminOrderCache(){adminFullOrdersCache=null;adminActiveOrdersCache=null;adminActiveOrdersCacheAt=0;}
window.invalidateAdminOrderCache=invalidateAdminOrderCache;

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
