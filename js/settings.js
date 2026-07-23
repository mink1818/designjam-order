const supabaseClient=window.supabase.createClient('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87');
const ADMIN_SESSION_KEY='designjam_admin_session',ADMIN_EMAILS=new Set(['900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com']);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const attr=esc;
let editingAccountId=null;
let adminAccountRefreshTimer=null;
let adminAccountChannel=null;

async function guard(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user)return location.replace('admin.html');
  const {data:p}=await supabaseClient.from('customers').select('is_admin').eq('id',user.id).maybeSingle();
  if(!ADMIN_EMAILS.has(String(user.email).toLowerCase())&&!p?.is_admin)return location.replace('admin.html');
  document.body.classList.add('auth-ready');return true;
}

function clearForm(){
  editingAccountId=null;
  ['accountLabel','accountBank','accountNumber','accountHolder'].forEach(id=>document.getElementById(id).value='');
  const btn=document.getElementById('addAccountBtn');
  btn.textContent='계좌 추가';
  document.getElementById('cancelAccountEditBtn').hidden=true;
}

function startEditAccount(account){
  editingAccountId=account.id;
  accountLabel.value=account.label||'';
  accountBank.value=account.bank_name||'';
  accountNumber.value=account.account_number||'';
  accountHolder.value=account.account_holder||'';
  addAccountBtn.textContent='계좌 수정 저장';
  cancelAccountEditBtn.hidden=false;
  window.scrollTo({top:0,behavior:'smooth'});
}

async function loadAccounts(){
  const box=document.getElementById('accountList');
  const {data,error}=await supabaseClient.from('payment_accounts').select('*').order('is_default',{ascending:false}).order('created_at');
  if(error){box.innerHTML=`<div class="product-card"><p>계좌 테이블 설치가 필요합니다: ${esc(error.message)}</p></div>`;return;}
  box.innerHTML=data?.length?data.map(a=>`<article class="product-card v3-account-card ${a.is_default?'default':''} ${a.is_active?'':'inactive'}"><div><h2>${a.is_default?'● ':''}${esc(a.label)}</h2><p>${esc(a.bank_name)} ${esc(a.account_number)}</p><p>예금주 ${esc(a.account_holder)}</p><span class="account-state ${a.is_active?'active':'inactive'}">${a.is_active?'사용 중':'사용 안 함'}</span></div><div class="v3-card-actions">${!a.is_default&&a.is_active?`<button class="cart-btn" onclick="setDefault('${a.id}')">기본계좌 지정</button>`:''}<button class="cart-btn" onclick='editAccount(${JSON.stringify(a).replace(/'/g,"&#39;")})'>수정</button><button class="cart-btn gray-btn" onclick="toggleAccountActive('${a.id}',${!!a.is_active},${!!a.is_default})">${a.is_active?'사용 중지':'다시 사용'}</button><button class="cart-btn danger-btn" onclick="removeAccount('${a.id}',${!!a.is_default})">삭제</button></div></article>`).join(''):'<div class="product-card"><p>등록된 계좌가 없습니다.</p></div>';
}

async function saveAccount(){
  const payload={label:accountLabel.value.trim(),bank_name:accountBank.value.trim(),account_number:accountNumber.value.trim(),account_holder:accountHolder.value.trim(),updated_at:new Date().toISOString()};
  if(Object.values(payload).slice(0,4).some(v=>!v))return alert('계좌 정보를 모두 입력하세요.');
  let error;
  if(editingAccountId){({error}=await supabaseClient.from('payment_accounts').update(payload).eq('id',editingAccountId));}
  else{
    const {count}=await supabaseClient.from('payment_accounts').select('*',{count:'exact',head:true});
    payload.is_default=(count||0)===0; payload.is_active=true;
    ({error}=await supabaseClient.from('payment_accounts').insert(payload));
  }
  if(error)return alert(error.message);
  clearForm();loadAccounts();
}

