const supabaseClient=window.supabase.createClient(
  'https://dtjhuejmxrjkcxzvilgw.supabase.co',
  'sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87'
);
const ADMIN_EMAILS=new Set(['900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com']);
const ADMIN_SESSION_KEY='designjam_admin_session';
let rawOrders=[];
let productGroupMap=new Map();
let currentRange='month';
let currentStats=null;

const $=id=>document.getElementById(id);
const money=v=>Number(v||0).toLocaleString('ko-KR');
const qty=v=>Number(v||0).toLocaleString('ko-KR');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const localDateKey=value=>{const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const parseDateInput=value=>{if(!value)return null;const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,0,0,0,0);};
const endOfDay=d=>{const x=new Date(d);x.setHours(23,59,59,999);return x;};
const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};

async function guardAdmin(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  const stored=sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY);
  if(!user||(stored&&stored!==user.id)){location.replace('admin.html');return false;}
  const {data:p}=await supabaseClient.from('customers').select('is_admin,blocked').eq('id',user.id).maybeSingle();
  if(!ADMIN_EMAILS.has(String(user.email||'').toLowerCase())&&!(p?.is_admin===true&&p?.blocked!==true)){location.replace('admin.html');return false;}
  sessionStorage.setItem(ADMIN_SESSION_KEY,user.id);localStorage.setItem(ADMIN_SESSION_KEY,user.id);document.body.classList.add('auth-ready');return true;
}

function getRangeBounds(range){
  const now=new Date();let start=null,end=endOfDay(now);
  if(range==='today') start=startOfDay(now);
  if(range==='week'){start=startOfDay(now);const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day);}
  if(range==='month') start=new Date(now.getFullYear(),now.getMonth(),1);
  if(range==='lastMonth'){start=new Date(now.getFullYear(),now.getMonth()-1,1);end=endOfDay(new Date(now.getFullYear(),now.getMonth(),0));}
  if(range==='all'){start=null;end=null;}
  if(range==='custom'){start=parseDateInput($('statsStartDate').value);const e=parseDateInput($('statsEndDate').value);end=e?endOfDay(e):null;}
  return {start,end};
}

function setDefaultDates(){
  const now=new Date();$('statsEndDate').value=localDateKey(now);$('statsStartDate').value=localDateKey(new Date(now.getFullYear(),now.getMonth(),1));
}

async function loadSourceData(){
  $('statsMessage').textContent='통계 데이터를 불러오는 중입니다.';
  const [ordersResult,groupsResult]=await Promise.all([
    supabaseClient.from('orders').select('*').order('created_at',{ascending:true}),
    supabaseClient.from('product_groups').select('*')
  ]);
  if(ordersResult.error) throw ordersResult.error;
  rawOrders=ordersResult.data||[];
  productGroupMap=new Map();
  (groupsResult.data||[]).forEach(g=>{
    const nums=String(g.item_numbers||g.items||g.product_numbers||'').split(/[,\s/]+/).map(x=>x.trim()).filter(Boolean);
    nums.forEach(n=>productGroupMap.set(n,g));
  });
  $('statsMessage').textContent='';
}

function groupOrders(rows){
  const map=new Map();
  rows.forEach(row=>{
    const key=row.order_number||`row-${row.id}`;
    if(!map.has(key))map.set(key,{orderNumber:key,createdAt:row.created_at,status:row.status||'주문접수',customerId:row.customer_id||'',customerName:row.customer_name||'거래처 미입력',shippingFee:Number(row.shipping_fee||0),items:[]});
    const g=map.get(key);g.items.push(row);if(!g.createdAt&&row.created_at)g.createdAt=row.created_at;if(row.status)g.status=row.status;if(row.customer_name)g.customerName=row.customer_name;if(row.customer_id)g.customerId=row.customer_id;g.shippingFee=Math.max(g.shippingFee,Number(row.shipping_fee||0));
  });
  return [...map.values()];
}

