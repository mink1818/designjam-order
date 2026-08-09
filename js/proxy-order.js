(function(){
'use strict';
const $=id=>document.getElementById(id);
const ADMIN_SESSION_KEY='designjam_admin_session';
let customers=[],items=[],currentAdminId=null,activeCustomerPrices=new Map(),selectedPriceLoadToken=0,directPriceTimer=null;
let draftSaveTimer=null,draftSubmissionComplete=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeItem=v=>String(v||'').trim().normalize('NFKC').toUpperCase();
const priceKey=v=>normalizeItem(v).replace(/^([SBI])[-_\s]+(?=[A-Z0-9])/,'');
const normalizeCustomerPriceName=value=>String(value||'').trim().normalize('NFKC').toLowerCase().replace(/[\s_.·,()\[\]{}\-/]+/g,'');
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
async function fetchAdminCustomerPrices(){const rpc=await supabaseClient.rpc('get_admin_customer_item_prices');if(!rpc.error)return rpc.data||[];return fetchAll('customer_item_prices','customer_id,item_number,price','item_number').catch(()=>[])}
async function fetchSelectedCustomerPrices(customerId){
 if(!customerId)return[];
 const rows=[];let rpcError=null;
 for(let from=0;;from+=1000){const result=await supabaseClient.rpc('get_customer_item_prices_for_admin',{p_customer_id:customerId}).range(from,from+999);if(result.error){rpcError=result.error;break}rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
 rows.length=0;
 for(let from=0;;from+=1000){const result=await supabaseClient.from('customer_item_prices').select('item_number,price').eq('customer_id',customerId).order('item_number',{ascending:true}).range(from,from+999);if(result.error)throw new Error(result.error.message||rpcError?.message||'전용단가 조회 실패');rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
}
async function fetchCustomerPricesByName(customerName){
 if(!String(customerName||'').trim())return[];
 const rows=[];let rpcError=null;
 for(let from=0;;from+=1000){const result=await supabaseClient.rpc('get_customer_item_prices_by_name_for_admin',{p_customer_name:String(customerName).trim()}).range(from,from+999);if(result.error){rpcError=result.error;break}rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
 rows.length=0;
 for(let from=0;;from+=1000){const result=await supabaseClient.from('customer_name_item_prices').select('item_number,price').eq('normalized_name',normalizeCustomerPriceName(customerName)).order('item_number',{ascending:true}).range(from,from+999);if(result.error)throw new Error(result.error.message||rpcError?.message||'직접입력 거래처 전용단가 조회 실패');rows.push(...(result.data||[]));if(!result.data||result.data.length<1000)return rows;}
}
function asItemNumbers(value){if(Array.isArray(value))return value.map(String);if(typeof value==='string'){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(String)}catch{}return value.split(/[\s,\/]+/).filter(Boolean)}return[]}
function rawPrice(item){return Number(item?.price??item?.sale_price??item?.unit_price??item?.product_price??0)||0}
function findItem(value){
 const key=priceKey(value),exact=items.find(x=>priceKey(x.item_number)===key);if(exact)return exact;
 // 숫자로 끝나는 기본 품번은 A/M 꼬리표 후보가 하나뿐일 때만 자동 연결합니다.
 if(!/\d$/.test(key))return null;
 const candidates=items.filter(x=>{const itemKey=priceKey(x.item_number);return /^[\s\S]*\d[AM]$/.test(itemKey)&&itemKey.slice(0,-1)===key});
 return candidates.length===1?candidates[0]:null;
}
function normalizeCustomer(value){return String(value||'').trim().normalize('NFKC').replace(/\s+/g,'').toLowerCase()}
function isMobileDirectInput(){return window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches===true}
function configureDirectCustomerInput(){
 const input=$('proxyDirectName');if(!input)return;
 // 일부 모바일 브라우저는 datalist가 큰 상태에서 키보드를 열면 탭이 종료될 수 있어 기본 키보드 입력만 사용합니다.
 if(isMobileDirectInput())input.removeAttribute('list');
}
function matchedDirectCustomer(){const key=normalizeCustomer($('proxyDirectName')?.value);if(!key)return null;return customers.find(customer=>[customer.business_name,customer.owner_name,customer.email].some(value=>normalizeCustomer(value)===key))||null}
function selectedCustomerId(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';if(mode==='direct')return String(matchedDirectCustomer()?.id||'');return String($('proxyCustomer')?.value||'')}
function proxyDraftKey(){return currentAdminId?`designjam_proxy_order_draft_${currentAdminId}`:''}
function proxyDraftRows(){return[...document.querySelectorAll('.proxy-line')].map(row=>({item_number:row.querySelector('.proxy-item')?.value||'',qty:Number(row.querySelector('.proxy-qty')?.value||1),price:Number(row.querySelector('.proxy-price')?.value||0)})).filter(row=>row.item_number.trim())}
function saveProxyDraft(){const key=proxyDraftKey();if(!key||draftSubmissionComplete)return;const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';const draft={mode,customer_id:$('proxyCustomer')?.value||'',direct_name:$('proxyDirectName')?.value||'',direct_owner:$('proxyDirectOwner')?.value||'',direct_phone:$('proxyDirectPhone')?.value||'',direct_address:$('proxyDirectAddress')?.value||'',memo:$('proxyMemo')?.value||'',paste:$('proxyPasteInput')?.value||'',rows:proxyDraftRows(),saved_at:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(draft))}
function scheduleProxyDraftSave(){clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(saveProxyDraft,180)}
function clearProxyDraft(){const key=proxyDraftKey();if(key)localStorage.removeItem(key)}
function restoreProxyDraft(){const key=proxyDraftKey();if(!key)return false;let draft=null;try{draft=JSON.parse(localStorage.getItem(key)||'null')}catch{}if(!draft)return false;const mode=document.querySelector(`input[name="proxyCustomerMode"][value="${draft.mode==='direct'?'direct':'select'}"]`);if(mode)mode.checked=true;$('proxyCustomer').value=draft.customer_id||'';$('proxyDirectName').value=draft.direct_name||'';$('proxyDirectOwner').value=draft.direct_owner||'';$('proxyDirectPhone').value=draft.direct_phone||'';$('proxyDirectAddress').value=draft.direct_address||'';$('proxyMemo').value=draft.memo||'';$('proxyPasteInput').value=draft.paste||'';$('proxyLines').innerHTML='';(Array.isArray(draft.rows)?draft.rows:[]).forEach(addLine);if(!document.querySelector('.proxy-line'))addLine();updateCustomerMode();calc();return true}
function effectiveProxyPrice(itemNumber,basePrice=0){return Number(activeCustomerPrices.get(priceKey(itemNumber))??basePrice??0)}
function updateRegisteredPriceStatus(message='',isError=false){const box=$('proxyRegisteredPriceStatus');if(!box)return;box.hidden=!message;box.textContent=message;box.classList.toggle('auth-error',Boolean(isError));}
async function reloadSelectedCustomerPrices(){
 const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select',customerId=selectedCustomerId(),customerName=($('proxyDirectName')?.value||'').trim(),token=++selectedPriceLoadToken;
 activeCustomerPrices.clear();
 if(mode==='select'&&!customerId){updateRegisteredPriceStatus('등록 거래처를 선택하면 해당 거래처의 전용단가를 불러옵니다.');refreshAllLinePrices();return false;}
 if(mode==='direct'&&!customerName){updateRegisteredPriceStatus('직접입력 거래처명을 입력하면 엑셀에 등록된 전용단가를 찾습니다.');refreshAllLinePrices();return false;}
 updateRegisteredPriceStatus(mode==='direct'?'거래처명으로 전용단가를 찾는 중입니다...':'선택 거래처의 전용단가를 불러오는 중입니다...');
 try{
  const selectedCustomer=customers.find(customer=>String(customer.id)===String(customerId));
  const lookupName=mode==='direct'?customerName:String(selectedCustomer?.business_name||selectedCustomer?.owner_name||'').trim();
  const idRows=customerId?await fetchSelectedCustomerPrices(customerId):[];
  const nameRows=lookupName?await fetchCustomerPricesByName(lookupName).catch(()=>[]):[];
  const mergedRows=new Map();
  // 거래처명 단가가 운영 기준입니다. 중복 가입계정의 오래된 ID 단가가 이를 덮지 않게 순서를 바꾸지 마세요.
  idRows.forEach(row=>mergedRows.set(priceKey(row.item_number),row));
  nameRows.forEach(row=>mergedRows.set(priceKey(row.item_number),row));
  const rows=[...mergedRows.values()];
  if(token!==selectedPriceLoadToken)return;
  rows.forEach(row=>activeCustomerPrices.set(priceKey(row.item_number),Number(row.price)));
  const appliedName=mode==='direct'?customerName:String(selectedCustomer?.business_name||selectedCustomer?.owner_name||'등록 거래처');
  updateRegisteredPriceStatus(rows.length?`✅ ${appliedName} 전용단가 ${activeCustomerPrices.size.toLocaleString()}개 적용 · 거래처명 최신단가 우선`:`⚠ ${appliedName} 전용단가 0개 · 기본단가 적용`,!rows.length);
  refreshAllLinePrices();
  return true;
 }catch(error){if(token!==selectedPriceLoadToken)return false;updateRegisteredPriceStatus(`전용단가 조회 실패: ${error.message}`,true);refreshAllLinePrices();return false;}
}
function parsePastedItemLine(line){
 const source=String(line||'').trim();if(findItem(source))return{item:source,qty:1};let match=source.match(/^(.+?)\s*[\(（]\s*(\d+)\s*(?:죽|족)?(?:씩)?\s*[\)）]\s*$/);
 if(!match)match=source.match(/^(.+?)\s*(?:[~～〜ㅡ]|[,./:\-]|\s+)\s*(\d+)\s*(?:죽|족)?(?:씩)?\s*$/);
 if(!match)return{item:source.replace(/[,.\/~～〜]+$/,'').trim(),qty:1};
 return{item:match[1].trim(),qty:Math.max(1,Number(match[2]))};
}
function expandPastedItemRange(line){
 const source=String(line||'').trim().replace(/[～〜]/g,'~');
 // 4003~3족처럼 수량 단위가 붙은 기존 입력은 품번 범위가 아니라 수량 입력으로 유지합니다.
 if(!source||/[죽족]/.test(source))return[];
 const match=source.match(/^([^0-9~]*)(\d+)([^0-9~]*)~([^0-9~]*)(\d+)([^0-9~]*)$/);
 if(!match)return[];
 const startPrefix=match[1].trim(),startDigits=match[2],startSuffix=match[3].trim();
 const endPrefix=(match[4].trim()||startPrefix),endDigits=match[5],endSuffix=(match[6].trim()||startSuffix);
 if(startPrefix.toLowerCase()!==endPrefix.toLowerCase()||startSuffix.toLowerCase()!==endSuffix.toLowerCase())return[];
 const start=Number(startDigits),end=Number(endDigits),span=end-start;
 if(!Number.isInteger(start)||!Number.isInteger(end)||span<0||span>1000)return[];
 const width=Math.max(startDigits.length,endDigits.length),items=[];
 for(let number=start;number<=end;number++)items.push(`${startPrefix}${String(number).padStart(width,'0')}${startSuffix}`);
 return items;
}
function applyPastedOrder(){const text=String($('proxyPasteInput')?.value||'').trim();if(!text)return alert('붙여넣을 품번을 입력하세요.');const rows=text.split(/\r?\n|[;|]/).map(line=>line.trim()).filter(Boolean),merged=new Map();const addParsed=(item,qty)=>{if(!item)return;const key=normalizeItem(item);const current=merged.get(key)||{item_number:item,qty:0};current.qty+=qty;merged.set(key,current)};for(const line of rows){const rangeItems=expandPastedItemRange(line);if(rangeItems.length){rangeItems.forEach(item=>addParsed(item,1));continue}const parsedLine=parsePastedItemLine(line);addParsed(parsedLine.item,parsedLine.qty)}const parsed=[...merged.values()];if(!parsed.length)return alert('인식할 수 있는 품번이 없습니다.');$('proxyLines').innerHTML='';parsed.forEach(row=>addLine(row));refreshAllLinePrices();$('proxyPasteInput').value='';calc();scheduleProxyDraftSave()}
function refreshAllLinePrices(){document.querySelectorAll('.proxy-line').forEach(row=>{const found=findItem(row.querySelector('.proxy-item')?.value);if(found)row.querySelector('.proxy-price').value=effectiveProxyPrice(found.item_number,found.price)});const match=matchedDirectCustomer(),box=$('proxyDirectPriceMatch');if(box){box.hidden=!match;box.textContent=match?`등록 거래처 “${match.business_name||match.owner_name||match.email}”의 품번별 전용 단가를 적용합니다.`:''}calc()}
function currentCustomerName(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';if(mode==='direct')return ($('proxyDirectName')?.value||'').trim();const c=customers.find(x=>String(x.id)===String($('proxyCustomer')?.value||''));return c?(c.business_name||c.owner_name||c.email||'등록 거래처'):''}
function addLine(value={}){
 const row=document.createElement('div');row.className='proxy-line';
 row.innerHTML=`<input class="proxy-item" list="proxyItemList" autocomplete="off" placeholder="품번" value="${esc(value.item_number||'')}"><input class="proxy-qty" type="number" min="1" step="1" value="${Number(value.qty||1)}" placeholder="수량(죽)"><input class="proxy-price" type="number" min="0" step="1" value="${Number(value.price||0)}" placeholder="단가(1죽)"><strong class="proxy-line-total">0원</strong><button class="remove-line" type="button">삭제</button>`;
 const syncPrice=()=>{const input=row.querySelector('.proxy-item');const found=findItem(input.value);if(found){input.value=found.item_number;row.querySelector('.proxy-price').value=effectiveProxyPrice(found.item_number,found.price)}calc()};
 row.querySelector('.remove-line').onclick=()=>{row.remove();if(!document.querySelector('.proxy-line'))addLine();calc();scheduleProxyDraftSave()};
 row.querySelector('.proxy-item').addEventListener('input',()=>{const found=findItem(row.querySelector('.proxy-item').value);if(found){row.querySelector('.proxy-price').value=effectiveProxyPrice(found.item_number,found.price)}calc()});
 row.querySelector('.proxy-item').addEventListener('change',syncPrice);row.querySelector('.proxy-item').addEventListener('blur',syncPrice);
 row.querySelectorAll('.proxy-qty,.proxy-price').forEach(x=>x.addEventListener('input',calc));$('proxyLines').appendChild(row);syncPrice();
}
function calc(){
 let qty=0,total=0,count=0;document.querySelectorAll('.proxy-line').forEach(r=>{const q=Math.max(0,Math.floor(Number(r.querySelector('.proxy-qty').value||0))),p=Math.max(0,Number(r.querySelector('.proxy-price').value||0)),amount=q*p;qty+=q;total+=amount;if(r.querySelector('.proxy-item').value.trim())count++;r.querySelector('.proxy-line-total').textContent=amount.toLocaleString()+'원'});
 $('proxyTotal').textContent=`총 ${count.toLocaleString()}품번 · ${qty.toLocaleString()}죽 · ${total.toLocaleString()}원`;
 $('proxySummaryCustomer').textContent=currentCustomerName()||'미선택';$('proxySummarySku').textContent=count.toLocaleString()+'종';$('proxySummaryQty').textContent=qty.toLocaleString()+'죽';$('proxySummaryTotal').textContent=total.toLocaleString()+'원';
}
function makeOrderNumber(){const d=new Date(),pad=n=>String(n).padStart(2,'0');return `ADMIN-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2,6).toUpperCase()}`}
async function submit(){
 showError('');const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';const customer=customers.find(c=>String(c.id)===String($('proxyCustomer').value));const directCustomer=mode==='direct'?matchedDirectCustomer():null;const directName=($('proxyDirectName').value||'').trim();
 if(mode==='select'&&!customer){showError('등록 거래처를 선택하세요.');return}if(mode==='direct'&&!directName){showError('직접 입력할 거래처명을 입력하세요.');return}
 clearTimeout(directPriceTimer);
 const priceReady=await reloadSelectedCustomerPrices();
 if(!priceReady){showError('거래처별 단가 확인에 실패했습니다. 단가 조회 상태를 확인한 뒤 다시 접수하세요.');return}
 const lines=[...document.querySelectorAll('.proxy-line')].map(r=>({item_number:normalizeItem(r.querySelector('.proxy-item').value),qty:Math.max(1,Math.floor(Number(r.querySelector('.proxy-qty').value||1))),price:Math.max(0,Number(r.querySelector('.proxy-price').value||0))})).filter(x=>x.item_number);
 if(!lines.length){showError('주문 품번을 한 개 이상 입력하세요.');return}
 const unknown=lines.filter(x=>!findItem(x.item_number)).map(x=>x.item_number);if(unknown.length&&!confirm(`상품에 등록되지 않은 품번이 있습니다: ${unknown.join(', ')}\n그래도 주문할까요?`))return;
 if(lines.some(x=>!x.price)&&!confirm('단가가 0원인 품목이 있습니다. 그대로 주문할까요?'))return;
 const btn=$('submitProxyOrder');btn.disabled=true;btn.textContent='주문 저장 중...';
 try{
  const order=makeOrderNumber(),memo=($('proxyMemo').value||'').trim();const customerName=mode==='direct'?directName:(customer.business_name||customer.owner_name||customer.email);
  const directInfo=mode==='direct'?[`대표자: ${($('proxyDirectOwner').value||'').trim()}`,`전화: ${($('proxyDirectPhone').value||'').trim()}`,`주소: ${($('proxyDirectAddress').value||'').trim()}`].filter(x=>!x.endsWith(': ')).join(' / '):'';
  const finalMemo=['[관리자 대신주문]',memo,directInfo].filter(Boolean).join(' | ');
  const rows=lines.map(x=>{const found=findItem(x.item_number);return{item_number:x.item_number,warehouse_code:found?.warehouse_code||null,qty:x.qty,price:x.price,total:x.qty*x.price}});
  const {data,error}=await supabaseClient.rpc('create_admin_proxy_order',{
    p_order_number:order,
    p_customer_id:mode==='direct'?(directCustomer?.id||null):customer.id,
    p_customer_name:customerName,
    p_memo:finalMemo,
    p_items:rows
  });
  if(error)throw error;
  if(data?.ok===false)throw new Error(data.error||'대신주문 저장에 실패했습니다.');
  draftSubmissionComplete=true;clearProxyDraft();alert(`관리자 대신주문이 접수되었습니다.\n거래처: ${customerName}\n총 ${lines.length}품번\n주문번호: ${order}\n피킹 화면에서 최종검증하세요.`);location.href=`picking.html?order=${encodeURIComponent(order)}`;
 }catch(e){showError('대신 주문 저장 실패: '+(e?.message||e));btn.disabled=false;btn.textContent='대신 주문 접수'}
}
async function init(){
 if(!await guard())return;
 try{
  const [customerRows,inventoryRows,groups]=await Promise.all([fetchAll('customers','id,business_name,owner_name,email,approved,blocked,is_admin','created_at'),fetchAll('inventory_items','*','item_number'),fetchAll('product_groups','*','sort_order')]);
  customers=customerRows.filter(x=>!x.is_admin&&!x.blocked);
  const productMap=new Map();(groups||[]).forEach(g=>asItemNumbers(g.item_numbers).forEach(n=>productMap.set(normalizeItem(n),{price:Number(g.price||0),warehouse_code:String(g.warehouse_code||'').trim().toUpperCase()||null})));
  items=(inventoryRows||[]).map(x=>{const product=productMap.get(normalizeItem(x.item_number))||{};return{...x,price:rawPrice(x)||product.price||0,warehouse_code:x.warehouse_code||product.warehouse_code||null}});
  // product_groups에만 있고 inventory_items에는 아직 없는 품번도 대신주문 검색에 노출
  for(const g of groups||[])for(const n of asItemNumbers(g.item_numbers)){const key=normalizeItem(n);if(key&&!items.some(x=>normalizeItem(x.item_number)===key))items.push({item_number:String(n).trim(),price:Number(g.price||0),warehouse_code:String(g.warehouse_code||'').trim().toUpperCase()||null})}
  items.sort((a,b)=>String(a.item_number).localeCompare(String(b.item_number),'ko',{numeric:true}));
  $('proxyCustomer').innerHTML='<option value="">거래처 선택</option>'+customers.map(c=>`<option value="${c.id}">${esc(c.business_name||c.owner_name||'거래처')} · ${esc(c.email||String(c.id).slice(0,8))}</option>`).join('');
  const customerNames=[...new Set(customers.map(c=>String(c.business_name||c.owner_name||c.email||'').trim()).filter(Boolean))];
  $('proxyCustomerNameList').innerHTML=customerNames.slice(0,300).map(name=>`<option value="${esc(name)}"></option>`).join('');
  configureDirectCustomerInput();
  $('proxyItemList').innerHTML=items.map(x=>`<option value="${esc(x.item_number)}"></option>`).join('');
  const preset=new URLSearchParams(location.search).get('customer');if(preset)$('proxyCustomer').value=preset;if(!restoreProxyDraft())addLine();await reloadSelectedCustomerPrices();calc();
 }catch(e){showError('대신 주문 화면 불러오기 실패: '+(e?.message||e))}
}
function updateCustomerMode(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';activeCustomerPrices.clear();$('proxySelectWrap').hidden=mode!=='select';$('proxyDirectWrap').hidden=mode!=='direct';if($('proxyDirectPriceMatch'))$('proxyDirectPriceMatch').hidden=true;refreshAllLinePrices();scheduleProxyDraftSave()}
$('addProxyLine').onclick=()=>{addLine();scheduleProxyDraftSave()};$('applyProxyPaste').onclick=applyPastedOrder;$('submitProxyOrder').onclick=submit;document.querySelectorAll('input[name="proxyCustomerMode"]').forEach(x=>x.addEventListener('change',()=>{updateCustomerMode();reloadSelectedCustomerPrices()}));$('proxyCustomer').addEventListener('change',()=>{reloadSelectedCustomerPrices();scheduleProxyDraftSave()});$('proxyDirectName').addEventListener('input',()=>{clearTimeout(directPriceTimer);scheduleProxyDraftSave();const name=String($('proxyDirectName').value||'').trim();if(name)directPriceTimer=setTimeout(reloadSelectedCustomerPrices,450);else{selectedPriceLoadToken++;updateRegisteredPriceStatus('거래처명을 입력하면 전용단가를 확인합니다.');refreshAllLinePrices()}});$('proxyDirectName').addEventListener('change',reloadSelectedCustomerPrices);$('proxyDirectName').addEventListener('blur',()=>{clearTimeout(directPriceTimer);reloadSelectedCustomerPrices()});document.addEventListener('input',event=>{if(event.target.closest?.('.proxy-card'))scheduleProxyDraftSave()});document.addEventListener('change',event=>{if(event.target.closest?.('.proxy-card'))scheduleProxyDraftSave()});window.addEventListener('pagehide',saveProxyDraft);document.addEventListener('DOMContentLoaded',()=>{configureDirectCustomerInput();updateCustomerMode();init()});
})();
