(function(){
'use strict';
const $=id=>document.getElementById(id);
const ADMIN_SESSION_KEY='designjam_admin_session';
let customers=[],items=[],currentAdminId=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeItem=v=>String(v||'').trim().normalize('NFKC').toUpperCase();
function showError(message=''){const box=$('proxyError');if(!box)return;box.textContent=message;box.classList.toggle('show',Boolean(message));}
async function guard(){
 const {data:{user}}=await supabaseClient.auth.getUser();
 const stored=sessionStorage.getItem(ADMIN_SESSION_KEY)||localStorage.getItem(ADMIN_SESSION_KEY);
 if(!user||(stored&&stored!==user.id)){location.replace('admin.html');return false}
 const {data:p}=await supabaseClient.from('customers').select('is_admin,blocked').eq('id',user.id).maybeSingle();
 if(!(p?.is_admin===true&&p?.blocked!==true)){location.replace('admin.html');return false}
 currentAdminId=user.id;document.body.classList.add('auth-ready');document.body.classList.remove('auth-pending');return true;
}
async function fetchAll(table,select,order='created_at'){
 const out=[];for(let from=0;;from+=1000){let query=supabaseClient.from(table).select(select).range(from,from+999);if(order)query=query.order(order,{ascending:true});const {data,error}=await query;if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out;
}
function asItemNumbers(value){if(Array.isArray(value))return value.map(String);if(typeof value==='string'){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(String)}catch{}return value.split(/[\s,\/]+/).filter(Boolean)}return[]}
function rawPrice(item){return Number(item?.price??item?.sale_price??item?.unit_price??item?.product_price??0)||0}
function findItem(value){const key=normalizeItem(value);return items.find(x=>normalizeItem(x.item_number)===key)}
function currentCustomerName(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';if(mode==='direct')return ($('proxyDirectName')?.value||'').trim();const c=customers.find(x=>String(x.id)===String($('proxyCustomer')?.value||''));return c?(c.business_name||c.owner_name||c.email||'등록 거래처'):''}
function addLine(value={}){
 const row=document.createElement('div');row.className='proxy-line';
 row.innerHTML=`<input class="proxy-item" list="proxyItemList" autocomplete="off" placeholder="품번" value="${esc(value.item_number||'')}"><input class="proxy-qty" type="number" min="1" step="1" value="${Number(value.qty||1)}" placeholder="수량(죽)"><input class="proxy-price" type="number" min="0" step="1" value="${Number(value.price||0)}" placeholder="단가"><strong class="proxy-line-total">0원</strong><button class="remove-line" type="button">삭제</button>`;
 const syncPrice=()=>{const input=row.querySelector('.proxy-item');const found=findItem(input.value);if(found){input.value=found.item_number;row.querySelector('.proxy-price').value=Number(found.price||0)}calc()};
 row.querySelector('.remove-line').onclick=()=>{row.remove();if(!document.querySelector('.proxy-line'))addLine();calc()};
 row.querySelector('.proxy-item').addEventListener('input',()=>{const found=findItem(row.querySelector('.proxy-item').value);if(found){row.querySelector('.proxy-price').value=Number(found.price||0)}calc()});
 row.querySelector('.proxy-item').addEventListener('change',syncPrice);row.querySelector('.proxy-item').addEventListener('blur',syncPrice);
 row.querySelectorAll('.proxy-qty,.proxy-price').forEach(x=>x.addEventListener('input',calc));$('proxyLines').appendChild(row);syncPrice();
}
function calc(){
 let qty=0,total=0,count=0;document.querySelectorAll('.proxy-line').forEach(r=>{const q=Math.max(0,Math.floor(Number(r.querySelector('.proxy-qty').value||0))),p=Math.max(0,Number(r.querySelector('.proxy-price').value||0)),amount=q*p*10;qty+=q;total+=amount;if(r.querySelector('.proxy-item').value.trim())count++;r.querySelector('.proxy-line-total').textContent=amount.toLocaleString()+'원'});
 $('proxyTotal').textContent=`총 ${count.toLocaleString()}품번 · ${qty.toLocaleString()}죽 · ${total.toLocaleString()}원`;
 $('proxySummaryCustomer').textContent=currentCustomerName()||'미선택';$('proxySummarySku').textContent=count.toLocaleString()+'종';$('proxySummaryQty').textContent=qty.toLocaleString()+'죽';$('proxySummaryTotal').textContent=total.toLocaleString()+'원';
}
function makeOrderNumber(){const d=new Date(),pad=n=>String(n).padStart(2,'0');return `ADMIN-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2,6).toUpperCase()}`}
async function submit(){
 showError('');const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';const customer=customers.find(c=>String(c.id)===String($('proxyCustomer').value));const directName=($('proxyDirectName').value||'').trim();
 if(mode==='select'&&!customer){showError('등록 거래처를 선택하세요.');return}if(mode==='direct'&&!directName){showError('직접 입력할 거래처명을 입력하세요.');return}
 const lines=[...document.querySelectorAll('.proxy-line')].map(r=>({item_number:normalizeItem(r.querySelector('.proxy-item').value),qty:Math.max(1,Math.floor(Number(r.querySelector('.proxy-qty').value||1))),price:Math.max(0,Number(r.querySelector('.proxy-price').value||0))})).filter(x=>x.item_number);
 if(!lines.length){showError('주문 품번을 한 개 이상 입력하세요.');return}
 const unknown=lines.filter(x=>!findItem(x.item_number)).map(x=>x.item_number);if(unknown.length&&!confirm(`상품에 등록되지 않은 품번이 있습니다: ${unknown.join(', ')}\n그래도 주문할까요?`))return;
 if(lines.some(x=>!x.price)&&!confirm('단가가 0원인 품목이 있습니다. 그대로 주문할까요?'))return;
 const btn=$('submitProxyOrder');btn.disabled=true;btn.textContent='주문 저장 중...';
 try{
  const order=makeOrderNumber(),memo=($('proxyMemo').value||'').trim();const customerName=mode==='direct'?directName:(customer.business_name||customer.owner_name||customer.email);
  const directInfo=mode==='direct'?[`대표자: ${($('proxyDirectOwner').value||'').trim()}`,`전화: ${($('proxyDirectPhone').value||'').trim()}`,`주소: ${($('proxyDirectAddress').value||'').trim()}`].filter(x=>!x.endsWith(': ')).join(' / '):'';
  const finalMemo=['[관리자 대신주문]',memo,directInfo].filter(Boolean).join(' | ');
  const rows=lines.map(x=>({order_number:order,customer_id:mode==='direct'?currentAdminId:customer.id,customer_name:customerName,memo:finalMemo,item_number:x.item_number,qty:x.qty,price:x.price,total:x.qty*x.price*10,status:'주문접수',shipping_fee:0,is_soldout:false}));
  const {error}=await supabaseClient.from('orders').insert(rows);if(error)throw error;
  alert(`관리자 대신주문이 접수되었습니다.\n거래처: ${customerName}\n총 ${lines.length}품번\n주문번호: ${order}\n피킹 화면에서 최종검증하세요.`);location.href=`picking.html?order=${encodeURIComponent(order)}`;
 }catch(e){showError('대신 주문 저장 실패: '+(e?.message||e));btn.disabled=false;btn.textContent='대신 주문 접수'}
}
async function init(){
 if(!await guard())return;
 try{
  const [customerRows,inventoryRows,groups]=await Promise.all([fetchAll('customers','id,business_name,owner_name,email,approved,blocked,is_admin','created_at'),fetchAll('inventory_items','*','item_number'),fetchAll('product_groups','*','sort_order')]);
  customers=customerRows.filter(x=>!x.is_admin&&!x.blocked);
  const priceMap=new Map();(groups||[]).forEach(g=>asItemNumbers(g.item_numbers).forEach(n=>priceMap.set(normalizeItem(n),Number(g.price||0))));
  items=(inventoryRows||[]).map(x=>({...x,price:rawPrice(x)||priceMap.get(normalizeItem(x.item_number))||0}));
  // product_groups에만 있고 inventory_items에는 아직 없는 품번도 대신주문 검색에 노출
  for(const g of groups||[])for(const n of asItemNumbers(g.item_numbers)){const key=normalizeItem(n);if(key&&!items.some(x=>normalizeItem(x.item_number)===key))items.push({item_number:String(n).trim(),price:Number(g.price||0)})}
  items.sort((a,b)=>String(a.item_number).localeCompare(String(b.item_number),'ko',{numeric:true}));
  $('proxyCustomer').innerHTML='<option value="">거래처 선택</option>'+customers.map(c=>`<option value="${c.id}">${esc(c.business_name||c.owner_name||c.email)}</option>`).join('');
  $('proxyItemList').innerHTML=items.map(x=>`<option value="${esc(x.item_number)}" label="단가 ${Number(x.price||0).toLocaleString()}원"></option>`).join('');
  const preset=new URLSearchParams(location.search).get('customer');if(preset)$('proxyCustomer').value=preset;addLine();calc();
 }catch(e){showError('대신 주문 화면 불러오기 실패: '+(e?.message||e))}
}
function updateCustomerMode(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';$('proxySelectWrap').hidden=mode!=='select';$('proxyDirectWrap').hidden=mode!=='direct';calc()}
$('addProxyLine').onclick=()=>addLine();$('submitProxyOrder').onclick=submit;document.querySelectorAll('input[name="proxyCustomerMode"]').forEach(x=>x.addEventListener('change',updateCustomerMode));$('proxyCustomer').addEventListener('change',calc);$('proxyDirectName').addEventListener('input',calc);document.addEventListener('DOMContentLoaded',()=>{updateCustomerMode();init()});
})();