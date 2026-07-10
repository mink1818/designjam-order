const supabaseUrl = "https://dtjhuejmxrjkcxzvilgw.supabase.co";
const supabaseKey = "sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87";

const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey
);

const orderResult = document.getElementById("orderResult");

async function loadMyOrders() {
  orderResult.innerHTML = "<p>내 주문을 불러오는 중...</p>";

  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError || !user) {
    location.href = "login.html";
    return;
  }

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    orderResult.innerHTML = `<p>조회 실패: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    orderResult.innerHTML = `
      <div class="product-card">
        <h2>주문 내역이 없습니다</h2>
      </div>
    `;
    return;
  }

  const grouped = {};

  data.forEach(order => {
    if (!grouped[order.order_number]) {
      grouped[order.order_number] = {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        memo: order.memo,
        status: order.status,
        shippingFee: order.shipping_fee || 0,
        courier: order.courier || "로젠택배",
        trackingNumber: order.tracking_number || "",
        createdAt: order.created_at,
        items: []
      };
    }

    grouped[order.order_number].items.push(order);
  });

  renderOrders(Object.values(grouped));
}

function renderOrders(groups) {
  let html = "";

  groups.forEach(group => {
    let itemHtml = "";
    let qtyTotal = 0;
    let productTotal = 0;

    group.items.forEach(item => {
      const isSoldout = item.is_soldout;
      const rowTotal = item.price * item.qty * 10;

      if (!isSoldout) {
        qtyTotal += item.qty;
        productTotal += rowTotal;
      }

      itemHtml += `
        <div class="cart-item ${isSoldout ? "soldout-item" : ""}">
          <strong>
            ${item.item_number}${isSoldout ? " 품절" : ""}
          </strong>
          <span>${item.qty}개</span>
          <span>
            ${isSoldout ? "-" : rowTotal.toLocaleString() + "원"}
          </span>
        </div>
      `;
    });

    const finalTotal =
      productTotal + Number(group.shippingFee || 0);

    html += `
      <div class="product-card">
        <h2>${group.customerName}</h2>

        <p>
          <strong>주문번호:</strong>
          ${group.orderNumber}
        </p>

        <p>
          <strong>상태:</strong>
          ${group.status}
        </p>

        <p>
          <strong>메모:</strong>
          ${group.memo || ""}
        </p>

        ${itemHtml}

        <hr>

        <h3>출고수량: ${qtyTotal}개</h3>

        <p>
          <strong>상품금액:</strong>
          ${productTotal.toLocaleString()}원
        </p>

        <p>
          <strong>배송비:</strong>
          ${Number(group.shippingFee).toLocaleString()}원
        </p>

        <h2 class="price-text">
          최종금액: ${finalTotal.toLocaleString()}원
        </h2>

        ${
          group.status === "출고완료"
            ? `
              <p><strong>택배사:</strong> ${group.courier}</p>
              <p>
                <strong>송장번호:</strong>
                ${group.trackingNumber || "입력 전"}
              </p>
            `
            : `
              <p>
                <strong>배송정보:</strong>
                출고 준비 중입니다
              </p>
            `
        }
      </div>
    `;
  });

  orderResult.innerHTML = html;
}

loadMyOrders();