function calculateStats(){
  const {start,end}=getRangeBounds(currentRange);
  const completedOnly=$('completedOnlyCheck').checked;
  let rows=rawOrders.filter(r=>{const d=new Date(r.created_at);return (!start||d>=start)&&(!end||d<=end);});
  let orders=groupOrders(rows);
  if(completedOnly)orders=orders.filter(o=>o.status==='출고완료');
  const daily=new Map(),products=new Map(),customers=new Map(),categories=new Map();
  let totalAmount=0,totalQty=0,doneCount=0,pendingCount=0;
  orders.forEach(order=>{
    let productAmount=0,orderQty=0;
    order.items.forEach(item=>{
      if(item.is_soldout)return;
      const q=Number(item.qty||0),price=Number(item.price||0),amount=price*q*10;
      orderQty+=q;productAmount+=amount;
      const num=String(item.item_number||'품번 미입력');
      const p=products.get(num)||{name:num,qty:0,amount:0};p.qty+=q;p.amount+=amount;products.set(num,p);
      const group=productGroupMap.get(num);const category=String(group?.main_category_name||group?.main_category||group?.category_name||group?.category||'미분류');
      const c=categories.get(category)||{name:category,qty:0,amount:0};c.qty+=q;c.amount+=amount;categories.set(category,c);
    });
    const orderAmount=productAmount+Number(order.shippingFee||0);totalAmount+=orderAmount;totalQty+=orderQty;
    if(order.status==='출고완료')doneCount++;else pendingCount++;
    const day=localDateKey(order.createdAt);const d=daily.get(day)||{date:day,amount:0,qty:0,orders:0};d.amount+=orderAmount;d.qty+=orderQty;d.orders++;daily.set(day,d);
    const customerKey=order.customerId||order.customerName;const c=customers.get(customerKey)||{name:order.customerName||'거래처 미입력',amount:0,qty:0,orders:0};c.amount+=orderAmount;c.qty+=orderQty;c.orders++;customers.set(customerKey,c);
  });
  const customerCount=customers.size,orderCount=orders.length,average=orderCount?Math.round(totalAmount/orderCount):0,completionRate=orderCount?Math.round(doneCount/orderCount*100):0;
  return {start,end,completedOnly,orders,totalAmount,totalQty,orderCount,customerCount,average,completionRate,doneCount,pendingCount,daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),products:[...products.values()].sort((a,b)=>b.qty-a.qty),customers:[...customers.values()].sort((a,b)=>b.amount-a.amount),categories:[...categories.values()].sort((a,b)=>b.qty-a.qty)};
}

function renderMetrics(s){
  const cards=[
    ['총 주문금액',money(s.totalAmount),'원'],['총 주문수량',qty(s.totalQty),'죽'],['주문건수',money(s.orderCount),'건'],['거래처 수',money(s.customerCount),'곳'],['평균 주문금액',money(s.average),'원'],['출고완료율',money(s.completionRate),'%']
  ];
  $('statsCards').innerHTML=cards.map(([label,value,unit])=>`<div class="v3-metric-card"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`).join('');
  $('statusAll').textContent=`${s.orderCount.toLocaleString()}건`;$('statusPending').textContent=`${s.pendingCount.toLocaleString()}건`;$('statusDone').textContent=`${s.doneCount.toLocaleString()}건`;
  const start=s.start?localDateKey(s.start):'전체 시작';const end=s.end?localDateKey(s.end):'현재';$('statsPeriodLabel').textContent=`집계 기간: ${start} ~ ${end}${s.completedOnly?' · 출고완료만 포함':''}`;
}

function renderBarChart(targetId,rows,valueKey,formatter){
  const box=$(targetId);if(!rows.length){box.innerHTML='<p class="empty-copy">표시할 데이터가 없습니다.</p>';return;}
  const show=rows.slice(-14),max=Math.max(...show.map(r=>Number(r[valueKey]||0)),1);
  box.innerHTML=`<div class="stats-bars">${show.map(r=>{const value=Number(r[valueKey]||0);const h=Math.max(4,Math.round(value/max*100));return `<div class="stats-bar-item" title="${esc(r.date)} · ${esc(formatter(value))}"><div class="stats-bar-value">${esc(formatter(value))}</div><div class="stats-bar-track"><i style="height:${h}%"></i></div><small>${esc(r.date.slice(5))}</small></div>`;}).join('')}</div>`;
}

function renderRanking(targetId,rows,type){
  const box=$(targetId),items=rows.slice(0,10);if(!items.length){box.innerHTML='<p class="empty-copy">표시할 데이터가 없습니다.</p>';return;}
  const max=Math.max(...items.map(x=>type==='product'?x.qty:x.amount),1);
  box.innerHTML=items.map((x,i)=>{const value=type==='product'?`${qty(x.qty)}죽`:`${money(x.amount)}원`;const width=Math.max(3,Math.round((type==='product'?x.qty:x.amount)/max*100));const sub=type==='product'?`${money(x.amount)}원`:`${x.orders.toLocaleString()}건 · ${qty(x.qty)}죽`;return `<div class="stats-rank-row"><b>${i+1}</b><div><strong>${esc(x.name)}</strong><small>${sub}</small><span><i style="width:${width}%"></i></span></div><em>${value}</em></div>`;}).join('');
}