async function setDefault(id){
  await supabaseClient.from('payment_accounts').update({is_default:false}).neq('id',id);
  const {error}=await supabaseClient.from('payment_accounts').update({is_default:true,is_active:true,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);loadAccounts();
}

async function toggleAccountActive(id,current,isDefault){
  if(current&&isDefault)return alert('기본 계좌는 사용 중지할 수 없습니다. 다른 계좌를 기본으로 지정한 뒤 변경하세요.');
  const {error}=await supabaseClient.from('payment_accounts').update({is_active:!current,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);loadAccounts();
}

async function removeAccount(id,isDefault){
  if(isDefault)return alert('기본 계좌는 삭제할 수 없습니다. 다른 계좌를 기본으로 지정한 뒤 삭제하세요.');
  if(!confirm('계좌를 삭제할까요? 과거 주문에 저장된 계좌정보는 유지됩니다.'))return;
  const {error}=await supabaseClient.from('payment_accounts').delete().eq('id',id);
  if(error)return alert(error.message);loadAccounts();
}

window.setDefault=setDefault;window.removeAccount=removeAccount;window.toggleAccountActive=toggleAccountActive;window.editAccount=startEditAccount;
document.addEventListener('DOMContentLoaded',async()=>{if(await guard()){document.getElementById('addAccountBtn').onclick=saveAccount;document.getElementById('cancelAccountEditBtn').onclick=clearForm;document.getElementById('settingsPasswordBtn').onclick=changeOwnPassword;loadAccounts();}});
async function changeOwnPassword(){
  const next=document.getElementById('settingsNewPassword')?.value||'';
  const confirmValue=document.getElementById('settingsNewPasswordConfirm')?.value||'';
  if(next.length<8)return alert('새 비밀번호를 8자 이상 입력하세요.');
  if(next!==confirmValue)return alert('비밀번호 확인 값이 일치하지 않습니다.');
  const btn=document.getElementById('settingsPasswordBtn');
  if(btn){btn.disabled=true;btn.textContent='변경 중...';}
  const {error}=await supabaseClient.auth.updateUser({password:next});
  if(btn){btn.disabled=false;btn.textContent='비밀번호 변경';}
  if(error)return alert('비밀번호 변경 실패: '+error.message);
  document.getElementById('settingsNewPassword').value='';
  document.getElementById('settingsNewPasswordConfirm').value='';
  alert('비밀번호가 변경되었습니다.');
}


async function invokeAdminUserAction(payload){
  const {data,error}=await supabaseClient.functions.invoke('admin-user-management',{body:payload});
  if(error)throw new Error(error.message||'계정 관리 서버 연결에 실패했습니다.');
  if(data?.error)throw new Error(data.error);
  return data;
}

async function loadAdminAccounts(){
  const box=document.getElementById('adminAccountList');if(!box)return;
  const passwordDrafts=new Map([...box.querySelectorAll('[data-admin-password]')].map(input=>[input.dataset.adminPassword,input.value]));
  if(!box.querySelector('.admin-account-card'))box.innerHTML='<p>관리자 계정을 불러오는 중...</p>';
  const {data:{user}}=await supabaseClient.auth.getUser();
  let data=null,error=null;
  const adminQueries=[
    'id,email,business_name,owner_name,blocked,created_at,admin_role,last_login_at,last_seen_at,login_count',
    'id,email,business_name,owner_name,blocked,created_at,admin_role,last_login_at,last_seen_at',
    'id,email,business_name,owner_name,blocked,created_at,admin_role,last_login_at',
    'id,email,business_name,owner_name,blocked,created_at,admin_role',
    'id,email,business_name,owner_name,blocked,created_at',
    'id,email,business_name,blocked,created_at',
    'id,email,is_admin'
  ];
  for(const columns of adminQueries){
    const result=await supabaseClient.from('customers').select(columns).eq('is_admin',true).order('created_at',{ascending:true});
    if(!result.error){data=result.data;error=null;break;}
    error=result.error;
  }
  if(error){box.innerHTML=`<p>관리자 목록을 불러오지 못했습니다: ${esc(error.message)}</p>`;return;}
  const rows=data||[];
  const now=Date.now();
  const formatDate=value=>value?new Date(value).toLocaleString('ko-KR'):'기록 없음';
  const presence=a=>{
    if(a.blocked)return{label:'사용중지',className:'blocked'};
    if(!a.last_seen_at)return{label:'오프라인',className:'offline'};
    const diff=now-new Date(a.last_seen_at).getTime();
    if(diff<=90*1000)return{label:'접속 중',className:'online'};
    if(diff<=5*60*1000)return{label:'자리 비움',className:'away'};
    return{label:'오프라인',className:'offline'};
  };
  box.innerHTML=rows.length?rows.map(a=>{const name=a.business_name||a.owner_name||'관리자';const self=a.id===user?.id;const role=a.admin_role==='developer_admin'?'개발관리자':'관리자';const state=presence(a);return `<article class="admin-account-card"><div class="admin-account-info"><div class="admin-account-title"><strong>${esc(name)} ${self?'<small>(현재 로그인)</small>':''}</strong><span class="admin-presence ${state.className}"><i></i>${state.label}</span></div><span>${esc(a.email||'-')} · <b>${role}</b> · ${a.blocked?'사용중지':'사용중'}</span><span>최근 로그인: ${esc(formatDate(a.last_login_at))} · 로그인 ${Number(a.login_count||0).toLocaleString()}회</span><span>마지막 활동: ${esc(formatDate(a.last_seen_at))}</span></div><div class="admin-account-actions"><input type="password" minlength="8" data-admin-password="${a.id}" placeholder="새 비밀번호 8자리 이상"><button type="button" onclick="changeAdminPassword('${a.id}',this)">비밀번호 변경</button><select data-admin-role="${a.id}" onchange="changeAdminRole('${a.id}',this.value,this)"><option value="admin" ${a.admin_role!=='developer_admin'?'selected':''}>관리자</option><option value="developer_admin" ${a.admin_role==='developer_admin'?'selected':''}>개발관리자</option></select>${self?'':`<button type="button" class="${a.blocked?'safe':'danger'}" onclick="setAdminBlocked('${a.id}',${!a.blocked},this)">${a.blocked?'사용 재개':'사용중지'}</button>`}</div></article>`}).join(''):'<p>등록된 관리자 계정이 없습니다.</p>';
  passwordDrafts.forEach((value,id)=>{const input=box.querySelector(`[data-admin-password="${id}"]`);if(input)input.value=value;});
}

function startAdminAccountRealtime(){
  if(adminAccountRefreshTimer)clearInterval(adminAccountRefreshTimer);
  adminAccountRefreshTimer=setInterval(loadAdminAccounts,30000);
  if(adminAccountChannel)supabaseClient.removeChannel(adminAccountChannel);
  adminAccountChannel=supabaseClient.channel('admin-account-presence-v625')
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'customers'},()=>loadAdminAccounts())
    .subscribe();
}

