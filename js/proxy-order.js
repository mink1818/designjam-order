(function(){
'use strict';
const $=id=>document.getElementById(id);
const ADMIN_SESSION_KEY='designjam_admin_session';
let customers=[],items=[],proxyPartyHistory=[],proxySavedParties=[],proxySavedDestinations=[],currentAdminId=null,activeCustomerPrices=new Map(),selectedPriceLoadToken=0,directPriceTimer=null;
let draftSaveTimer=null,draftSubmissionComplete=false;
let pendingProxyPasteAnalysis=null;
const PROXY_ITEM_CHOICE_KEY='designjam_proxy_item_choices_v1';
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
async function fetchProxyPartyHistory(){
 const out=[];for(let from=0;;from+=1000){const {data,error}=await supabaseClient.from('orders').select('customer_id,customer_name,delivery_name,delivery_phone,delivery_address,created_at,order_number').like('order_number','ADMIN-%').order('created_at',{ascending:false}).range(from,from+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out;
}
async function fetchSavedProxyParties(){
 const parties=await fetchAll('admin_proxy_parties','id,customer_name,normalized_name,linked_customer_id,is_hidden,last_used_at','customer_name');
 const destinations=await fetchAll('admin_proxy_party_destinations','id,party_id,delivery_name,delivery_phone,delivery_address,last_used_at','last_used_at');
 return{parties,destinations};
}
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
function proxyItemKind(itemNumber){const key=priceKey(itemNumber);if(/A$/.test(key))return'아동양말';if(/M$/.test(key))return'무지양말';return'일반양말'}
function proxyChoiceStorageKey(){return`${PROXY_ITEM_CHOICE_KEY}:${currentAdminId||'guest'}`}
function loadProxyItemChoices(){try{return JSON.parse(localStorage.getItem(proxyChoiceStorageKey())||'{}')}catch{return{}}}
function proxyChoiceBase(value){return priceKey(value).replace(/[AM]$/,'')}
function rememberProxyItemChoice(baseNumber,actualNumber){const choices=loadProxyItemChoices();choices[proxyChoiceBase(baseNumber)]=priceKey(actualNumber);localStorage.setItem(proxyChoiceStorageKey(),JSON.stringify(choices))}
function forgetProxyItemChoice(baseNumber){const choices=loadProxyItemChoices();delete choices[proxyChoiceBase(baseNumber)];localStorage.setItem(proxyChoiceStorageKey(),JSON.stringify(choices))}
function resolveProxyItem(value){
 const key=priceKey(value);
 // 관리자가 A/M까지 입력한 경우에만 해당 품번을 즉시 확정합니다.
 // 숫자 기본 품번만 입력한 경우에는 일반·아동(A)·무지(M)를 모두 모아 선택창을 띄웁니다.
 if(/[AM]$/.test(key)){
  const exact=items.find(x=>priceKey(x.item_number)===key);
  return{item:exact||null,candidates:exact?[exact]:[]};
 }
 if(!/\d$/.test(key))return{item:null,candidates:[]};
 const candidates=items.filter(x=>priceKey(x.item_number).replace(/[AM]$/,'')===key);
 if(candidates.length<=1)return{item:candidates[0]||null,candidates,remembered:null};
 const rememberedKey=loadProxyItemChoices()[key];
 const remembered=rememberedKey?candidates.find(item=>priceKey(item.item_number)===rememberedKey)||null:null;
 return{item:null,candidates,remembered};
}
function chooseProxyItem(requested,candidates,remembered=null){
 return new Promise(resolve=>{
  const modal=document.createElement('div');modal.className='proxy-choice-modal';
  modal.innerHTML=`<div class="proxy-choice-card"><h3>${esc(requested)} 품번 종류 선택</h3><p>주문하려는 양말 종류를 선택하세요.</p><div class="proxy-choice-buttons">${candidates.map((item,index)=>`<button type="button" class="${remembered&&priceKey(remembered.item_number)===priceKey(item.item_number)?'remembered':''}" data-index="${index}"><strong>${esc(proxyItemKind(item.item_number))}</strong><small>${esc(item.item_number)}</small>${remembered&&priceKey(remembered.item_number)===priceKey(item.item_number)?'<em>기억된 선택</em>':''}</button>`).join('')}</div><label class="proxy-choice-remember"><input type="checkbox"${remembered?' checked':''}> 다음 주문에도 이 선택 기억</label><button type="button" class="proxy-choice-cancel">취소</button></div>`;
  const finish=value=>{modal.remove();resolve(value)};
  modal.querySelectorAll('[data-index]').forEach(button=>button.onclick=()=>{const selected=candidates[Number(button.dataset.index)]||null;if(selected&&modal.querySelector('.proxy-choice-remember input')?.checked)rememberProxyItemChoice(requested,selected.item_number);else forgetProxyItemChoice(requested);finish(selected)});
  modal.querySelector('.proxy-choice-cancel').onclick=()=>finish(null);modal.onclick=e=>{if(e.target===modal)finish(null)};document.body.appendChild(modal);
 });
}
function normalizeCustomer(value){return String(value||'').trim().normalize('NFKC').replace(/\s+/g,'').toLowerCase()}
const KOREAN_INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function koreanInitialText(value){return[...String(value||'').normalize('NFKC')].map(char=>{const code=char.charCodeAt(0)-0xAC00;return code>=0&&code<=11171?KOREAN_INITIALS[Math.floor(code/588)]:char}).join('')}
function lookupMatches(label,query){const needle=normalizeCustomer(query);if(!needle)return true;const source=String(label||'');return normalizeCustomer(source).includes(needle)||normalizeCustomer(koreanInitialText(source)).includes(needle)}
function normalizeDeliveryLookup(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\-().,·]/g,'')}
function findMatchingProxyDestination(destinations,fields={}){const name=normalizeDeliveryLookup(fields.deliveryName),phone=normalizeDeliveryLookup(fields.deliveryPhone),address=normalizeDeliveryLookup(fields.deliveryAddress);if(!name&&!phone&&!address)return null;const score=row=>{const rn=normalizeDeliveryLookup(row.delivery_name),rp=normalizeDeliveryLookup(row.delivery_phone),ra=normalizeDeliveryLookup(row.delivery_address);if(name&&address&&rn===name&&ra===address)return 100;if(address&&phone&&ra===address&&rp===phone)return 90;if(name&&phone&&rn===name&&rp===phone)return 80;if(address&&ra===address)return 70;if(name&&rn===name)return 60;if(phone&&rp===phone)return 50;return 0};const best=(destinations||[]).map(row=>({row,score:score(row)})).sort((a,b)=>b.score-a.score)[0];return best?.score?best.row:null}
let proxyDestinations=[],proxyDeliveryManuallyEdited=false;
function directCustomerRows(){
 const rows=new Map();
 const hiddenNames=new Set(proxySavedParties.filter(party=>party.is_hidden).map(party=>normalizeCustomer(party.customer_name)));
 customers.forEach(customer=>{const name=String(customer.business_name||customer.owner_name||customer.email||'').trim();if(name)rows.set(normalizeCustomer(name),{name,customerId:String(customer.id),owner:customer.owner_name||'',phone:customer.phone||'',kind:'가입 거래처'})});
 proxySavedParties.forEach(party=>{const name=String(party.customer_name||'').trim(),key=normalizeCustomer(name);if(name&&!party.is_hidden&&!rows.has(key))rows.set(key,{name,customerId:String(party.linked_customer_id||''),partyId:String(party.id),owner:'',phone:'',kind:party.linked_customer_id?'가입 거래처':'미가입·저장 거래처'})});
 proxyPartyHistory.forEach(row=>{const name=String(row.customer_name||'').trim(),key=normalizeCustomer(name);if(name&&!hiddenNames.has(key)&&!rows.has(key))rows.set(key,{name,customerId:'',owner:'',phone:'',kind:'미가입·이전 주문'})});
 return [...rows.values()];
}
function renderDirectCustomerSuggestions(query=''){
 const box=$('proxyDirectCustomerSuggestions');if(!box)return;const value=String(query||'').trim();
 if(!value){box.hidden=true;box.innerHTML='';return}
 const rows=directCustomerRows().filter(row=>lookupMatches(row.name,query)).sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true})).slice(0,40);
 box.hidden=false;box.innerHTML=rows.length?rows.map((row,index)=>`<button type="button" data-direct-index="${index}"><b>${esc(row.name)}</b><small>${esc(row.kind)}${row.owner?` · ${esc(row.owner)}`:''}</small></button>`).join(''):'<p>일치하는 거래처가 없습니다. 새 거래처명으로 입력할 수 있습니다.</p>';
 box.querySelectorAll('[data-direct-index]').forEach(button=>button.onclick=()=>selectDirectCustomer(rows[Number(button.dataset.directIndex)]));
}
function selectDirectCustomer(row){
 if(!row)return;$('proxyDirectName').value=row.name;$('proxyDirectOwner').value=row.owner||'';$('proxyDirectPhone').value=row.phone||'';$('proxyDirectAddress').value='';$('proxyDirectCustomerSuggestions').hidden=true;proxyDeliveryManuallyEdited=false;loadProxyDestinations();reloadSelectedCustomerPrices();calc();scheduleProxyDraftSave();
}
function renderProxyCustomerOptions(query=''){const select=$('proxyCustomer');if(!select)return;const selected=select.value;const rows=customers.filter(customer=>lookupMatches([customer.business_name,customer.owner_name,customer.email].filter(Boolean).join(' '),query)).sort((a,b)=>String(a.business_name||a.owner_name||'').localeCompare(String(b.business_name||b.owner_name||''),'ko',{numeric:true}));select.innerHTML='<option value="">거래처 선택</option>'+rows.map(c=>`<option value="${c.id}">${esc(c.business_name||c.owner_name||'거래처')} · ${esc(c.email||String(c.id).slice(0,8))}</option>`).join('');if(rows.some(row=>String(row.id)===selected))select.value=selected}
function renderProxyCustomerSuggestions(query=''){const box=$('proxyCustomerSuggestions');if(!box)return;const value=String(query||'').trim();if(!value){box.hidden=true;box.innerHTML='';return}const rows=directCustomerRows().filter(row=>lookupMatches([row.name,row.owner,row.phone].filter(Boolean).join(' '),value)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko',{numeric:true})).slice(0,40);if(!rows.length){box.hidden=true;box.innerHTML='';return}box.hidden=false;box.innerHTML=rows.map((row,index)=>`<div class="proxy-party-suggestion-row"><button type="button" class="proxy-party-select" data-party-index="${index}"><b>${esc(row.name)}</b><small>${esc(row.kind)}${row.owner?` · ${esc(row.owner)}`:''}</small></button>${row.partyId&&!row.customerId?`<button type="button" class="proxy-party-delete" data-delete-party-id="${esc(row.partyId)}" data-delete-party-name="${esc(row.name)}">삭제</button>`:''}</div>`).join('');box.querySelectorAll('[data-party-index]').forEach(button=>button.onclick=()=>selectUnifiedProxyParty(rows[Number(button.dataset.partyIndex)]));box.querySelectorAll('[data-delete-party-id]').forEach(button=>button.onclick=event=>{event.stopPropagation();deleteSavedProxyParty(button.dataset.deletePartyId,button.dataset.deletePartyName)})}
function selectProxyCustomer(id){const customer=customers.find(c=>String(c.id)===String(id));if(!customer)return;selectUnifiedProxyParty({name:customer.business_name||customer.owner_name||customer.email,customerId:String(customer.id),owner:customer.owner_name||'',phone:customer.phone||'',kind:'가입 거래처'})}
function selectUnifiedProxyParty(row){if(!row)return;const customer=customers.find(c=>String(c.id)===String(row.customerId||''));const mode=customer?'select':'direct';document.querySelector(`input[name="proxyCustomerMode"][value="${mode}"]`).checked=true;$('proxyCustomer').value=customer?String(customer.id):'';$('proxyDirectName').value=row.name||'';$('proxyDirectOwner').value=customer?.owner_name||row.owner||'';$('proxyDirectPhone').value=customer?.phone||row.phone||'';$('proxyDirectAddress').value=customer?.address||'';$('proxyCustomerSearch').value=row.name||'';$('proxySelectedCustomerLabel').textContent=`선택됨: ${row.name}${customer?' · 가입 거래처':' · 미가입 거래처'}`;$('proxyCustomerSuggestions').hidden=true;proxyDeliveryManuallyEdited=false;loadProxyDestinations();reloadSelectedCustomerPrices();calc();scheduleProxyDraftSave()}
function renderProxyDestinationOptions(customer,query=''){const select=$('proxyDeliverySelect');if(!select)return;const selected=select.value;const rows=proxyDestinations.filter(row=>lookupMatches([row.delivery_name,row.delivery_phone,row.delivery_address].filter(Boolean).join(' '),query)).sort((a,b)=>String(a.delivery_name||'').localeCompare(String(b.delivery_name||''),'ko',{numeric:true}));const customerName=customer?.business_name||customer?.owner_name||'거래처';select.innerHTML=(customer?`<option value="registered">${esc(customerName)} 기본 납품처</option>`:'')+rows.map(row=>`<option value="${esc(row.id)}">${esc(row.delivery_name)}${row.is_default?' · 기본':''}</option>`).join('')+'<option value="new">+ 새 납품처 입력</option>';if(selected==='registered'||selected==='new'||rows.some(row=>String(row.id)===selected))select.value=selected;else select.value=customer?'registered':(rows[0]?String(rows[0].id):'new')}
function renderProxyDeliverySuggestions(query=''){
 const box=$('proxyDeliverySuggestions');if(!box)return;const value=String(query||'').trim();if(!value){box.hidden=true;box.innerHTML='';return}
 const rows=proxyDestinations.filter(row=>lookupMatches([row.delivery_name,row.delivery_phone,row.delivery_address].filter(Boolean).join(' '),value)).sort((a,b)=>String(a.delivery_name||'').localeCompare(String(b.delivery_name||''),'ko',{numeric:true})).slice(0,40);
 box.hidden=false;box.innerHTML=rows.length?rows.map((row,index)=>`<button type="button" data-delivery-index="${index}"><b>${esc(row.delivery_name)}</b><small>${esc(row.delivery_phone||row.delivery_address||'저장 납품처')}</small></button>`).join(''):'<p>해당 거래처에 저장된 납품처가 없습니다.</p>';
 box.querySelectorAll('[data-delivery-index]').forEach(button=>button.onclick=()=>selectProxyDelivery(rows[Number(button.dataset.deliveryIndex)]));
}
function selectProxyDelivery(row){if(!row)return;proxyDeliveryManuallyEdited=false;$('proxyDeliveryName').value=row.delivery_name||'';$('proxyDeliveryPhone').value=row.delivery_phone||'';$('proxyDeliveryAddress').value=row.delivery_address||'';$('proxyDeliverySelect').value=String(row.id);$('proxyDeliverySuggestions').hidden=true;updateProxyDestinationActions();scheduleProxyDraftSave()}
function updateProxyDestinationActions(){const row=proxyDestinations.find(item=>String(item.id)===String($('proxyDeliverySelect')?.value));const editable=Boolean(row)&&row.source!=='history';if($('editProxyDestination'))$('editProxyDestination').disabled=!editable;if($('deleteProxyDestination'))$('deleteProxyDestination').disabled=!editable}
function isMobileDirectInput(){return window.matchMedia?.('(max-width: 700px), (pointer: coarse)')?.matches===true}
function configureDirectCustomerInput(){const input=$('proxyDirectName');if(input)input.removeAttribute('list')}
function matchedDirectCustomer(){const key=normalizeCustomer($('proxyDirectName')?.value);if(!key)return null;return customers.find(customer=>[customer.business_name,customer.owner_name,customer.email].some(value=>normalizeCustomer(value)===key))||null}
function selectedCustomerId(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';if(mode==='direct')return String(matchedDirectCustomer()?.id||'');return String($('proxyCustomer')?.value||'')}
function proxyDraftKey(){return currentAdminId?`designjam_proxy_order_draft_${currentAdminId}`:''}
function proxyDraftRows(){return[...document.querySelectorAll('.proxy-line')].map(row=>({item_number:row.querySelector('.proxy-item')?.value||'',qty:Number(row.querySelector('.proxy-qty')?.value||1),price:Number(row.querySelector('.proxy-price')?.value||0)})).filter(row=>row.item_number.trim())}
function saveProxyDraft(){const key=proxyDraftKey();if(!key||draftSubmissionComplete)return;const draft={memo:$('proxyMemo')?.value||'',paste:$('proxyPasteInput')?.value||'',rows:proxyDraftRows(),saved_at:new Date().toISOString()};localStorage.setItem(key,JSON.stringify(draft))}
function scheduleProxyDraftSave(){clearTimeout(draftSaveTimer);draftSaveTimer=setTimeout(saveProxyDraft,180)}
function clearProxyDraft(){const key=proxyDraftKey();if(key)localStorage.removeItem(key)}
function clearProxyPartyFields(){['proxyCustomer','proxyDirectName','proxyDirectOwner','proxyDirectPhone','proxyDirectAddress','proxyDeliveryName','proxyDeliveryPhone','proxyDeliveryAddress','proxyCustomerSearch','proxyDeliverySearch'].forEach(id=>{if($(id))$(id).value=''});if($('proxyDeliverySelect'))$('proxyDeliverySelect').innerHTML='<option value="">거래처 선택 후 불러오기</option>';proxyDestinations=[];proxyDeliveryManuallyEdited=false;activeCustomerPrices.clear();selectedPriceLoadToken++;updateRegisteredPriceStatus('');if($('proxyDirectPriceMatch'))$('proxyDirectPriceMatch').hidden=true}
function resetProxyParties(){if($('proxySelectedCustomerLabel'))$('proxySelectedCustomerLabel').textContent='거래처명을 검색하거나 새로 입력하세요';const selectMode=document.querySelector('input[name="proxyCustomerMode"][value="select"]');if(selectMode)selectMode.checked=true;clearProxyPartyFields();updateProxyDestinationActions()}
function restoreProxyDraft(){const key=proxyDraftKey();if(!key)return false;let draft=null;try{draft=JSON.parse(localStorage.getItem(key)||'null')}catch{}if(!draft)return false;resetProxyParties();$('proxyMemo').value=draft.memo||'';$('proxyPasteInput').value=draft.paste||'';$('proxyLines').innerHTML='';(Array.isArray(draft.rows)?draft.rows:[]).forEach(addLine);if(!document.querySelector('.proxy-line'))addLine();updateCustomerMode();calc();return true}
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
function normalizeSmartPhone(value){const digits=String(value||'').replace(/\D/g,'');return digits.length===11?`${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`:digits.length===10?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`:String(value||'').trim()}
function smartPersonSection(text,label,nextLabel=''){
 const source=String(text||'').replace(/\r/g,''),labelRe=new RegExp(label+'\\s*[:：]?','i'),start=source.search(labelRe);if(start<0)return{};
 const after=source.slice(start).replace(new RegExp('^[ㆍ·●○◆◇▪■□★☆*\\s]*'+label+'\\s*[:：]?','i'),'');
 const end=nextLabel?after.search(new RegExp(nextLabel+'\\s*[:：]?','i')):-1,section=(end>=0?after.slice(0,end):after).trim();
 const phoneMatch=section.match(/0\d{1,2}[\s.-]*\d{3,4}[\s.-]*\d{4}/);if(!phoneMatch)return{name:section.replace(/^[ㆍ·●○◆◇▪■□★☆*\s]+|[ㆍ·●○◆◇▪■□★☆*\s]+$/g,'')};
 const before=section.slice(0,phoneMatch.index).replace(/^[ㆍ·●○◆◇▪■□★☆*\s]+|[ㆍ·●○◆◇▪■□★☆*\s]+$/g,'').trim();
 let tail=section.slice(phoneMatch.index+phoneMatch[0].length).replace(/^[ㆍ·●○◆◇▪■□★☆*,; \t]+/,'');let address='',memo='';
 const blankBreak=tail.search(/\n\s*\n/),memoLabel=tail.search(/(?:메모|요청사항|배송메모)\s*[:：]?/i),memoPhrase=tail.search(/(?:문\s*앞|문앞|경비실|부재\s*시|놓아\s*주세요|연락\s*(?:바랍니다|주세요)|배송\s*요청)/i);
 const splitAt=[blankBreak,memoLabel,memoPhrase].filter(index=>index>=0).sort((a,b)=>a-b)[0];
 if(Number.isInteger(splitAt)){address=tail.slice(0,splitAt);memo=tail.slice(splitAt).replace(/^[\sㆍ·|]*(?:메모|요청사항|배송메모)?\s*[:：]?\s*/i,'')}else address=tail;
 const clean=value=>String(value||'').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').replace(/^[ㆍ·●○◆◇▪■□★☆*\s]+|[ㆍ·●○◆◇▪■□★☆*~\s]+$/g,'').trim();
 return{name:clean(before.split(/\n/).filter(Boolean).pop()||before),phone:normalizeSmartPhone(phoneMatch[0]),address:clean(address),memo:clean(memo)};
}
function exactProxyRegistered(value){const key=priceKey(value);return items.find(row=>priceKey(row.item_number)===key)||null}
function smartProxyItems(text){
 let orderText=String(text||'');const receiverIndex=orderText.search(/(?:받는\s*사람|받는\s*분|수령인|수취인|배송받는\s*분)/i);if(receiverIndex>=0)orderText=orderText.slice(0,receiverIndex);orderText=orderText.replace(/0\d{1,2}[\s.-]*\d{3,4}[\s.-]*\d{4}/g,' ');
 const tokens=orderText.match(/(?:[SBI][-_]?)?\d+[AM]?(?:[~～](?:[SBI][-_]?)?\d+[AM]?)?(?:\s*(?:죽|족))?(?:\s*(?:[-:/.xX×*=]|수량\s*[:：]?)\s*\d+\s*(?:죽|족)?)?/gi)||[],out=[];
 tokens.forEach(raw=>{let token=raw.trim().replace(/\s*(?:죽|족)$/i,''),qty=1;const exact=exactProxyRegistered(token);if(!exact){const quantity=token.match(/^(.+?)\s*(?:[-:/.xX×*=]|수량\s*[:：]?)\s*(\d+)$/i);if(quantity){token=quantity[1].trim();qty=Math.max(1,Number(quantity[2]))}}const range=expandPastedItemRange(token);if(range.length)range.forEach(item=>out.push({item,qty}));else if(/^(?:[SBI][-_]?)?\d+[AM]?$/i.test(normalizeItem(token)))out.push({item:token,qty})});return out;
}
function analyzeProxyPaste(text){
 const source=String(text||'').normalize('NFKC'),receiverLabel='(?:받는\\s*사람|받는\\s*분|수령인|수취인|배송받는\\s*분)',senderLabel='(?:보내는\\s*사람|보내는\\s*분|발송인|주문자)',receiver=smartPersonSection(source,receiverLabel,senderLabel),sender=smartPersonSection(source,senderLabel),fields={customer:sender.name||'',delivery:receiver.name||'',phone:receiver.phone||'',address:receiver.address||'',memo:receiver.memo||''};
 const labels=[['customer',/(?:거래처명?|업체명?)\s*[:：]\s*([^\n;|]+)/i],['delivery',/(?:납품처명?|배송처명?)\s*[:：]\s*([^\n;|]+)/i],['phone',/(?:연락처|전화(?:번호)?)\s*[:：]\s*([^\n;|]+)/i],['address',/(?:주소|납품주소|배송주소)\s*[:：]\s*([^\n;|]+)/i],['memo',/(?:메모|요청사항)\s*[:：]\s*([^\n;|]+)/i]];
 labels.forEach(([key,re])=>{const match=source.match(re);if(match)fields[key]=match[1].trim()});const lineItems=[];source.split(/\r?\n/).forEach(line=>{const range=expandPastedItemRange(line);if(range.length)return range.forEach(item=>lineItems.push({item,qty:1}));const parsed=parsePastedItemLine(line);if(/^(?:[SBI][-_]?)?\d+[AM]?$/i.test(normalizeItem(parsed.item)))lineItems.push(parsed)});return{fields,items:lineItems.length?lineItems:smartProxyItems(source)};
}
function renderProxyPasteAnalysis(){
 const text=String($('proxyPasteInput')?.value||'').trim();if(!text)return alert('붙여넣을 주문정보를 입력하세요.');pendingProxyPasteAnalysis=analyzeProxyPaste(text);const {fields,items:rows}=pendingProxyPasteAnalysis,box=$('proxyPasteAnalysis');
 const option=(key,label,value,wide='',defaultChecked=false)=>`<label class="${wide}"><input type="checkbox" data-smart-field="${key}" ${value&&defaultChecked?'checked':''} ${value?'':'disabled'}><span><b>${label}</b><br>${esc(value||'인식 안 됨')}</span></label>`;
 box.innerHTML=`<h3>자동 분석 결과 · 적용할 항목만 선택</h3><div class="smart-paste-options">${option('items','품번·수량',rows.map(row=>`${row.item} ${row.qty}죽`).join(', '),'smart-paste-items',true)}${option('customer','거래처명',fields.customer,'',true)}${option('delivery','실제 납품처명',fields.delivery,'',true)}${option('memo','메모',fields.memo)}</div>${rows.length?'':'<p class="smart-paste-warning">인식된 품번이 없습니다. 원문을 확인해 주세요.</p>'}`;box.hidden=false;$('confirmProxyPaste').hidden=false;$('proxyPasteResult').textContent='분석 결과를 확인한 뒤 선택 항목 적용을 눌러주세요.';
}
function normalizeProxyPhotoText(value){
 return String(value||'').normalize('NFKC').replace(/\b[0-9OQIL|]{2,8}[AM]?\b/gi,token=>{if(!/\d/.test(token))return token;const suffix=/[AM]$/i.test(token)?token.slice(-1).toUpperCase():'';const body=suffix?token.slice(0,-1):token;return body.replace(/[OQ]/gi,'0').replace(/[IL|]/gi,'1')+suffix}).replace(/[‐‑‒–—]/g,'-').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
async function analyzeProxyOrderPhoto(){
 const input=$('proxyOrderPhoto'),file=input?.files?.[0],status=$('proxyPhotoStatus'),button=$('analyzeProxyPhoto');
 if(!file)return alert('분석할 주문 사진을 먼저 선택하세요.');
 if(!window.Tesseract){status.textContent='사진 분석 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도하세요.';status.classList.add('error');return}
 try{
  button.disabled=true;status.classList.remove('error');status.textContent='사진 글자를 준비하고 있습니다…';
  const result=await window.Tesseract.recognize(file,'kor+eng',{logger:message=>{if(message.status==='recognizing text')status.textContent=`사진 글자 인식 중… ${Math.round(Number(message.progress||0)*100)}%`;else if(message.status)status.textContent='사진 분석 준비 중…';}});
  const text=normalizeProxyPhotoText(result?.data?.text||'');
  if(!text)throw new Error('사진에서 글자를 찾지 못했습니다. 더 밝고 선명하게 다시 촬영해주세요.');
  $('proxyPasteInput').value=text;pendingProxyPasteAnalysis=null;renderProxyPasteAnalysis();scheduleProxyDraftSave();status.textContent='사진 분석 완료 · 아래 품번과 수량을 반드시 확인하세요.';
 }catch(error){status.textContent='사진 분석 실패: '+(error?.message||error);status.classList.add('error')}
 finally{button.disabled=false}
}
async function applyPastedOrder(event){
 if(event?.currentTarget?.id==='applyProxyPaste'||!pendingProxyPasteAnalysis)return renderProxyPasteAnalysis();const checked=key=>Boolean($('proxyPasteAnalysis')?.querySelector(`[data-smart-field="${key}"]:checked`)),fields=pendingProxyPasteAnalysis.fields,raw=checked('items')?pendingProxyPasteAnalysis.items:[],merged=new Map(),unmatched=[];
 for(const row of raw){const resolution=resolveProxyItem(row.item);let found=resolution.item;if(!found&&resolution.candidates.length>1)found=await chooseProxyItem(row.item,resolution.candidates,resolution.remembered);const itemNumber=found?.item_number||row.item;if(!found)unmatched.push(row.item);const key=normalizeItem(itemNumber),current=merged.get(key)||{item_number:itemNumber,qty:0};current.qty+=row.qty;merged.set(key,current)}
 if(checked('customer')&&fields.customer){const matched=customers.find(c=>normalizeCustomer(c.business_name)===normalizeCustomer(fields.customer));if(matched)selectUnifiedProxyParty({name:matched.business_name||matched.owner_name||matched.email,customerId:String(matched.id),owner:matched.owner_name||'',phone:matched.phone||'',kind:'가입 거래처'});else{document.querySelector('input[name="proxyCustomerMode"][value="direct"]').checked=true;$('proxyDirectName').value=fields.customer;$('proxyCustomerSearch').value=fields.customer;$('proxySelectedCustomerLabel').textContent=`새 미가입 거래처: ${fields.customer}`}updateCustomerMode();await loadProxyDestinations();await reloadSelectedCustomerPrices()}
 if(checked('delivery')&&fields.delivery)$('proxyDeliveryName').value=fields.delivery;if(checked('phone')&&fields.phone)$('proxyDeliveryPhone').value=fields.phone;if(checked('address')&&fields.address)$('proxyDeliveryAddress').value=fields.address;if(checked('memo')&&fields.memo)$('proxyMemo').value=fields.memo;
 if(selectedCustomerId())await loadProxyDestinations({deliveryName:checked('delivery')?fields.delivery:'',deliveryPhone:checked('phone')?fields.phone:'',deliveryAddress:checked('address')?fields.address:''});const parsed=[...merged.values()];if(parsed.length){$('proxyLines').innerHTML='';parsed.forEach(row=>addLine(row));refreshAllLinePrices()}$('proxyPasteResult').textContent=`선택 항목 적용 완료${parsed.length?` · ${parsed.length.toLocaleString()}품번`:''}${unmatched.length?` · 상품 미등록 확인 ${[...new Set(unmatched)].length}개`:''}`;pendingProxyPasteAnalysis=null;$('proxyPasteAnalysis').hidden=true;$('confirmProxyPaste').hidden=true;calc();scheduleProxyDraftSave();
}

async function loadProxyDestinations(preferredFields=null){
 const customerId=selectedCustomerId(),select=$('proxyDeliverySelect');if(!select)return[];proxyDestinations=[];
 const customer=customers.find(c=>String(c.id)===String(customerId));
 if(customerId){const {data,error}=await supabaseClient.from('customer_delivery_destinations').select('id,delivery_name,delivery_phone,delivery_address,is_default,last_used_at').eq('customer_id',customerId).order('is_default',{ascending:false}).order('last_used_at',{ascending:false}).limit(500);if(error)throw error;proxyDestinations=(data||[]).map(row=>({...row,source:'customer'}))}
 else {const directName=normalizeCustomer($('proxyDirectName')?.value),party=proxySavedParties.find(row=>normalizeCustomer(row.customer_name)===directName),unique=new Map();if(party)proxySavedDestinations.filter(row=>String(row.party_id)===String(party.id)).forEach(row=>{const key=normalizeDeliveryLookup(row.delivery_name)+'|'+normalizeDeliveryLookup(row.delivery_address);unique.set(key,{...row,source:'proxy'})});proxyPartyHistory.filter(row=>normalizeCustomer(row.customer_name)===directName&&String(row.delivery_name||'').trim()).forEach((row,index)=>{const key=normalizeDeliveryLookup(row.delivery_name)+'|'+normalizeDeliveryLookup(row.delivery_address);if(!unique.has(key))unique.set(key,{id:`history-${index}`,delivery_name:row.delivery_name,delivery_phone:row.delivery_phone||'',delivery_address:row.delivery_address||'',is_default:false,last_used_at:row.created_at,source:'history'})});proxyDestinations=[...unique.values()]}
 renderProxyDestinationOptions(customer,'');
 const applySelection=()=>{if(proxyDeliveryManuallyEdited&&!preferredFields)return;const row=proxyDestinations.find(x=>String(x.id)===select.value);if(select.value==='registered'&&customer){$('proxyDeliveryName').value=customer.business_name||'';$('proxyDeliveryPhone').value=customer.phone||'';$('proxyDeliveryAddress').value=customer.address||'';}else if(select.value==='new'){if(!preferredFields){$('proxyDeliveryPhone').value='';$('proxyDeliveryAddress').value='';}}else if(row){$('proxyDeliveryName').value=row.delivery_name||'';$('proxyDeliveryPhone').value=row.delivery_phone||'';$('proxyDeliveryAddress').value=row.delivery_address||'';}scheduleProxyDraftSave()};
 select.onchange=()=>{proxyDeliveryManuallyEdited=false;preferredFields=null;applySelection();updateProxyDestinationActions()};
 const matched=findMatchingProxyDestination(proxyDestinations,preferredFields||{});if(proxyDeliveryManuallyEdited)select.value='new';else if(matched)select.value=String(matched.id);else if(preferredFields&&(preferredFields.deliveryName||preferredFields.deliveryPhone||preferredFields.deliveryAddress))select.value='new';else select.value=customer?'registered':(proxyDestinations[0]?String(proxyDestinations[0].id):'new');applySelection();updateProxyDestinationActions();return proxyDestinations;
}
function refreshAllLinePrices(){document.querySelectorAll('.proxy-line').forEach(row=>{const found=findItem(row.querySelector('.proxy-item')?.value);if(found)row.querySelector('.proxy-price').value=effectiveProxyPrice(found.item_number,found.price)});const match=matchedDirectCustomer(),box=$('proxyDirectPriceMatch');if(box){box.hidden=!match;box.textContent=match?`등록 거래처 “${match.business_name||match.owner_name||match.email}”의 품번별 전용 단가를 적용합니다.`:''}calc()}
function currentCustomerName(){const mode=document.querySelector('input[name="proxyCustomerMode"]:checked')?.value||'select';if(mode==='direct')return ($('proxyDirectName')?.value||'').trim();const c=customers.find(x=>String(x.id)===String($('proxyCustomer')?.value||''));return c?(c.business_name||c.owner_name||c.email||'등록 거래처'):''}
async function refreshSavedProxyDirectory(){try{const saved=await fetchSavedProxyParties();proxySavedParties=saved.parties||[];proxySavedDestinations=saved.destinations||[]}catch(error){console.warn('대신주문 저장 거래처 목록 조회 실패',error.message)}}
async function editSelectedProxyDestination(){const row=proxyDestinations.find(item=>String(item.id)===String($('proxyDeliverySelect')?.value));if(!row||row.source==='history')return;const name=prompt('납품처명을 수정하세요.',row.delivery_name||'');if(name===null||!name.trim())return;const phone=prompt('연락처를 수정하세요. 없으면 비워두세요.',row.delivery_phone||'');if(phone===null)return;const address=prompt('주소를 수정하세요. 없으면 비워두세요.',row.delivery_address||'');if(address===null)return;let result;if(row.source==='customer')result=await supabaseClient.rpc('save_customer_delivery_destination',{p_id:Number(row.id),p_delivery_name:name.trim(),p_delivery_phone:phone.trim(),p_delivery_address:address.trim(),p_is_default:Boolean(row.is_default)});else result=await supabaseClient.rpc('save_admin_proxy_party_destination',{p_customer_name:currentCustomerName(),p_linked_customer_id:selectedCustomerId()||null,p_destination_id:Number(row.id),p_delivery_name:name.trim(),p_delivery_phone:phone.trim(),p_delivery_address:address.trim()});if(result.error)return alert('납품처 수정 실패: '+result.error.message+'\n\nSupabase에서 V6.5.70 SQL을 먼저 실행해주세요.');await refreshSavedProxyDirectory();proxyDeliveryManuallyEdited=false;await loadProxyDestinations({deliveryName:name.trim(),deliveryPhone:phone.trim(),deliveryAddress:address.trim()})}
async function deleteSelectedProxyDestination(){const row=proxyDestinations.find(item=>String(item.id)===String($('proxyDeliverySelect')?.value));if(!row||row.source==='history')return;if(!confirm(`저장된 납품처 “${row.delivery_name}”을 삭제할까요?\n기존 주문내역은 삭제되지 않습니다.`))return;const result=row.source==='customer'?await supabaseClient.rpc('delete_customer_delivery_destination',{p_id:Number(row.id)}):await supabaseClient.rpc('delete_admin_proxy_party_destination',{p_destination_id:Number(row.id)});if(result.error)return alert('납품처 삭제 실패: '+result.error.message+'\n\nSupabase에서 V6.5.70 SQL을 먼저 실행해주세요.');await refreshSavedProxyDirectory();proxyDeliveryManuallyEdited=false;await loadProxyDestinations();}
async function deleteSavedProxyParty(partyId,partyName){if(!partyId)return;if(!confirm(`미가입 거래처 “${partyName}”을 저장목록에서 삭제할까요?\n\n기존 주문내역은 삭제되지 않습니다.`))return;const {error}=await supabaseClient.rpc('delete_admin_proxy_party',{p_party_id:Number(partyId)});if(error)return alert('미가입 거래처 삭제 실패: '+error.message+'\n\nSupabase에서 V6.5.70 SQL을 먼저 실행해주세요.');const selectedSame=normalizeCustomer(currentCustomerName())===normalizeCustomer(partyName);await refreshSavedProxyDirectory();if(selectedSame)resetProxyParties();else renderProxyCustomerSuggestions($('proxyCustomerSearch')?.value||'');alert(`“${partyName}”이 미가입 거래처 저장목록에서 삭제되었습니다.`)}
function safeDirectOwnerName(){
 const owner=String($('proxyDirectOwner')?.value||'').trim();if(!owner)return'';
 try{const profile=JSON.parse(sessionStorage.getItem('designjam_admin_profile')||localStorage.getItem('designjam_admin_profile')||'{}');const adminName=String(profile.name||'').trim();if(adminName&&owner.normalize('NFKC')===adminName.normalize('NFKC'))return''}catch{}
 return owner;
}
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
 const deliveryName=($('proxyDeliveryName')?.value||'').trim();const deliveryPhone=($('proxyDeliveryPhone')?.value||'').trim();const deliveryAddress=($('proxyDeliveryAddress')?.value||'').trim();
 if(!deliveryName){showError('납품처명을 입력하세요.');return}
 if(!lines.length){showError('주문 품번을 한 개 이상 입력하세요.');return}
 const unknown=lines.filter(x=>!findItem(x.item_number)).map(x=>x.item_number);if(unknown.length){showError(`출고지를 확인할 수 없는 미등록 품번은 주문할 수 없습니다: ${unknown.join(', ')}`);return}
 const missingWarehouse=lines.filter(x=>!['S','B','I'].includes(String(findItem(x.item_number)?.warehouse_code||'').toUpperCase())).map(x=>x.item_number);if(missingWarehouse.length){showError(`출고지(S·B·I)가 등록되지 않은 품번입니다: ${missingWarehouse.join(', ')} · 상품관리에서 출고지를 먼저 지정해주세요.`);return}
 if(lines.some(x=>!x.price)&&!confirm('단가가 0원인 품목이 있습니다. 그대로 주문할까요?'))return;
 const btn=$('submitProxyOrder');btn.disabled=true;btn.textContent='주문 저장 중...';
 try{
  const order=makeOrderNumber(),memo=($('proxyMemo').value||'').trim();const customerName=mode==='direct'?directName:(customer.business_name||customer.owner_name||customer.email);
  const directInfo=mode==='direct'?[`대표자: ${safeDirectOwnerName()}`,`전화: ${($('proxyDirectPhone').value||'').trim()}`,`주소: ${($('proxyDirectAddress').value||'').trim()}`].filter(x=>!x.endsWith(': ')).join(' / '):'';
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
  const ownerName=mode==='direct'?safeDirectOwnerName():(customer?.owner_name||'');
  const deliverySave=await supabaseClient.rpc('save_order_delivery_info',{p_order_number:order,p_owner_name:ownerName,p_delivery_name:deliveryName,p_delivery_phone:deliveryPhone,p_delivery_address:deliveryAddress});
  if(deliverySave.error)throw new Error(`납품처 저장 실패: ${deliverySave.error.message}`);
  const deliveryConfirm=await supabaseClient.from('orders').update({customer_owner_name:ownerName||null,delivery_name:deliveryName,delivery_phone:deliveryPhone||null,delivery_address:deliveryAddress||null}).eq('order_number',order);
  if(deliveryConfirm.error){const check=await supabaseClient.from('orders').select('delivery_name').eq('order_number',order).limit(1).maybeSingle();if(check.error||String(check.data?.delivery_name||'').trim()!==deliveryName)throw new Error(`실제 납품처 최종저장 실패: ${deliveryConfirm.error.message}`)}
  if(selectedCustomerId()&&$('proxyDeliverySelect')?.value==='new'){
   const saved=await supabaseClient.rpc('save_admin_customer_delivery_destination',{p_customer_id:selectedCustomerId(),p_delivery_name:deliveryName,p_delivery_phone:deliveryPhone,p_delivery_address:deliveryAddress});
   if(saved.error)throw new Error(`새 납품처 목록 저장 실패: ${saved.error.message}`);
  }
  if(mode==='direct'){
   const savedParty=await supabaseClient.rpc('save_admin_proxy_party_destination',{p_customer_name:customerName,p_linked_customer_id:directCustomer?.id||null,p_destination_id:null,p_delivery_name:deliveryName,p_delivery_phone:deliveryPhone,p_delivery_address:deliveryAddress});
   if(savedParty.error)throw new Error(`직접입력 거래처·납품처 목록 저장 실패: ${savedParty.error.message} · V6.5.70 SQL을 먼저 실행해주세요.`);
   const restoredParty=await supabaseClient.rpc('restore_admin_proxy_party',{p_customer_name:customerName});
   if(restoredParty.error)throw new Error(`미가입 거래처 목록 복원 실패: ${restoredParty.error.message} · V6.5.70 SQL을 먼저 실행해주세요.`);
  }
  draftSubmissionComplete=true;clearProxyDraft();resetProxyParties();calc();alert(`관리자 대신주문이 접수되었습니다.\n거래처: ${customerName}\n총 ${lines.length}품번\n주문번호: ${order}\n피킹 화면에서 최종검증하세요.`);location.href=`picking.html?order=${encodeURIComponent(order)}`;
 }catch(e){showError('대신 주문 저장 실패: '+(e?.message||e));btn.disabled=false;btn.textContent='대신 주문 접수'}
}
async function init(){
 if(!await guard())return;
 try{
  const [customerRows,inventoryRows,groups,partyHistory,savedDirectory]=await Promise.all([fetchAll('customers','id,business_name,owner_name,email,phone,address,approved,blocked,is_admin','created_at'),fetchAll('inventory_items','*','item_number'),fetchAll('product_groups','*','sort_order'),fetchProxyPartyHistory(),fetchSavedProxyParties().catch(()=>({parties:[],destinations:[]}))]);
  customers=customerRows.filter(x=>!x.is_admin&&!x.blocked);
  proxyPartyHistory=partyHistory||[];
  proxySavedParties=savedDirectory.parties||[];proxySavedDestinations=savedDirectory.destinations||[];
  const productMap=new Map();(groups||[]).forEach(g=>asItemNumbers(g.item_numbers).forEach(n=>productMap.set(normalizeItem(n),{price:Number(g.price||0),warehouse_code:String(g.warehouse_code||'').trim().toUpperCase()||null})));
  items=(inventoryRows||[]).map(x=>{const product=productMap.get(normalizeItem(x.item_number))||{};return{...x,price:rawPrice(x)||product.price||0,warehouse_code:x.warehouse_code||product.warehouse_code||null}});
  // product_groups에만 있고 inventory_items에는 아직 없는 품번도 대신주문 검색에 노출
  for(const g of groups||[])for(const n of asItemNumbers(g.item_numbers)){const key=normalizeItem(n);if(key&&!items.some(x=>normalizeItem(x.item_number)===key))items.push({item_number:String(n).trim(),price:Number(g.price||0),warehouse_code:String(g.warehouse_code||'').trim().toUpperCase()||null})}
  items.sort((a,b)=>String(a.item_number).localeCompare(String(b.item_number),'ko',{numeric:true}));
  renderProxyCustomerOptions();
  const customerNames=[...new Set(customers.map(c=>String(c.business_name||c.owner_name||c.email||'').trim()).filter(Boolean))];
  $('proxyCustomerNameList').innerHTML=customerNames.slice(0,300).map(name=>`<option value="${esc(name)}"></option>`).join('');
  configureDirectCustomerInput();
  $('proxyItemList').innerHTML=items.map(x=>`<option value="${esc(x.item_number)}"></option>`).join('');
  resetProxyParties();if(!restoreProxyDraft())addLine();const preset=new URLSearchParams(location.search).get('customer');if(preset){$('proxyCustomer').value=preset;$('proxyCustomer').dispatchEvent(new Event('change'))}await reloadSelectedCustomerPrices();calc();
 }catch(e){showError('대신 주문 화면 불러오기 실패: '+(e?.message||e))}
}
function updateCustomerMode(){activeCustomerPrices.clear();$('proxySelectWrap').hidden=false;$('proxyDirectWrap').hidden=true;if($('proxyDirectPriceMatch'))$('proxyDirectPriceMatch').hidden=true;refreshAllLinePrices();scheduleProxyDraftSave()}
$('addProxyLine').onclick=()=>{addLine();scheduleProxyDraftSave()};$('applyProxyPaste').onclick=applyPastedOrder;$('submitProxyOrder').onclick=submit;document.querySelectorAll('input[name="proxyCustomerMode"]').forEach(x=>x.addEventListener('change',()=>{clearProxyPartyFields();updateCustomerMode();reloadSelectedCustomerPrices();calc()}));$('proxyCustomer').addEventListener('change',()=>{reloadSelectedCustomerPrices();scheduleProxyDraftSave()});$('proxyDirectName').addEventListener('input',()=>{clearTimeout(directPriceTimer);scheduleProxyDraftSave();const name=String($('proxyDirectName').value||'').trim();renderDirectCustomerSuggestions(name);if(name)directPriceTimer=setTimeout(reloadSelectedCustomerPrices,450);else{selectedPriceLoadToken++;updateRegisteredPriceStatus('거래처명을 입력하면 전용단가를 확인합니다.');refreshAllLinePrices();proxyDestinations=[];renderProxyDestinationOptions(null)}});$('proxyDirectName').addEventListener('change',()=>{const query=$('proxyDirectName').value,exact=directCustomerRows().find(row=>normalizeCustomer(row.name)===normalizeCustomer(query)),matches=directCustomerRows().filter(row=>lookupMatches(row.name,query));if(exact||matches.length===1)selectDirectCustomer(exact||matches[0]);else{loadProxyDestinations();reloadSelectedCustomerPrices()}});$('proxyDirectName').addEventListener('blur',()=>{clearTimeout(directPriceTimer);setTimeout(()=>$('proxyDirectCustomerSuggestions').hidden=true,180);reloadSelectedCustomerPrices()});document.addEventListener('input',event=>{if(event.target.closest?.('.proxy-card'))scheduleProxyDraftSave()});document.addEventListener('change',event=>{if(event.target.closest?.('.proxy-card'))scheduleProxyDraftSave()});window.addEventListener('pagehide',saveProxyDraft);window.addEventListener('pageshow',event=>{if(event.persisted){resetProxyParties();calc()}});document.addEventListener('DOMContentLoaded',()=>{configureDirectCustomerInput();updateCustomerMode();init()});
document.getElementById('proxyCustomer')?.addEventListener('change',()=>{proxyDeliveryManuallyEdited=false;const customer=customers.find(c=>String(c.id)===String($('proxyCustomer').value));if(customer){$('proxySelectedCustomerLabel').textContent=`선택됨: ${customer.business_name||customer.owner_name||customer.email}`;$('proxyCustomerSearch').value=customer.business_name||customer.owner_name||'';$('proxyDeliveryName').value=customer.business_name||'';$('proxyDeliveryPhone').value=customer.phone||'';$('proxyDeliveryAddress').value=customer.address||'';}else if($('proxySelectedCustomerLabel'))$('proxySelectedCustomerLabel').textContent='선택된 거래처 없음';loadProxyDestinations();scheduleProxyDraftSave()});
$('proxyCustomerSearch')?.addEventListener('input',event=>{const value=String(event.target.value||'').trim();$('proxyCustomer').value='';$('proxyDirectName').value=value;$('proxyDirectOwner').value='';$('proxyDirectPhone').value='';$('proxyDirectAddress').value='';document.querySelector('input[name="proxyCustomerMode"][value="direct"]').checked=true;$('proxySelectedCustomerLabel').textContent=value?`직접입력 중: ${value}`:'거래처명을 검색하거나 새로 입력하세요';proxyDestinations=[];renderProxyDestinationOptions(null);$('proxyDeliveryName').value='';$('proxyDeliveryPhone').value='';$('proxyDeliveryAddress').value='';updateProxyDestinationActions();activeCustomerPrices.clear();selectedPriceLoadToken++;refreshAllLinePrices();clearTimeout(directPriceTimer);if(value)directPriceTimer=setTimeout(reloadSelectedCustomerPrices,450);renderProxyCustomerOptions(value);renderProxyCustomerSuggestions(value);calc()});
$('proxyCustomerSearch')?.addEventListener('change',event=>{const query=String(event.target.value||'').trim(),exact=directCustomerRows().find(row=>normalizeCustomer(row.name)===normalizeCustomer(query)),matches=directCustomerRows().filter(row=>lookupMatches(row.name,query));if(exact||matches.length===1)selectUnifiedProxyParty(exact||matches[0]);else if(query){$('proxyDirectName').value=query;document.querySelector('input[name="proxyCustomerMode"][value="direct"]').checked=true;$('proxySelectedCustomerLabel').textContent=`새 미가입 거래처: ${query}`;loadProxyDestinations();reloadSelectedCustomerPrices();calc()}});
$('proxyDeliverySearch')?.addEventListener('input',event=>renderProxyDestinationOptions(customers.find(c=>String(c.id)===String(selectedCustomerId())),event.target.value));
$('proxyDeliverySearch')?.addEventListener('change',event=>{const matches=proxyDestinations.filter(row=>lookupMatches(row.delivery_name,event.target.value));if(matches.length===1){renderProxyDestinationOptions(null,event.target.value);$('proxyDeliverySelect').value=String(matches[0].id);$('proxyDeliverySelect').dispatchEvent(new Event('change'))}});
$('proxyDeliveryName')?.addEventListener('input',event=>{renderProxyDeliverySuggestions(event.target.value);proxyDeliveryManuallyEdited=true;if($('proxyDeliverySelect'))$('proxyDeliverySelect').value='new';scheduleProxyDraftSave()});
$('proxyDeliveryName')?.addEventListener('blur',()=>setTimeout(()=>{$('proxyDeliverySuggestions').hidden=true},180));
$('proxyDeliveryName')?.addEventListener('change',event=>{const query=String(event.target.value||'').trim();const exact=proxyDestinations.find(row=>normalizeCustomer(row.delivery_name)===normalizeCustomer(query));const initialMatches=proxyDestinations.filter(row=>lookupMatches(row.delivery_name,query));const matched=exact||(initialMatches.length===1?initialMatches[0]:null);if(matched){proxyDeliveryManuallyEdited=false;$('proxyDeliverySelect').value=String(matched.id);$('proxyDeliverySelect').dispatchEvent(new Event('change'))}else{$('proxyDeliverySelect').value='new';$('proxyDeliveryPhone').value='';$('proxyDeliveryAddress').value='';scheduleProxyDraftSave()}});
$('editProxyDestination')?.addEventListener('click',editSelectedProxyDestination);
$('deleteProxyDestination')?.addEventListener('click',deleteSelectedProxyDestination);
$('confirmProxyPaste')?.addEventListener('click',applyPastedOrder);
$('proxyPasteInput')?.addEventListener('input',()=>{pendingProxyPasteAnalysis=null;$('proxyPasteAnalysis').hidden=true;$('confirmProxyPaste').hidden=true});
$('proxyOrderPhoto')?.addEventListener('change',event=>{const file=event.target.files?.[0],preview=$('proxyOrderPhotoPreview'),status=$('proxyPhotoStatus');if(preview.dataset.url)URL.revokeObjectURL(preview.dataset.url);if(!file){preview.classList.remove('show');preview.removeAttribute('src');return}const url=URL.createObjectURL(file);preview.dataset.url=url;preview.src=url;preview.classList.add('show');status.classList.remove('error');status.textContent='사진이 선택되었습니다. “사진에서 품번·수량 읽기”를 눌러주세요.'});
$('analyzeProxyPhoto')?.addEventListener('click',analyzeProxyOrderPhoto);
})();