function renderCategoryShare(rows){
  const box=$('categoryShareList');if(!rows.length){box.innerHTML='<p class="empty-copy">대분류 정보가 없거나 판매 데이터가 없습니다.</p>';return;}
  const total=rows.reduce((s,x)=>s+x.qty,0)||1;box.innerHTML=rows.slice(0,12).map(x=>{const percent=Math.round(x.qty/total*100);return `<div class="stats-share-row"><span>${esc(x.name)}</span><div><i style="width:${percent}%"></i></div><strong>${qty(x.qty)}죽 · ${percent}%</strong></div>`;}).join('');
}

function renderAll(){
  currentStats=calculateStats();renderMetrics(currentStats);renderBarChart('salesTrendChart',currentStats.daily,'amount',v=>`${Math.round(v/10000).toLocaleString()}만`);renderBarChart('qtyTrendChart',currentStats.daily,'qty',v=>`${qty(v)}죽`);renderRanking('topProductsList',currentStats.products,'product');renderRanking('topCustomersList',currentStats.customers,'customer');renderCategoryShare(currentStats.categories);
}

function csvCell(value){const s=String(value??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function exportCsv(){
  if(!currentStats)return;const lines=[];lines.push(['디자인삭스 운영통계','',''].map(csvCell).join(','));lines.push(['집계기간',currentStats.start?localDateKey(currentStats.start):'전체',currentStats.end?localDateKey(currentStats.end):'현재'].map(csvCell).join(','));lines.push([]);lines.push(['핵심지표','값','단위'].map(csvCell).join(','));[['총 주문금액',currentStats.totalAmount,'원'],['총 주문수량',currentStats.totalQty,'죽'],['주문건수',currentStats.orderCount,'건'],['거래처 수',currentStats.customerCount,'곳'],['평균 주문금액',currentStats.average,'원'],['출고완료율',currentStats.completionRate,'%']].forEach(r=>lines.push(r.map(csvCell).join(',')));
  lines.push([]);lines.push(['상품 판매량 TOP 10','',''].map(csvCell).join(','));lines.push(['순위','품번','수량(죽)','주문금액'].map(csvCell).join(','));currentStats.products.slice(0,10).forEach((x,i)=>lines.push([i+1,x.name,x.qty,x.amount].map(csvCell).join(',')));
  lines.push([]);lines.push(['거래처 주문금액 TOP 10','','',''].map(csvCell).join(','));lines.push(['순위','거래처','주문금액','주문건수','수량(죽)'].map(csvCell).join(','));currentStats.customers.slice(0,10).forEach((x,i)=>lines.push([i+1,x.name,x.amount,x.orders,x.qty].map(csvCell).join(',')));
  lines.push([]);lines.push(['날짜별 추이','',''].map(csvCell).join(','));lines.push(['날짜','주문금액','수량(죽)','주문건수'].map(csvCell).join(','));currentStats.daily.forEach(x=>lines.push([x.date,x.amount,x.qty,x.orders].map(csvCell).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`디자인삭스_통계_${localDateKey(new Date())}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function bindEvents(){
  $('statsRangeButtons').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{currentRange=btn.dataset.range;$('statsRangeButtons').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));renderAll();}));
  $('applyCustomRangeBtn').addEventListener('click',()=>{if(!$('statsStartDate').value||!$('statsEndDate').value)return alert('시작일과 종료일을 모두 선택해 주세요.');if($('statsStartDate').value>$('statsEndDate').value)return alert('시작일은 종료일보다 늦을 수 없습니다.');currentRange='custom';$('statsRangeButtons').querySelectorAll('button').forEach(b=>b.classList.remove('active'));renderAll();});
  $('completedOnlyCheck').addEventListener('change',renderAll);$('refreshStatsBtn').addEventListener('click',async()=>{try{await loadSourceData();renderAll();}catch(e){$('statsMessage').textContent='통계 새로고침 실패: '+e.message;}});$('exportStatsBtn').addEventListener('click',exportCsv);
  document.querySelectorAll('[data-order-filter]').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.orderFilter;location.href=`admin.html?status=${encodeURIComponent(f)}`;}));
}

document.addEventListener('DOMContentLoaded',async()=>{if(!(await guardAdmin()))return;setDefaultDates();bindEvents();try{await loadSourceData();renderAll();}catch(e){$('statsMessage').textContent='통계 불러오기 실패: '+e.message;}});
