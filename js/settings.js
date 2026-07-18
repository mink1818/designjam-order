const supabaseClient=window.supabase.createClient('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87');
const ADMIN_SESSION_KEY='designjam_admin_session',ADMIN_EMAILS=new Set(['900smk@naver.com','sm0727sm@hanmail.net','p1028p@naver.com']);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const attr=esc;
let editingAccountId=null;

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

