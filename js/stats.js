const supabaseClient=window.supabase.createClient(
  'https://dtjhuejmxrjkcxzvilgw.supabase.co',
  'sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87'
);
const ADMIN_EMAILS=new Set(['900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com']);
const ADMIN_SESSION_KEY='designjam_admin_session';
let rawOrders=[];
let deletedOrders=[];
let orderChangeHistory=[];
let paymentRecords=[];
let productGroupMap=new Map();
let categoryNameMap=new Map();
let mainCategoryNameMap=new Map();
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
  if(range==='year') start=new Date(now.getFullYear(),0,1);
  if(range==='lastYear'){start=new Date(now.getFullYear()-1,0,1);end=endOfDay(new Date(now.getFullYear()-1,11,31));}
  if(range==='all'){start=null;end=null;}
  if(range==='custom'){start=parseDateInput($('statsStartDate').value);const e=parseDateInput($('statsEndDate').value);end=e?endOfDay(e):null;}
  return {start,end};
}

function setDefaultDates(){
  const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;$('statsEndDate').value=localDateKey(now);$('statsStartDate').value=localDateKey(new Date(now.getFullYear(),now.getMonth(),1));$('statsAnalysisMonth').value=month;$('monthlyRankingMonth').value=month;if($('receivableEnd'))$('receivableEnd').value=localDateKey(now);if($('receivableStart')){const d=new Date(now);d.setMonth(d.getMonth()-1);$('receivableStart').value=localDateKey(d);}
}

async function fetchAllStatsRows(table,orderColumn,ascending=true,columns='*'){
  const rows=[];
  for(let from=0;;from+=1000){
    const result=await supabaseClient.from(table).select(columns).order(orderColumn,{ascending}).range(from,from+999);
    if(result.error)return {data:rows,error:result.error};
    rows.push(...(result.data||[]));
    if(!result.data||result.data.length<1000)return {data:rows,error:null};
  }
}

function normalizeStatsCustomerName(value){
  return String(value||'').trim().normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko-KR');
}

const STATS_KOREAN_INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function statsInitialText(value){return[...String(value||'').normalize('NFKC')].map(char=>{const code=char.charCodeAt(0)-0xAC00;return code>=0&&code<=11171?STATS_KOREAN_INITIALS[Math.floor(code/588)]:char}).join('')}
let receivableCustomerOptions=[];
let customerStatsMeta=new Map();

function normalizeStatsItemNumber(value){
  return String(value||'').trim().normalize('NFKC').toUpperCase().replace(/\s+/g,'').replace(/^[SBI][-_]?(?=\d)/,'');
}

function statsGroupItemNumbers(value){
  const source=Array.isArray(value)?value:[value];return source.flatMap(item=>String(item||'').split(/[,\s/]+/)).map(x=>x.trim()).filter(Boolean);
}

async function loadSourceData(){
  $('statsMessage').textContent='통계 데이터를 불러오는 중입니다.';
  const [ordersResult,groupsResult,categoriesResult,mainsResult,deletedResult,changesResult,paymentsResult,customersResult]=await Promise.all([
    fetchAllStatsRows('orders','created_at',true),
    supabaseClient.from('product_groups').select('*'),
    supabaseClient.from('product_categories').select('id,name,main_category_id'),
    supabaseClient.from('product_main_categories').select('id,name'),
    fetchAllStatsRows('deleted_order_history','deleted_at',true),
    fetchAllStatsRows('order_change_history','changed_at',true),
    fetchAllStatsRows('order_payment_records','updated_at',false,'order_number,customer_key,paid_amount'),
    supabaseClient.from('customers').select('id,business_name,customer_tag')
  ]);
  if(ordersResult.error) throw ordersResult.error;
  rawOrders=ordersResult.data||[];
  deletedOrders=deletedResult.error?[]:(deletedResult.data||[]);
  orderChangeHistory=changesResult.error?[]:(changesResult.data||[]);
  paymentRecords=paymentsResult.error?[]:(paymentsResult.data||[]);
  customerStatsMeta=new Map((customersResult.data||[]).map(c=>[String(c.id),c]));
  categoryNameMap=new Map((categoriesResult.data||[]).map(x=>[String(x.id),x]));
  mainCategoryNameMap=new Map((mainsResult.data||[]).map(x=>[String(x.id),x.name]));
  productGroupMap=new Map();
  (groupsResult.data||[]).forEach(g=>{
    const nums=statsGroupItemNumbers(g.item_numbers||g.items||g.product_numbers||[]);
    nums.forEach(n=>productGroupMap.set(normalizeStatsItemNumber(n),g));
  });
  $('statsMessage').textContent='';
}

function groupOrders(rows){
  const map=new Map();
  rows.forEach(row=>{
    const orderNumber=row.order_number||`row-${row.id}`;const customerIdentity=String(row.customer_id||normalizeStatsCustomerName(row.customer_name)||'unknown');const key=`${orderNumber}::${customerIdentity}`;
    if(!map.has(key))map.set(key,{groupKey:key,orderNumber,createdAt:row.created_at,completedAt:row.shipped_at||row.completed_at||row.picking_verified_at||null,status:row.status||'주문접수',customerId:row.customer_id||'',customerName:row.customer_name||'거래처 미입력',shippingFee:Number(row.shipping_fee||0),items:[]});
    const g=map.get(key);g.items.push(row);if(!g.createdAt&&row.created_at)g.createdAt=row.created_at;if(row.status)g.status=row.status;if(row.shipped_at||row.completed_at||row.picking_verified_at)g.completedAt=row.shipped_at||row.completed_at||row.picking_verified_at;if(row.customer_name)g.customerName=row.customer_name;if(row.customer_id)g.customerId=row.customer_id;g.shippingFee=Math.max(g.shippingFee,Number(row.shipping_fee||0));
  });
  return [...map.values()];
}

