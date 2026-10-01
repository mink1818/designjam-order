(()=>{'use strict';
const extraStyle=document.createElement('link');extraStyle.rel='stylesheet';extraStyle.href='css/shipment-handoff-order.css?v=67088';document.head.appendChild(extraStyle);
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let groups=[],activeTask=null,taskPhotoUrls=[],directShipmentFile=null;
$('handoffDate').value=new Date(Date.now()+9*3600000).toISOString().slice(0,10);

async function guard(){
 const {data:{user}}=await supabaseClient.auth.getUser();
 if(!user){location.replace('admin.html');return false}
 const {data:p,error}=await supabaseClient.from('customers').select('is_admin,blocked,admin_role').eq('id',user.id).maybeSingle();
 if(error)throw error;
 if(!p?.is_admin||p.blocked||p.admin_role==='employee'){location.replace('admin-home.html');return false}
 document.body.classList.add('auth-ready');document.body.classList.remove('auth-pending');return true
}

async function load(){
 const date=$('handoffDate').value,start=new Date(date+'T00:00:00+09:00').toISOString(),end=new Date(date+'T23:59:59.999+09:00').toISOString();
 $('handoffList').innerHTML='<p class="empty">조회 중…</p>';
 const o=await supabaseClient.from('orders').select('*').gte('shipped_at',start).lte('shipped_at',end).eq('status','출고완료').order('shipped_at',{ascending:false}).limit(5000);
 if(o.error){$('handoffList').textContent=o.error.message;return}
 const orderMap=new Map;(o.data||[]).forEach(x=>{if(!orderMap.has(x.order_number))orderMap.set(x.order_number,x)});
 const nums=[...orderMap.keys()];let links=[];
 if(nums.length){const l=await supabaseClient.from('shipment_order_links').select('order_number,shipment_labels(id,warehouse_code,carrier_name,tracking_number,document_id,shipment_documents(storage_path,image_deleted_at))').in('order_number',nums);if(l.error)console.warn(l.error);links=l.data||[]}
 const hs=await supabaseClient.from('shipment_order_handoffs').select('*').eq('business_date',date);
 if(hs.error){$('handoffList').innerHTML=`<p class="handoff-sql-error"><b>주문별 전달기록 기능을 적용해야 합니다.</b><br>${esc(hs.error.message)}<br><small>Supabase에서 SQL/V6.7.80-ORDER-SHIPMENT-HANDOFF.sql을 실행해주세요.</small></p>`;return}
 const handoffMap=new Map((hs.data||[]).map(x=>[x.order_number,x])),groupMap=new Map;
 for(const x of orderMap.values()){
  const key=x.customer_id||x.customer_name;
  if(!groupMap.has(key))groupMap.set(key,{key,name:x.customer_name,owner:x.customer_owner_name||'',orders:[]});
  groupMap.get(key).orders.push({...x,handoff:handoffMap.get(x.order_number)||null,labels:links.filter(l=>l.order_number===x.order_number).map(l=>l.shipment_labels).filter(Boolean)});
 }
 groups=[...groupMap.values()].map(g=>({...g,orders:g.orders.sort((a,b)=>new Date(a.shipped_at)-new Date(b.shipped_at))}));render();
}

function orderMatchesState(order,state){return state==='all'||(state==='done')===!!order.handoff?.completed_at}
function render(){
 const state=$('handoffState').value,allOrders=groups.flatMap(g=>g.orders),pending=allOrders.filter(o=>!o.handoff?.completed_at).length,done=allOrders.length-pending;
 $('handoffSummary').textContent=`주문별 미전달 ${pending} · 전달완료 ${done}`;
 const visible=groups.map(g=>({...g,visibleOrders:g.orders.filter(o=>orderMatchesState(o,state))})).filter(g=>g.visibleOrders.length);
 $('handoffList').innerHTML=visible.map(g=>{
  const allPending=g.orders.filter(o=>!o.handoff?.completed_at).length,allDone=g.orders.length-allPending,labels=g.visibleOrders.flatMap(o=>o.labels),count=c=>labels.filter(x=>x.warehouse_code===c).length;
  const startOrder=(state==='done'?g.visibleOrders[0]:g.visibleOrders.find(o=>!o.handoff?.completed_at))||g.visibleOrders[0];
  return`<article class="handoff-card" data-key="${esc(g.key)}"><div class="handoff-head"><div><h2>${esc(g.name)} ${g.owner?`(${esc(g.owner)})`:''}</h2><p>S 송장 ${count('S')}장 · B 송장 ${count('B')}장 · I 송장 ${count('I')}장 · 오늘 출고 ${g.orders.length}건</p><small>미전달 ${allPending}건 · 전달완료 ${allDone}건</small></div><button class="handoff-start" data-act="work" data-order="${esc(startOrder.order_number)}">${allPending?'전달작업 시작':'전달자료 확인'}</button></div><div class="handoff-order-bundles">${g.visibleOrders.map(o=>orderRow(o)).join('')}</div></article>`;
 }).join('')||'<p class="empty">조건에 맞는 출고가 없습니다.</p>';
}

function orderRow(o){
 const delivery=o.delivery_name||o.customer_name||'-',labels=o.labels||[],done=!!o.handoff?.completed_at;
 return`<section class="handoff-order-bundle ${done?'is-done':''}"><div class="handoff-delivery"><strong>${esc(delivery)}</strong><small>${esc(o.order_number)}</small><span class="shipment-badge">${done?'전달완료':'미전달'}</span></div><p class="handoff-tracking">${labels.map(x=>`${esc(x.warehouse_code||'-')} | ${esc(x.carrier_name||'택배사 미확인')} | ${esc(x.tracking_number||'번호 없음')}`).join('<br>')||'연결된 송장 없음'}</p><div class="handoff-order-actions"><button data-act="work" data-order="${esc(o.order_number)}">명세서·송장 전달</button>${done?`<button class="undo" data-act="undo" data-order="${esc(o.order_number)}">전달완료 취소</button>`:''}</div></section>`;
}

function findOrder(orderNumber){for(const g of groups){const order=g.orders.find(o=>String(o.order_number)===String(orderNumber));if(order)return{group:g,order}}return null}

async function openWorkbench(orderNumber){
 const found=findOrder(orderNumber);if(!found)return;
 activeTask={groupKey:found.group.key,orderNumber:found.order.order_number};taskPhotoUrls=[];
 const {group,order}=found,delivery=order.delivery_name||group.name||'-',dialog=$('handoffWorkbench'),body=$('handoffWorkbenchBody');
 directShipmentFile=null;
 body.innerHTML=`<header class="workbench-head"><div><small>${esc(group.name)} ${group.owner?`(${esc(group.owner)})`:''}</small><h2>${esc(delivery)}</h2><p>${esc(order.order_number)}</p></div><span class="shipment-badge">${order.handoff?.completed_at?'전달완료':'미전달'}</span></header><section class="workbench-step"><div class="step-title"><b>1. 긴 거래명세서</b><span>복사 후 카카오톡에 Ctrl+V</span></div><button type="button" class="copy-statement" data-act="copy-statement" disabled>긴 명세서 이미지 복사</button><a target="_blank" href="statement.html?order=${encodeURIComponent(order.order_number)}">명세서 새 창으로 열기</a><iframe id="handoffStatementFrame" title="${esc(delivery)} 거래명세서" src="statement.html?order=${encodeURIComponent(order.order_number)}&handoff=1"></iframe></section><section class="workbench-step"><div class="step-title"><b>2. 송장사진 수동등록</b><span>현재 주문을 확인한 뒤 사진과 정보를 직접 등록합니다.</span></div><button type="button" data-act="pick-direct-shipment">송장사진 선택</button><input id="directShipmentFile" type="file" accept="image/*" hidden><div id="directShipmentEditor" class="direct-shipment-editor" hidden><img id="directShipmentPreview" alt="등록할 송장사진"><div><label>출고처<select id="directShipmentWarehouse"><option value="">미구분</option><option>S</option><option>B</option><option>I</option></select></label><label>택배사<input id="directShipmentCarrier" placeholder="예: 한진택배"></label><label>운송장번호<input id="directShipmentTracking" inputmode="numeric" placeholder="직접 입력 (선택)"></label><button type="button" data-act="save-direct-shipment">현재 주문에 수동 등록</button><small id="directShipmentStatus">자동인식 없이 현재 주문에 바로 연결합니다. 택배사·번호를 모르면 빈칸으로 저장할 수 있습니다.</small></div></div><div id="workbenchPhotos" class="workbench-photos"><p>송장사진을 불러오는 중…</p></div></section><section class="workbench-finish"><p>카카오톡 전송까지 확인한 다음 완료를 눌러주세요.</p><button type="button" class="done" data-act="complete-order">${order.handoff?.completed_at?'전달완료 취소':'이 주문 전달완료·다음으로'}</button></section>`;
 if(!dialog.open)dialog.showModal();
 const frame=$('handoffStatementFrame');frame.addEventListener('load',()=>{body.querySelector('[data-act="copy-statement"]').disabled=false},{once:true});
 await loadTaskPhotos(order);
}

async function loadTaskPhotos(order){
 const box=$('workbenchPhotos');if(!box)return;const valid=(order.labels||[]).filter(x=>x.shipment_documents?.storage_path&&!x.shipment_documents?.image_deleted_at),html=[];
 for(let i=0;i<valid.length;i++){
  const x=valid[i],s=await supabaseClient.storage.from('shipping-labels').createSignedUrl(x.shipment_documents.storage_path,900);
  if(s.data?.signedUrl){taskPhotoUrls.push(s.data.signedUrl);html.push(`<figure><img src="${esc(s.data.signedUrl)}" alt="송장사진 ${i+1}"><figcaption><b>송장 ${i+1}</b><span>${esc(x.warehouse_code||'-')} · ${esc(x.carrier_name||'택배사 미확인')} · ${esc(x.tracking_number||'번호 없음')}</span></figcaption><button type="button" data-act="copy-photo" data-photo-index="${taskPhotoUrls.length-1}">송장 ${i+1} 사진 복사</button></figure>`)}
 }
 box.innerHTML=html.join('')||'<p class="workbench-no-photo">등록된 송장사진이 없습니다. 위 버튼에서 현재 주문에 직접 등록하세요.</p>';
}

async function copyStatement(button){
 const frame=$('handoffStatementFrame'),original=button.textContent;button.disabled=true;button.textContent='명세서 이미지 만드는 중…';
 try{const fn=frame?.contentWindow?.copyStatementImageToClipboard;if(typeof fn!=='function')throw new Error('거래명세서가 아직 준비되지 않았습니다.');await fn();button.textContent='복사완료 · 카톡에 Ctrl+V';button.classList.add('copied')}
 catch(error){alert('긴 명세서 직접 복사가 제한되었습니다.\n새 창에서 “긴 명세서 한 장 저장”을 사용해주세요.\n\n'+(error?.message||error));button.textContent=original}
 finally{button.disabled=false}
}
async function copyPhoto(button,index){
 const url=taskPhotoUrls[index],original=button.textContent;button.disabled=true;button.textContent='복사 중…';
 try{const blob=await fetch(url).then(r=>{if(!r.ok)throw new Error('사진을 불러오지 못했습니다.');return r.blob()});const png=blob.type==='image/png'?blob:await imageBlobToPng(blob);await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);button.textContent='복사완료 · 카톡에 Ctrl+V';button.classList.add('copied')}
 catch(error){window.open(url,'_blank');alert('사진 원본을 열었습니다. 열린 사진을 복사해주세요.');button.textContent=original}
 finally{button.disabled=false}
}
async function imageBlobToPng(blob){const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close?.();return await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(new Error('사진 변환 실패')),'image/png'))}
async function fileHash(file){const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function chooseDirectShipment(){const input=$('directShipmentFile');if(input){input.value='';input.click()}}
function previewDirectShipment(file){if(!file?.type?.startsWith('image/'))return alert('송장 이미지 파일을 선택해주세요.');directShipmentFile=file;const editor=$('directShipmentEditor'),preview=$('directShipmentPreview'),status=$('directShipmentStatus');preview.src=URL.createObjectURL(file);editor.hidden=false;if(status){status.classList.remove('error');status.textContent='사진을 확인하고 출고처·택배사·운송장번호를 직접 입력한 뒤 등록하세요.'}}
async function saveDirectShipment(button){
 if(!activeTask||!directShipmentFile)return alert('먼저 송장사진 한 장을 선택해주세요.');
 const status=$('directShipmentStatus'),orderNumber=activeTask.orderNumber,carrier=$('directShipmentCarrier').value.trim(),tracking=$('directShipmentTracking').value.trim(),normalized=tracking.replace(/\D/g,'');button.disabled=true;status.textContent='중복 확인 및 저장 중…';
 try{
  const hash=await fileHash(directShipmentFile),duplicate=await supabaseClient.from('shipment_documents').select('id,original_name').eq('image_sha256',hash).maybeSingle();
  if(duplicate.error)throw duplicate.error;if(duplicate.data)throw new Error(`이미 등록된 송장사진입니다 (${duplicate.data.original_name||'기존 사진'}).`);
  if(normalized){const sameTracking=await supabaseClient.from('shipment_labels').select('id,carrier_name,tracking_number').eq('tracking_normalized',normalized).limit(1).maybeSingle();if(sameTracking.error)throw sameTracking.error;if(sameTracking.data)throw new Error(`이미 등록된 송장입니다 (${sameTracking.data.carrier_name||'택배사 미확인'} ${sameTracking.data.tracking_number||normalized}).`)}
  const user=(await supabaseClient.auth.getUser()).data.user,path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${directShipmentFile.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const upload=await supabaseClient.storage.from('shipping-labels').upload(path,directShipmentFile,{contentType:directShipmentFile.type,upsert:false});if(upload.error)throw upload.error;
  const documentResult=await supabaseClient.from('shipment_documents').insert({storage_path:path,original_name:directShipmentFile.name,mime_type:directShipmentFile.type,file_size:directShipmentFile.size,image_sha256:hash,ocr_text:null,ocr_engine:'manual-order-direct',uploaded_by:user?.id,delete_after:new Date(Date.now()+31*86400000).toISOString()}).select().single();if(documentResult.error)throw documentResult.error;
  const labelResult=await supabaseClient.from('shipment_labels').insert({document_id:documentResult.data.id,warehouse_code:$('directShipmentWarehouse').value||null,carrier_name:carrier||null,tracking_number:tracking||null,tracking_normalized:normalized||null,match_status:'matched',match_score:100,match_reasons:['출고전달 주문 직접등록']}).select().single();if(labelResult.error)throw labelResult.error;
  const linkResult=await supabaseClient.from('shipment_order_links').insert({label_id:labelResult.data.id,order_number:orderNumber,link_type:'manual',confidence:100,linked_by:user?.id});if(linkResult.error)throw linkResult.error;
  status.textContent='저장 및 주문연결 완료';await load();await openWorkbench(orderNumber);
 }catch(error){status.textContent='저장 실패: '+(error?.message||error);status.classList.add('error')}finally{button.disabled=false}
}

async function setOrderComplete(orderNumber,completed,{advance=false}={}){
 const found=findOrder(orderNumber);if(!found)return;
 if(completed&&!confirm(`${found.order.delivery_name||found.group.name} 거래명세서와 송장사진을 카카오톡에 전송했습니까?\n\n복사만 하고 아직 전송하지 않았다면 취소를 눌러주세요.`))return;
 const next=advance&&completed?found.group.orders.find(o=>o.order_number!==orderNumber&&!o.handoff?.completed_at)?.order_number:null;
 const result=await supabaseClient.rpc('set_shipment_order_handoff',{p_business_date:$('handoffDate').value,p_order_number:orderNumber,p_completed:completed});
 if(result.error)return alert('전달완료 저장 실패: '+result.error.message+'\n\nV6.7.80 SQL 적용 여부를 확인해주세요.');
 await load();
 if(next){await openWorkbench(next)}else if(advance&&completed){$('handoffWorkbench').close();alert('이 거래처의 미전달 주문을 모두 처리했습니다.')}else if($('handoffWorkbench').open){await openWorkbench(orderNumber)}
}

$('handoffList').onclick=e=>{const button=e.target.closest('[data-act]');if(!button)return;if(button.dataset.act==='work')openWorkbench(button.dataset.order);if(button.dataset.act==='undo')setOrderComplete(button.dataset.order,false)};
$('handoffWorkbenchBody').onclick=e=>{const button=e.target.closest('[data-act]');if(!button)return;if(button.dataset.act==='copy-statement')copyStatement(button);if(button.dataset.act==='copy-photo')copyPhoto(button,Number(button.dataset.photoIndex));if(button.dataset.act==='pick-direct-shipment')chooseDirectShipment();if(button.dataset.act==='save-direct-shipment')saveDirectShipment(button);if(button.dataset.act==='complete-order'&&activeTask){const found=findOrder(activeTask.orderNumber);setOrderComplete(activeTask.orderNumber,!found?.order.handoff?.completed_at,{advance:!found?.order.handoff?.completed_at})}};
$('handoffWorkbenchBody').onchange=e=>{if(e.target.id==='directShipmentFile')previewDirectShipment(e.target.files?.[0])};
document.addEventListener('paste',e=>{if(!$('handoffWorkbench')?.open||!activeTask)return;const file=[...(e.clipboardData?.items||[])].map(x=>x.getAsFile()).find(x=>x?.type?.startsWith('image/'));if(file){e.preventDefault();previewDirectShipment(file)}});
$('refreshHandoffs').onclick=load;$('handoffState').onchange=render;
async function init(){try{if(!await guard())return;await load()}catch(error){console.error(error);document.body.classList.add('auth-ready');document.body.classList.remove('auth-pending');$('handoffList').innerHTML=`<p class="empty">출고전달 화면을 불러오지 못했습니다: ${esc(error?.message||error)}</p>`}}
document.addEventListener('DOMContentLoaded',init);
})();