async function createAdminAccount(){
  const name=document.getElementById('newAdminName')?.value.trim()||'';
  const email=document.getElementById('newAdminEmail')?.value.trim()||'';
  const password=document.getElementById('newAdminPassword')?.value||'';
  const role=document.getElementById('newAdminRole')?.value||'admin';
  if(!name||!email||password.length<8)return alert('이름·이메일·8자리 이상 초기 비밀번호를 입력하세요.');
  const btn=document.getElementById('createAdminBtn');btn.disabled=true;btn.textContent='추가 중...';
  try{await invokeAdminUserAction({action:'create_admin',name,email,password,role});document.getElementById('newAdminName').value='';document.getElementById('newAdminEmail').value='';document.getElementById('newAdminPassword').value='';alert('관리자 계정이 추가되었습니다.');loadAdminAccounts();}
  catch(error){alert('관리자 추가 실패: '+error.message+'\n\nEdge Function 배포 여부를 확인하세요.');}
  finally{btn.disabled=false;btn.textContent='관리자 추가';}
}

async function changeAdminPassword(id,button){
  const input=document.querySelector(`[data-admin-password="${id}"]`);const password=input?.value||'';
  if(password.length<8)return alert('새 비밀번호를 8자리 이상 입력하세요.');
  if(!confirm('이 관리자의 비밀번호를 변경할까요?'))return;
  button.disabled=true;
  try{await invokeAdminUserAction({action:'set_password',target_id:id,password});input.value='';alert('관리자 비밀번호가 변경되었습니다.');}
  catch(error){alert('비밀번호 변경 실패: '+error.message);}
  finally{button.disabled=false;}
}

async function setAdminBlocked(id,blocked,button){
  if(!confirm(blocked?'이 관리자 계정을 사용중지할까요?':'이 관리자 계정을 다시 사용할 수 있게 할까요?'))return;
  button.disabled=true;
  try{await invokeAdminUserAction({action:'set_admin_blocked',target_id:id,blocked});await loadAdminAccounts();}
  catch(error){alert('관리자 상태 변경 실패: '+error.message);button.disabled=false;}
}


async function changeAdminRole(id,role,select){
  if(!confirm(`이 계정 권한을 ${role==='developer_admin'?'개발관리자':'관리자'}로 변경할까요?`)){loadAdminAccounts();return;}
  select.disabled=true;
  try{await invokeAdminUserAction({action:'set_admin_role',target_id:id,role});await loadAdminAccounts();}
  catch(error){alert('권한 변경 실패: '+error.message);select.disabled=false;}
}
window.changeAdminRole=changeAdminRole;

window.changeAdminPassword=changeAdminPassword;window.setAdminBlocked=setAdminBlocked;
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('createAdminBtn')?.addEventListener('click',createAdminAccount);setTimeout(()=>{loadAdminAccounts();startAdminAccountRealtime();},300);});