function effectiveItemQty(item){
  if(item.is_soldout)return 0;
  const ordered=Math.max(0,Number(item.qty||0));const soldout=Math.max(0,Number(item.soldout_qty||0));
  if(soldout>0)return Math.max(0,ordered-soldout);
  return ordered;
}

function orderTotals(order){
  let amount=0,quantity=0;
  order.items.forEach(item=>{const q=effectiveItemQty(item);quantity+=q;amount+=q*Number(item.price||0);});
  return {amount:amount+Number(order.shippingFee||0),productAmount:amount,qty:quantity};
}

function calculateStats(){
  const {start,end}=getRangeBounds(currentRange);
  const completedOnly=$('completedOnlyCheck').checked;
  let rows=rawOrders.filter(r=>{const d=new Date(r.created_at);return (!start||d>=start)&&(!end||d<=end);});
  let orders=groupOrders(rows);
  if(completedOnly)orders=orders.filter(o=>o.status==='출고완료');
  const daily=new Map(),products=new Map(),customers=new Map(),categories=new Map(),warehouseSales=new Map(['S','B','I'].map(code=>[code,{code,qty:0,amount:0}]));
  let totalAmount=0,totalQty=0,doneCount=0,pendingCount=0,proxyOrderCount=0;
  orders.forEach(order=>{
    if(String(order.orderNumber).startsWith('ADMIN-')||order.items.some(x=>String(x.memo||'').includes('[관리자 대신주문]')))proxyOrderCount++;
    let productAmount=0,orderQty=0;
    order.items.forEach(item=>{
      const q=effectiveItemQty(item);if(q<=0)return;
      const price=Number(item.price||0),amount=price*q;
      orderQty+=q;productAmount+=amount;
      const num=String(item.item_number||'품번 미입력');
      const savedCode=String(item.warehouse_code||'').trim().toUpperCase();const prefix=num.toUpperCase().match(/^([SBI])(?:[-_\s]|(?=\d))/);const warehouse=['S','B','I'].includes(savedCode)?savedCode:(prefix?.[1]||'');if(warehouse){const w=warehouseSales.get(warehouse);w.qty+=q;w.amount+=amount;}
      const p=products.get(num)||{name:num,qty:0,amount:0};p.qty+=q;p.amount+=amount;products.set(num,p);
      const group=productGroupMap.get(normalizeStatsItemNumber(num));const child=categoryNameMap.get(String(group?.category_id||''));const category=String(mainCategoryNameMap.get(String(child?.main_category_id||group?.main_category_id||''))||child?.name||group?.main_category_name||group?.main_category||group?.category_name||group?.category||'미분류');
      const c=categories.get(category)||{name:category,qty:0,amount:0};c.qty+=q;c.amount+=amount;categories.set(category,c);
    });
    const orderAmount=productAmount+Number(order.shippingFee||0);totalAmount+=orderAmount;totalQty+=orderQty;
    if(order.status==='출고완료')doneCount++;else pendingCount++;
    const day=localDateKey(order.createdAt);const d=daily.get(day)||{date:day,amount:0,qty:0,orders:0};d.amount+=orderAmount;d.qty+=orderQty;d.orders++;daily.set(day,d);
    const displayCustomerName=String(order.customerName||'').trim()||'거래처 미입력';const customerKey=normalizeStatsCustomerName(displayCustomerName)||order.customerId||'거래처 미입력';const c=customers.get(customerKey)||{name:displayCustomerName,amount:0,qty:0,orders:0};c.amount+=orderAmount;c.qty+=orderQty;c.orders++;customers.set(customerKey,c);
  });
  const inRange=(value)=>{const d=new Date(value);return (!start||d>=start)&&(!end||d<=end)};
  const deleted=deletedOrders.filter(x=>inRange(x.deleted_at));
  const deletedAmount=deleted.reduce((sum,entry)=>{const items=Array.isArray(entry.order_snapshot)?entry.order_snapshot:[];const product=items.reduce((s,x)=>s+(x.is_soldout?0:Number(x.price||0)*Number(x.qty||0)),0);const shipping=Math.max(0,...items.map(x=>Number(x.shipping_fee||0)));return sum+product+shipping;},0);
  const changes=orderChangeHistory.filter(x=>inRange(x.changed_at));const changedOrderCount=new Set(changes.map(x=>x.order_number)).size;
  const todayKey=localDateKey(new Date());
  const todayOrders=groupOrders(rawOrders).filter(order=>order.status==='출고완료'&&localDateKey(order.completedAt)===todayKey);
  const todayCreatedOrders=groupOrders(rawOrders).filter(order=>localDateKey(order.createdAt)===todayKey);
  const todayOrderCount=todayCreatedOrders.length;
  const todayAmount=todayOrders.reduce((sum,order)=>sum+orderTotals(order).amount,0);
  const nowMonth=new Date(),monthStart=new Date(nowMonth.getFullYear(),nowMonth.getMonth(),1);
  const monthOrders=groupOrders(rawOrders).filter(order=>new Date(order.createdAt)>=monthStart&&(!completedOnly||order.status==='출고완료'));
  const monthAmount=monthOrders.reduce((sum,order)=>sum+orderTotals(order).amount,0);
  const paymentMap=new Map();paymentRecords.forEach(row=>{const paid=Math.max(0,Number(row.paid_amount||0));paymentMap.set(`${row.order_number}::${String(row.customer_key||'')}`,paid);paymentMap.set(`order::${row.order_number}`,paid)});
  let receivableAmount=0,receivableOrderCount=0,partialPaymentCount=0,unpaidOrderCount=0;
  groupOrders(rawOrders).forEach(order=>{
    const key=`${order.orderNumber}::${String(order.customerId||'')}`;
    const storedPaid=paymentMap.has(key)?paymentMap.get(key):paymentMap.get(`order::${order.orderNumber}`);if(storedPaid===undefined)return;
    const total=orderTotals(order).amount,paid=Math.max(0,storedPaid||0),balance=Math.max(0,total-paid);
    if(balance<=0)return;
    receivableAmount+=balance;receivableOrderCount++;
    if(paid>0)partialPaymentCount++;else unpaidOrderCount++;
  });
  const customerCount=customers.size,orderCount=orders.length,average=orderCount?Math.round(totalAmount/orderCount):0,completionRate=orderCount?Math.round(doneCount/orderCount*100):0;
  return {start,end,completedOnly,orders,totalAmount,totalQty,orderCount,todayAmount,todayOrderCount,monthAmount,receivableAmount,receivableOrderCount,partialPaymentCount,unpaidOrderCount,customerCount,average,completionRate,doneCount,pendingCount,proxyOrderCount,deletedCount:deleted.length,deletedAmount,changeCount:changes.length,changedOrderCount,deleted,changes,warehouseSales:[...warehouseSales.values()],daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),products:[...products.values()].sort((a,b)=>b.qty-a.qty),customers:[...customers.values()].sort((a,b)=>b.amount-a.amount),categories:[...categories.values()].sort((a,b)=>b.qty-a.qty)};
}

function availableYears(){
  const years=groupOrders(rawOrders).map(o=>new Date(o.createdAt).getFullYear()).filter(Number.isFinite);const nowYear=new Date().getFullYear();return [...new Set([nowYear,...years])].sort((a,b)=>b-a);
}

function fillAnalysisYears(){
  const select=$('statsAnalysisYear'),previous=Number(select.value)||new Date().getFullYear();select.innerHTML=availableYears().map(y=>`<option value="${y}">${y}년</option>`).join('');select.value=String([...select.options].some(o=>Number(o.value)===previous)?previous:new Date().getFullYear());
}

function aggregateOrderSet(orders){
  const products=new Map(),customers=new Map();let amount=0,qtyTotal=0,shippingFee=0,shippingOrderCount=0;
  orders.forEach(order=>{
    const totals=orderTotals(order);amount+=totals.amount;qtyTotal+=totals.qty;
    const fee=Math.max(0,Number(order.shippingFee||0));shippingFee+=fee;if(fee>0)shippingOrderCount++;
    order.items.forEach(item=>{const q=effectiveItemQty(item);if(q<=0)return;const name=String(item.item_number||'품번 미입력');const p=products.get(name)||{name,qty:0,amount:0};p.qty+=q;p.amount+=q*Number(item.price||0);products.set(name,p);});
    const display=String(order.customerName||'').trim()||'거래처 미입력';const key=normalizeStatsCustomerName(display)||order.customerId||'거래처 미입력';const c=customers.get(key)||{name:display,amount:0,qty:0,orders:0};c.amount+=totals.amount;c.qty+=totals.qty;c.orders++;customers.set(key,c);
  });
  return {amount,qty:qtyTotal,orders:orders.length,shippingFee,shippingOrderCount,products:[...products.values()].sort((a,b)=>b.qty-a.qty||b.amount-a.amount),customers:[...customers.values()].sort((a,b)=>b.amount-a.amount||b.qty-a.qty)};
}

function buildPeriodAnalytics(){
  let allOrders=groupOrders(rawOrders);if($('completedOnlyCheck').checked)allOrders=allOrders.filter(o=>o.status==='출고완료');
  const selectedYear=Number($('statsAnalysisYear').value)||new Date().getFullYear();const selectedMonth=$('statsAnalysisMonth').value||`${selectedYear}-01`;const [monthYear,monthNumber]=selectedMonth.split('-').map(Number);
  const yearlyMap=new Map();allOrders.forEach(o=>{const y=new Date(o.createdAt).getFullYear();if(!Number.isFinite(y))return;const t=orderTotals(o);const row=yearlyMap.get(y)||{label:String(y),amount:0,qty:0,orders:0};row.amount+=t.amount;row.qty+=t.qty;row.orders++;yearlyMap.set(y,row);});
  const monthly=Array.from({length:12},(_,i)=>({label:`${i+1}월`,amount:0,qty:0,orders:0,shippingFee:0,shippingOrders:0}));allOrders.forEach(o=>{const d=new Date(o.createdAt);if(d.getFullYear()!==selectedYear)return;const t=orderTotals(o),row=monthly[d.getMonth()],fee=Math.max(0,Number(o.shippingFee||0));row.amount+=t.amount;row.qty+=t.qty;row.orders++;row.shippingFee+=fee;if(fee>0)row.shippingOrders++;});
  const daysInMonth=new Date(monthYear,monthNumber,0).getDate();const daily=Array.from({length:daysInMonth},(_,i)=>({label:`${i+1}일`,amount:0,qty:0,orders:0}));const monthOrders=allOrders.filter(o=>{const d=new Date(o.createdAt);return d.getFullYear()===monthYear&&d.getMonth()+1===monthNumber;});monthOrders.forEach(o=>{const d=new Date(o.createdAt),t=orderTotals(o),row=daily[d.getDate()-1];row.amount+=t.amount;row.qty+=t.qty;row.orders++;});
  const previousDate=new Date(monthYear,monthNumber-2,1);const previousOrders=allOrders.filter(o=>{const d=new Date(o.createdAt);return d.getFullYear()===previousDate.getFullYear()&&d.getMonth()===previousDate.getMonth();});
  return {selectedYear,selectedMonth,yearly:[...yearlyMap.values()].sort((a,b)=>Number(a.label)-Number(b.label)),monthly,daily,current:aggregateOrderSet(monthOrders),previous:aggregateOrderSet(previousOrders)};
}

function compareText(current,previous,unit){
  if(!previous)return current?`전월 데이터 없음 · ${money(current)}${unit}`:`0${unit}`;const rate=Math.round((current-previous)/previous*100);return `${rate>0?'▲ ':rate<0?'▼ ':''}${Math.abs(rate)}% · ${money(current)}${unit}`;
}

function renderPeriodAnalytics(){
  const a=buildPeriodAnalytics(),mode=$('salesChartMode')?.value||'daily';$('monthlyRankingPeriod').textContent=`${a.selectedMonth.replace('-','년 ')}월 토탈 기준 TOP 10`;
  const chart={daily:{title:`${a.selectedMonth.replace('-','년 ')}월 일 매출`,caption:'선택 월 전체 날짜',rows:a.daily,limit:31},monthly:{title:`${a.selectedYear}년 월 매출`,caption:'1월~12월',rows:a.monthly,limit:12},yearly:{title:'연 매출',caption:'전체 주문 이력',rows:a.yearly,limit:0}}[mode];$('salesChartTitle').textContent=chart.title;$('salesChartCaption').textContent=chart.caption;renderBarChart('salesChart',chart.rows,'amount',v=>`${Math.round(v/10000).toLocaleString()}만`,chart.limit);
  $('monthlyCompareCards').innerHTML=`<article><span>선택 월 매출</span><strong>${compareText(a.current.amount,a.previous.amount,'원')}</strong></article><article><span>선택 월 출고수량</span><strong>${compareText(a.current.qty,a.previous.qty,'죽')}</strong></article><article><span>선택 월 주문건수</span><strong>${compareText(a.current.orders,a.previous.orders,'건')}</strong></article>`;
  renderRanking('topProductsList',a.current.products,'product');renderRanking('topCustomersList',a.current.customers,'customer');const caption=$('topCustomersCaption');if(caption)caption.textContent=`${a.selectedMonth.replace('-','년 ')}월 전체 ${money(a.current.customers.length)}곳 중 상위 10곳 · 배송비 포함`;
  return a;
}

function fillStatusPeriodYears(){
  const select=$('statusPeriodYear');if(!select)return;const years=availableYears(),current=String(new Date().getFullYear());select.innerHTML=years.map(y=>`<option value="${y}">${y}년</option>`).join('');select.value=years.map(String).includes(current)?current:String(years[0]||current);
}

function setDefaultStatusPeriod(){
  const now=new Date(),date=localDateKey(now),month=date.slice(0,7);if($('statusPeriodDate'))$('statusPeriodDate').value=date;if($('statusPeriodMonth'))$('statusPeriodMonth').value=month;
}

function updateStatusPeriodControls(){
  const mode=$('statusPeriodMode')?.value||'monthly';if($('statusPeriodDate'))$('statusPeriodDate').style.display=mode==='daily'?'block':'none';if($('statusPeriodMonth'))$('statusPeriodMonth').style.display=mode==='monthly'?'block':'none';if($('statusPeriodYear'))$('statusPeriodYear').style.display=mode==='yearly'?'block':'none';renderStatusPeriod();
}

function renderStatusPeriod(){
  if(!rawOrders.length)return;const mode=$('statusPeriodMode')?.value||'monthly';let orders=groupOrders(rawOrders),caption='';
  if($('completedOnlyCheck')?.checked)orders=orders.filter(o=>o.status==='출고완료');
  orders=orders.filter(o=>{const d=new Date(o.createdAt);if(Number.isNaN(d.getTime()))return false;if(mode==='daily'){const key=$('statusPeriodDate')?.value||localDateKey(new Date());caption=`${key.replace(/-/g,'. ')} 기준`;return localDateKey(d)===key;}if(mode==='yearly'){const y=Number($('statusPeriodYear')?.value)||new Date().getFullYear();caption=`${y}년 기준`;return d.getFullYear()===y;}const key=$('statusPeriodMonth')?.value||localDateKey(new Date()).slice(0,7),[y,m]=key.split('-').map(Number);caption=`${y}년 ${m}월 기준`;return d.getFullYear()===y&&d.getMonth()+1===m;});
  const all=orders.length,done=orders.filter(o=>o.status==='출고완료').length,pending=all-done,shipping=orders.reduce((sum,o)=>sum+Math.max(0,Number(o.shippingFee||0)),0),shippingOrders=orders.filter(o=>Number(o.shippingFee||0)>0).length;
  $('statusAll').textContent=`${money(all)}건`;$('statusPending').textContent=`${money(pending)}건`;$('statusDone').textContent=`${money(done)}건`;$('statusShippingFee').textContent=`${money(shipping)}원`;$('statusShippingOrders').textContent=`배송비 발생 ${money(shippingOrders)}건`;if($('statusPeriodCaption'))$('statusPeriodCaption').textContent=caption;
}

function renderMetrics(s){
  const cards=[
    ['당일 매출',money(s.todayAmount),'원'],['당일 주문건수',money(s.todayOrderCount),'건'],['누적 미수금',money(s.receivableAmount),'원'],['미입금·일부입금',money(s.receivableOrderCount),`건 · 미입금 ${money(s.unpaidOrderCount)} / 일부 ${money(s.partialPaymentCount)}`],['이번 달 매출',money(s.monthAmount),'원'],['현재 주문건수',money(s.orderCount),'건'],['관리자 대신주문',money(s.proxyOrderCount),'건'],['거래처 수',money(s.customerCount),'곳'],['삭제 주문',money(s.deletedCount),'건'],['삭제·취소 금액',money(s.deletedAmount),'원'],['변경 주문',money(s.changedOrderCount),'건'],['출고완료율',money(s.completionRate),'%']
  ];
  $('statsCards').innerHTML=cards.map(([label,value,unit])=>{const detail=label==='당일 매출'?'sales':label==='당일 주문건수'?'orders':'';return `<${detail?'button':'div'} ${detail?`type="button" data-today-detail="${detail}"`:''} class="v3-metric-card${detail?' stats-clickable-metric':''}"><span>${label}</span><strong>${value}</strong><small>${unit}${detail?' · 눌러서 상세보기':''}</small></${detail?'button':'div'}>`}).join('');
  document.querySelectorAll('[data-today-detail]').forEach(btn=>btn.addEventListener('click',()=>renderTodayDetail(btn.dataset.todayDetail)));
  renderStatusPeriod();renderReceivableLookup();
  const start=s.start?localDateKey(s.start):'전체 시작';const end=s.end?localDateKey(s.end):'현재';$('statsPeriodLabel').textContent=`집계 기간: ${start} ~ ${end}${s.completedOnly?' · 출고완료만 포함':''}`;
}


function renderTodayDetail(mode){
  const box=$('todayDetailPanel');if(!box)return;const today=localDateKey(new Date());
  const orders=groupOrders(rawOrders).filter(o=>mode==='sales'?(o.status==='출고완료'&&localDateKey(o.completedAt)===today):localDateKey(o.createdAt)===today);
  const title=mode==='sales'?'당일매출 상세 · 오늘 출고완료':'당일 주문건수 상세 · 오늘 접수';
  if(box.dataset.mode===mode&&!box.hidden){box.hidden=true;box.dataset.mode='';return}box.dataset.mode=mode;box.hidden=false;
  box.innerHTML=`<div class="v3-section-heading"><h2>${title}</h2><span>${orders.length}건</span></div><div class="stats-today-detail-list">${orders.length?orders.map(o=>{const t=orderTotals(o);const time=mode==='sales'?o.completedAt:o.createdAt;return `<div class="stats-today-detail-row"><span><b>${esc(o.customerName)}</b><small>${esc(o.orderNumber)} · ${new Date(time).toLocaleString('ko-KR')}</small></span><span>상품 ${money(t.productAmount)}원<br><small>배송비 ${money(o.shippingFee)}원</small></span><strong>${money(t.amount)}원</strong></div>`}).join(''):'<p class="empty-copy">해당 주문이 없습니다.</p>'}</div>`;
}
function normalizeCustomerStatsLookup(value){return String(value||'').trim().normalize('NFKC').replace(/\s+/g,'').toLowerCase()}
function koreanInitialTextStats(value){return[...String(value||'').normalize('NFKC')].map(char=>{const code=char.charCodeAt(0)-0xAC00;return code>=0&&code<=11171?STATS_KOREAN_INITIALS[Math.floor(code/588)]:char}).join('')}
function lookupMatchesStats(label,query){const needle=normalizeCustomerStatsLookup(query);if(!needle)return true;const source=String(label||'');return normalizeCustomerStatsLookup(source).includes(needle)||normalizeCustomerStatsLookup(koreanInitialTextStats(source)).includes(needle)}
function lookupRankStats(label,query){const needle=normalizeCustomerStatsLookup(query);if(!needle)return 0;const source=normalizeCustomerStatsLookup(label),initials=normalizeCustomerStatsLookup(koreanInitialTextStats(label));if(source===needle)return 0;if(source.startsWith(needle))return 1;if(initials===needle)return 2;if(initials.startsWith(needle))return 3;if(source.includes(needle))return 4;if(initials.includes(needle))return 5;return 99}
function customerSearchCompareStats(nameA,nameB,query){const rank=lookupRankStats(nameA,query)-lookupRankStats(nameB,query);return rank||String(nameA||'').localeCompare(String(nameB||''),'ko',{numeric:true})}
function initReceivableLookup(){
  const sel=$('receivableCustomer'),input=$('receivableCustomerSearch'),box=$('receivableCustomerSuggestions');if(!sel||!input||!box)return;
  const map=new Map();groupOrders(rawOrders).forEach(o=>{const k=String(o.customerId||normalizeStatsCustomerName(o.customerName));if(k&&!map.has(k))map.set(k,{key:k,name:o.customerName||'거래처명 미입력',owner:''})});
  receivableCustomerOptions=[...map.values()].sort((a,b)=>customerSearchCompareStats(a.name,b.name,''));
  sel.innerHTML='<option value="">거래처 선택</option>'+receivableCustomerOptions.map(x=>`<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('');
  const hide=()=>{box.hidden=true;box.innerHTML=''};
  const selectRow=row=>{if(!row)return;sel.value=row.key;input.value=row.name;hide();renderReceivableLookup()};
  const renderSuggestions=query=>{const value=String(query||'').trim();if(!value){hide();return}const rows=receivableCustomerOptions.filter(row=>lookupMatchesStats(row.name,value)).sort((a,b)=>customerSearchCompareStats(a.name,b.name,value)).slice(0,40);if(!rows.length){hide();return}box.hidden=false;box.innerHTML=rows.map((row,index)=>`<button type="button" data-receivable-index="${index}"><b>${esc(row.name)}</b><small>가입 거래처</small></button>`).join('');box.querySelectorAll('[data-receivable-index]').forEach(button=>button.onclick=()=>selectRow(rows[Number(button.dataset.receivableIndex)]))};
  input.addEventListener('input',()=>{sel.value='';renderSuggestions(input.value);renderReceivableLookup();renderReceivableCustomerList()});
  input.addEventListener('keydown',event=>{if(event.key==='Escape')hide();if(event.key==='Enter'){event.preventDefault();box.querySelector('[data-receivable-index]')?.click()}});
  input.addEventListener('focus',()=>renderSuggestions(input.value));
  document.addEventListener('click',event=>{if(!event.target.closest('.stats-receivable-search-wrap'))hide()});
  renderReceivableCustomerList();
}

function receivableCustomerIdentity(order){
  const direct=String(order?.customerId||'').trim();
  if(direct)return direct;
  const normalized=normalizeStatsCustomerName(order?.customerName||'');
  if(!normalized)return '';
  const matches=[...customerStatsMeta.entries()].filter(([,meta])=>normalizeStatsCustomerName(meta?.business_name||'')===normalized);
  return matches.length===1?String(matches[0][0]):`name:${normalized}`;
}
function receivableSnapshot(){
  const pmap=new Map(paymentRecords.map(r=>[`${r.order_number}::${String(r.customer_key||'')}`,Math.max(0,Number(r.paid_amount||0))]));
  const map=new Map();
  groupOrders(rawOrders).forEach(o=>{
    const paymentKey=`${o.orderNumber}::${String(o.customerId||'')}`;
    if(!pmap.has(paymentKey))return; // 기존 누적 미수금과 동일: 입금관리 대상 주문만 집계
    const key=receivableCustomerIdentity(o);if(!key)return;
    const t=orderTotals(o),paid=Math.min(t.amount,pmap.get(paymentKey)||0),balance=Math.max(0,t.amount-paid);
    const meta=customerStatsMeta.get(String(key))||{};
    let x=map.get(key);
    if(!x)x={key,name:meta.business_name||o.customerName||'거래처명 미입력',alias:meta.customer_tag||'',balance:0,lastTrade:''};
    x.balance+=balance;
    const day=localDateKey(o.createdAt);if(day>x.lastTrade)x.lastTrade=day;
    map.set(key,x);
  });
  return [...map.values()];
}
function renderReceivableCustomerList(){
  const summary=$('receivableSummary'),out=$('receivableCustomerList'),filter=$('receivableListFilter')?.value||'unpaid',query=$('receivableCustomerSearch')?.value||'';if(!summary||!out)return;
  const all=receivableSnapshot(),unpaid=all.filter(x=>x.balance>0),total=unpaid.reduce((a,x)=>a+x.balance,0);summary.innerHTML=`<article><span>전체 미수금</span><strong>${money(total)}원</strong></article><article><span>미수 거래처</span><strong>${money(unpaid.length)}곳</strong></article>`;
  let rows=(filter==='all'?all:unpaid).filter(x=>lookupMatchesStats(`${x.name} ${x.alias}`,query)).sort((a,b)=>b.balance-a.balance||String(a.name).localeCompare(String(b.name),'ko',{numeric:true}));
  out.innerHTML=rows.length?rows.map(x=>`<button type="button" class="stats-receivable-customer-row" data-receivable-key="${esc(x.key)}"><span><b>${esc(x.name)}</b>${x.alias?`<small class="member-customer-alias">${esc(x.alias)}</small>`:''}<em>최근거래 ${esc(x.lastTrade||'-')} · 선택하면 일별 미수금 내역</em></span><strong>${money(x.balance)}원</strong></button>`).join(''):'<p class="empty-copy">조건에 맞는 거래처가 없습니다.</p>';
  out.querySelectorAll('[data-receivable-key]').forEach(btn=>btn.onclick=()=>{const row=all.find(x=>x.key===btn.dataset.receivableKey);if(!row)return;$('receivableCustomer').value=row.key;$('receivableCustomerSearch').value=row.name;renderReceivableLookup();document.getElementById('receivableDailyResult')?.scrollIntoView({behavior:'smooth',block:'nearest'})});
}

function renderReceivableLookup(){
  const out=$('receivableDailyResult'),sel=$('receivableCustomer');if(!out||!sel||!sel.value){if(out)out.innerHTML='<p class="empty-copy">거래처를 선택하면 최근 1개월 일별 미수금 합계를 표시합니다.</p>';return}
  const start=$('receivableStart')?.value,end=$('receivableEnd')?.value,key=sel.value,pmap=new Map(paymentRecords.map(r=>[`${r.order_number}::${String(r.customer_key||'')}`,Math.max(0,Number(r.paid_amount||0))]));const rows=new Map();
  groupOrders(rawOrders).filter(o=>receivableCustomerIdentity(o)===key&&(!start||localDateKey(o.createdAt)>=start)&&(!end||localDateKey(o.createdAt)<=end)).forEach(o=>{
    const paymentKey=`${o.orderNumber}::${String(o.customerId||'')}`;if(!pmap.has(paymentKey))return;
    const d=localDateKey(o.createdAt),t=orderTotals(o),paid=Math.min(t.amount,pmap.get(paymentKey)||0),x=rows.get(d)||{day:d,total:0,shipping:0,balance:0,count:0};
    x.total+=t.amount;x.shipping+=o.shippingFee;x.balance+=Math.max(0,t.amount-paid);x.count++;rows.set(d,x)
  });
  const list=[...rows.values()].sort((a,b)=>a.day.localeCompare(b.day));out.innerHTML=list.length?`<div class="stats-receivable-table-wrap"><table class="stats-receivable-table"><thead><tr><th>날짜</th><th>주문금액</th><th>배송비</th><th>미수금</th></tr></thead><tbody>${list.map(x=>`<tr><td>${x.day}</td><td>${money(x.total)}원</td><td>${money(x.shipping)}원</td><td><strong>${money(x.balance)}원</strong></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty-copy">선택 기간의 미수금 내역이 없습니다.</p>';
}

function renderAuditSummary(s){
  $('orderChannelCards').innerHTML=`<article class="product-card stats-audit-card"><span>거래처 직접주문</span><strong>${money(Math.max(0,s.orderCount-s.proxyOrderCount))}건</strong><small>현재 주문 기준</small></article><article class="product-card stats-audit-card proxy"><span>관리자 대신주문</span><strong>${money(s.proxyOrderCount)}건</strong><small>실제 거래처명으로 순위·매출 반영</small></article><article class="product-card stats-audit-card changed"><span>주문 변경</span><strong>${money(s.changedOrderCount)}건</strong><small>총 ${money(s.changeCount)}회 변경</small></article><article class="product-card stats-audit-card deleted"><span>주문 삭제</span><strong>${money(s.deletedCount)}건</strong><small>취소금액 ${money(s.deletedAmount)}원</small></article>`;
  const recent=[...s.changes.map(x=>({at:x.changed_at,type:'변경',order:x.order_number,name:x.customer_name||'',reason:x.change_reason||'주문 품목 수정'})),...s.deleted.map(x=>({at:x.deleted_at,type:'삭제',order:x.order_number,name:x.customer_name||'',reason:x.delete_reason||'주문 삭제'}))].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,12);
  $('orderAuditList').innerHTML=recent.length?recent.map(x=>`<div class="stats-audit-row"><b class="${x.type==='삭제'?'deleted':'changed'}">${x.type}</b><span><strong>${esc(x.name||'거래처 미입력')}</strong><small>${esc(x.order)} · ${new Date(x.at).toLocaleString('ko-KR')}</small></span><em>${esc(x.reason)}</em></div>`).join(''):'<p class="empty-copy">선택 기간의 주문 변경·삭제 이력이 없습니다.</p>';
}

function renderBarChart(targetId,rows,valueKey,formatter,limit=0){
  const box=$(targetId);if(!rows.length){box.innerHTML='<p class="empty-copy">표시할 데이터가 없습니다.</p>';return;}
  const show=limit?rows.slice(-limit):rows,max=Math.max(...show.map(r=>Number(r[valueKey]||0)),1);
  box.innerHTML=`<div class="stats-bars">${show.map(r=>{const value=Number(r[valueKey]||0),label=String(r.label||r.date||'');const h=value?Math.max(4,Math.round(value/max*100)):0;return `<div class="stats-bar-item" title="${esc(label)} · ${esc(formatter(value))}"><div class="stats-bar-value">${value?esc(formatter(value)):'-'}</div><div class="stats-bar-track"><i style="height:${h}%"></i></div><small>${esc(label.includes('-')?label.slice(5):label)}</small></div>`;}).join('')}</div>`;
}

function renderRanking(targetId,rows,type){
  const box=$(targetId),items=rows.slice(0,10);if(!items.length){box.innerHTML='<p class="empty-copy">표시할 데이터가 없습니다.</p>';return;}
  const max=Math.max(...items.map(x=>type==='product'?x.qty:x.amount),1);
  box.innerHTML=items.map((x,i)=>{const value=type==='product'?`${qty(x.qty)}죽`:`${money(x.amount)}원`;const width=Math.max(3,Math.round((type==='product'?x.qty:x.amount)/max*100));const sub=type==='product'?`${money(x.amount)}원`:`${x.orders.toLocaleString()}건 · ${qty(x.qty)}죽`;return `<div class="stats-rank-row"><b>${i+1}</b><div><strong>${esc(x.name)}</strong><small>${sub}</small><span><i style="width:${width}%"></i></span></div><em>${value}</em></div>`;}).join('');
}

function renderCategoryShare(rows){
  const box=$('categoryShareList');const classified=rows.filter(x=>x.name&&x.name!=='미분류');const unclassified=rows.find(x=>x.name==='미분류');rows=classified;if(!rows.length){box.innerHTML='<p class="empty-copy">대분류 정보가 없거나 판매 데이터가 없습니다.</p>';return;}
  const total=rows.reduce((s,x)=>s+x.qty,0)||1;box.innerHTML=rows.slice(0,12).map(x=>{const percent=Math.round(x.qty/total*100);return `<div class="stats-share-row"><span>${esc(x.name)}</span><div><i style="width:${percent}%"></i></div><strong>${qty(x.qty)}죽 · ${percent}%</strong></div>`;}).join('')+(unclassified?`<p class="stats-unclassified-note">대분류 연결이 필요한 판매수량: ${qty(unclassified.qty)}죽</p>`:'');
}

function renderAll(){
  currentStats=calculateStats();renderMetrics(currentStats);renderAuditSummary(currentStats);$('warehouseSalesCards').innerHTML=currentStats.warehouseSales.map(w=>`<article class="product-card warehouse-sales-card warehouse-${w.code.toLowerCase()}"><span>${w.code} 출고지 매출</span><strong>${money(w.amount)}원</strong><small>${qty(w.qty)}죽</small></article>`).join('');currentStats.periodAnalytics=renderPeriodAnalytics();renderCategoryShare(currentStats.categories);
}

function exportExcel(){
  if(!currentStats)return;if(!window.XLSX)return alert('엑셀 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  const period=`${currentStats.start?localDateKey(currentStats.start):'전체'} ~ ${currentStats.end?localDateKey(currentStats.end):'현재'}`,a=currentStats.periodAnalytics||buildPeriodAnalytics();
  const summary=[['DESIGN SOCKS 운영 통계'],['집계기간',period],['월간 랭킹 기준',a.selectedMonth],[],['핵심지표','값','단위'],['총 주문금액',currentStats.totalAmount,'원'],['총 주문수량',currentStats.totalQty,'죽'],['주문건수',currentStats.orderCount,'건'],['거래처 수',currentStats.customerCount,'곳'],['평균 주문금액',currentStats.average,'원'],['출고완료율',currentStats.completionRate,'%'],[],['주문상태','건수'],['주문접수/출고대기',currentStats.pendingCount],['출고완료',currentStats.doneCount]];
  const make=(rows,widths)=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(w=>({wch:w}));ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};if(rows.length>1)ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:rows[0].length-1}})};return ws;};
  const wb=XLSX.utils.book_new(),wsSummary=XLSX.utils.aoa_to_sheet(summary);wsSummary['!merges']=[XLSX.utils.decode_range('A1:C1')];wsSummary['!cols']=[{wch:24},{wch:22},{wch:12}];XLSX.utils.book_append_sheet(wb,wsSummary,'요약');
  XLSX.utils.book_append_sheet(wb,make([['연도','매출','수량(죽)','주문건수'],...a.yearly.map(x=>[x.label,x.amount,x.qty,x.orders])],[12,18,14,12]),'연도별매출');
  XLSX.utils.book_append_sheet(wb,make([['월','매출','수량(죽)','주문건수'],...a.monthly.map(x=>[`${a.selectedYear}-${String(parseInt(x.label,10)).padStart(2,'0')}`,x.amount,x.qty,x.orders])],[12,18,14,12]),'월별매출');
  XLSX.utils.book_append_sheet(wb,make([['월','배송비 합계','배송비 발생 주문건수'],...a.monthly.map(x=>[`${a.selectedYear}-${String(parseInt(x.label,10)).padStart(2,'0')}`,x.shippingFee,x.shippingOrders])],[12,18,20]),'월별배송비');
  XLSX.utils.book_append_sheet(wb,make([['일','매출','수량(죽)','주문건수'],...a.daily.map(x=>[`${a.selectedMonth}-${String(parseInt(x.label,10)).padStart(2,'0')}`,x.amount,x.qty,x.orders])],[14,18,14,12]),'일별매출');
  XLSX.utils.book_append_sheet(wb,make([['순위','품번','판매수량(죽)','주문금액'],...a.current.products.map((x,i)=>[i+1,x.name,x.qty,x.amount])],[8,20,16,18]),'월간품번랭킹');
  XLSX.utils.book_append_sheet(wb,make([['순위','거래처','주문금액','주문건수','수량(죽)'],...a.current.customers.map((x,i)=>[i+1,x.name,x.amount,x.orders,x.qty])],[8,28,18,12,14]),'월간거래처랭킹');
  XLSX.utils.book_append_sheet(wb,make([['순위','대분류','수량(죽)','주문금액'],...currentStats.categories.map((x,i)=>[i+1,x.name,x.qty,x.amount])],[8,26,14,18]),'카테고리별');
  XLSX.utils.book_append_sheet(wb,make([['구분','거래처','주문번호','일시','사유'],...currentStats.changes.map(x=>['변경',x.customer_name||'',x.order_number,x.changed_at,x.change_reason||'주문 품목 수정']),...currentStats.deleted.map(x=>['삭제',x.customer_name||'',x.order_number,x.deleted_at,x.delete_reason||'주문 삭제'])],[10,28,30,22,30]),'변경삭제이력');
  XLSX.writeFile(wb,`DESIGN_SOCKS_운영통계_${localDateKey(new Date())}.xlsx`);
}

function bindEvents(){
  $('statsRangeButtons').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{currentRange=btn.dataset.range;$('statsRangeButtons').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));renderAll();}));
  $('applyCustomRangeBtn').addEventListener('click',()=>{if(!$('statsStartDate').value||!$('statsEndDate').value)return alert('시작일과 종료일을 모두 선택해 주세요.');if($('statsStartDate').value>$('statsEndDate').value)return alert('시작일은 종료일보다 늦을 수 없습니다.');currentRange='custom';$('statsRangeButtons').querySelectorAll('button').forEach(b=>b.classList.remove('active'));renderAll();});
  $('completedOnlyCheck').addEventListener('change',renderAll);$('refreshStatsBtn').addEventListener('click',async()=>{try{await loadSourceData();fillAnalysisYears();renderAll();}catch(e){$('statsMessage').textContent='통계 새로고침 실패: '+e.message;}});$('exportStatsBtn').addEventListener('click',exportExcel);
  $('statsAnalysisYear').addEventListener('change',renderAll);$('statsAnalysisMonth').addEventListener('change',()=>{$('monthlyRankingMonth').value=$('statsAnalysisMonth').value;renderAll()});$('monthlyRankingMonth').addEventListener('change',()=>{$('statsAnalysisMonth').value=$('monthlyRankingMonth').value;const y=String($('monthlyRankingMonth').value||'').split('-')[0];if(y&&[...$('statsAnalysisYear').options].some(o=>o.value===y))$('statsAnalysisYear').value=y;renderAll()});$('salesChartMode').addEventListener('change',renderAll);
  $('receivableCustomer')?.addEventListener('change',renderReceivableLookup);$('receivableStart')?.addEventListener('change',renderReceivableLookup);$('receivableEnd')?.addEventListener('change',renderReceivableLookup);$('receivableListFilter')?.addEventListener('change',renderReceivableCustomerList);
  $('statusPeriodMode')?.addEventListener('change',updateStatusPeriodControls);$('statusPeriodDate')?.addEventListener('change',renderStatusPeriod);$('statusPeriodMonth')?.addEventListener('change',renderStatusPeriod);$('statusPeriodYear')?.addEventListener('change',renderStatusPeriod);
  document.querySelectorAll('[data-order-filter]').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.orderFilter;location.href=`admin.html?status=${encodeURIComponent(f)}`;}));
}

document.addEventListener('DOMContentLoaded',async()=>{if(!(await guardAdmin()))return;setDefaultDates();setDefaultStatusPeriod();bindEvents();try{await loadSourceData();fillAnalysisYears();fillStatusPeriodYears();updateStatusPeriodControls();initReceivableLookup();renderAll();}catch(e){$('statsMessage').textContent='통계 불러오기 실패: '+e.message;}});
