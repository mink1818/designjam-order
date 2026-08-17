(()=>{'use strict';if(document.getElementById('customerAiButton'))return;
const client=window.supabaseClient||window.supabase?.createClient('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87');
const rules=[
 {keys:['주문 수정','수정하고','수량 변경','주문변경'],answer:'주문조회에서 해당 주문의 수정 버튼을 이용하세요. 피킹이 시작된 뒤에는 수정할 수 없습니다.',link:'order.html'},
 {keys:['주문 취소','삭제하고','주문삭제'],answer:'피킹 시작 전 주문은 주문조회에서 삭제할 수 있습니다. 피킹이 시작됐다면 관리자에게 문의해주세요.',link:'order.html'},
 {keys:['배송','택배','송장','언제 와','출고'],answer:'주문조회에서 출고상태와 송장번호를 확인할 수 있습니다. 송장번호가 표시되지 않은 경우 관리자가 카카오톡 등 메시지로 별도 전달합니다.',link:'order.html'},
 {keys:['품절','일부품절','금액이 달라'],answer:'품절 및 일부품절 상품은 출고수량과 결제금액에서 자동 차감됩니다. 주문조회에서 실제 출고수량을 확인해주세요.',link:'order.html'},
 {keys:['입금','계좌'],answer:'주문정보 또는 거래명세서에 표시된 입금계좌를 확인한 뒤 해당 계좌로 입금해주세요.',link:'order.html'},
 {keys:['비밀번호','로그인','접속 안','로그인이 안'],answer:'비밀번호를 다시 확인해주세요. 계속 로그인되지 않으면 거래처명과 연락처를 적어 관리자에게 문의를 전달해주세요.'},
 {keys:['설치','홈 화면','바로가기','앱으로'],answer:'카카오톡에서 연 뒤 위 또는 아래 점 3개를 눌러 다른 브라우저로 열어주세요. 브라우저의 위 또는 아래 점 3개에서 설치·바로가기 만들기 또는 현재 페이지 추가→홈 화면을 선택하면 됩니다.'},
 {keys:['검색','품번이 안','상품이 안'],answer:'상품검색에는 품번만 정확히 입력하면 해당 품번이 우선 표시됩니다. 그래도 나오지 않으면 품번을 적어 관리자에게 전달해주세요.',link:'index.html'},
 {keys:['장바구니','전체삭제','담은 상품'],answer:'장바구니에서 담은순·품번순 정렬과 전체삭제를 사용할 수 있습니다.',link:'catalog.html#cart'},
 {keys:['거래명세서','명세서','전달문서'],answer:'주문조회에서 해당 주문을 펼친 뒤 거래명세서 또는 전달용 문서를 이용해주세요.',link:'order.html'},
 {keys:['안녕','사용법','뭘 물어'],answer:'안녕하세요. 주문수정, 배송·송장, 품절, 입금계좌, 로그인, 앱 설치, 상품검색 등을 물어보세요.'}
];
const quickQuestions=[
 ['주문수정은 어떻게 하나요?','주문 수정'],
 ['주문을 취소하려면 어떻게 하나요?','주문 취소'],
 ['배송과 송장번호는 어디서 확인하나요?','배송 송장'],
 ['품절된 상품과 금액은 어떻게 확인하나요?','품절 금액이 달라'],
 ['입금할 계좌는 어디서 확인하나요?','입금 계좌'],
 ['로그인이 안 될 때는 어떻게 하나요?','로그인이 안'],
 ['휴대폰 홈 화면에 설치하려면 어떻게 하나요?','홈 화면 설치'],
 ['품번 검색이 안 될 때는 어떻게 하나요?','품번이 안'],
 ['장바구니 상품을 삭제하려면 어떻게 하나요?','장바구니 전체삭제'],
 ['거래명세서는 어디서 확인하나요?','거래명세서']
];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lastUnknown='';
function findAnswer(q){const normalized=q.replace(/\s+/g,'').toLowerCase();let best=null,score=0;rules.forEach(r=>{const s=r.keys.reduce((n,k)=>n+(normalized.includes(k.replace(/\s+/g,'').toLowerCase())?1:0),0);if(s>score){score=s;best=r}});return best}
function add(role,text,link){const box=document.getElementById('customerAiMessages'),row=document.createElement('div');row.className=`customer-ai-message ${role}`;row.innerHTML=`<p>${esc(text).replace(/\n/g,'<br>')}</p>${link?`<a href="${esc(link)}">해당 화면 열기</a>`:''}`;box.appendChild(row);box.scrollTop=box.scrollHeight}
async function ask(){const input=document.getElementById('customerAiInput'),q=input.value.trim();if(!q)return;input.value='';add('user',q);const found=findAnswer(q);if(found){add('bot',found.answer,found.link);return}lastUnknown=q;add('bot','이 질문은 자동답변으로 정확히 안내하기 어렵습니다. 아래 버튼을 누르면 관리자에게 문의가 전달됩니다.');document.getElementById('customerAiSendAdmin').hidden=false}
function askQuick(label,query){add('user',label);const found=findAnswer(query);if(found)add('bot',found.answer,found.link)}
async function sendAdmin(){const b=document.getElementById('customerAiSendAdmin'),input=document.getElementById('customerAiInput'),question=String(input.value||lastUnknown||'').trim();if(!question){input.focus();return add('bot','관리자에게 보낼 문의 내용을 아래 입력칸에 먼저 작성해주세요.')}lastUnknown=question;input.value='';b.disabled=true;const {data:{user}}=await client.auth.getUser();if(!user){add('bot','로그인 후 문의를 전달할 수 있습니다.');b.disabled=false;return}const {data:p}=await client.from('customers').select('business_name,owner_name').eq('id',user.id).maybeSingle();const {error}=await client.from('customer_ai_inquiries').insert({customer_id:user.id,customer_name:p?.business_name||p?.owner_name||'',question,status:'대기'});if(error){add('bot','문의 전달에 실패했습니다. V6.6.4 SQL 설치 여부를 확인해주세요.');b.disabled=false;return}add('user',question);add('bot','관리자에게 직접 문의를 전달했습니다. 답변이 등록되면 이전 문의·답변 보기에서 확인할 수 있습니다.');lastUnknown='';b.disabled=false}
async function history(){const box=document.getElementById('customerAiHistory');box.hidden=!box.hidden;if(box.hidden)return;box.innerHTML='<p>이전 문의를 불러오는 중입니다.</p>';const {data:{user}}=await client.auth.getUser();if(!user)return box.innerHTML='<p>로그인이 필요합니다.</p>';const {data,error}=await client.from('customer_ai_inquiries').select('*').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(20);box.innerHTML=error?'<p>이전 문의를 불러오지 못했습니다.</p>':data?.length?data.map(x=>`<article><b>Q. ${esc(x.question)}</b><p>${esc(x.admin_answer||x.auto_answer||(x.status==='대기'?'관리자 답변 대기 중입니다.':'답변 없음'))}</p><small>${new Date(x.created_at).toLocaleString('ko-KR')} · ${esc(x.status)}</small></article>`).join(''):'<p>이전 문의가 없습니다.</p>'}
document.body.insertAdjacentHTML('beforeend',`<button id="customerAiButton" class="customer-ai-button" type="button">💬 AI 문의</button><div id="customerAiModal" class="customer-ai-modal" hidden><section><header><div><strong>AI 문의</strong><small>기본 질문을 누르거나 직접 입력하세요</small></div><button type="button" data-ai-close>×</button></header><div id="customerAiMessages" class="customer-ai-messages"><div class="customer-ai-message bot"><p>아래 기본 질문을 누르면 바로 답변해드립니다.</p></div><div class="customer-ai-quick-questions">${quickQuestions.map((x,i)=>`<button type="button" data-ai-quick="${i}"><b>${i+1}.</b> ${esc(x[0])}</button>`).join('')}</div></div><button id="customerAiHistoryBtn" type="button" class="customer-ai-history-btn">이전 문의·답변 보기</button><div id="customerAiHistory" class="customer-ai-history" hidden></div><footer><textarea id="customerAiInput" rows="2" placeholder="질문이나 관리자에게 보낼 문의를 입력하세요."></textarea><div class="customer-ai-footer-actions"><button id="customerAiAsk" type="button">AI 자동답변</button><button id="customerAiSendAdmin" type="button">관리자에게 직접 문의</button></div></footer><p class="customer-ai-disclaimer">자동답변은 안내용입니다. 주문·금액의 최종 정보는 주문조회 화면을 확인해주세요.</p></section></div>`);
const modal=document.getElementById('customerAiModal');let aiScrollY=0;const openAi=()=>{aiScrollY=window.scrollY;modal.hidden=false;document.documentElement.classList.add('customer-ai-open');document.body.classList.add('customer-ai-open');document.body.style.top=`-${aiScrollY}px`},closeAi=()=>{modal.hidden=true;document.documentElement.classList.remove('customer-ai-open');document.body.classList.remove('customer-ai-open');document.body.style.top='';window.scrollTo(0,aiScrollY)};document.getElementById('customerAiButton').onclick=openAi;document.querySelectorAll('[data-ai-quick]').forEach(button=>button.onclick=()=>{const row=quickQuestions[Number(button.dataset.aiQuick)];if(row)askQuick(row[0],row[1])});const bottomNav=document.querySelector('.customer-bottom-nav');if(bottomNav){bottomNav.classList.add('has-ai-menu');const link=document.createElement('a');link.href='#ai-inquiry';link.className='customer-ai-nav-link';link.innerHTML='<span>💬</span>AI문의';link.onclick=e=>{e.preventDefault();openAi()};bottomNav.appendChild(link)}modal.querySelector('[data-ai-close]').onclick=closeAi;document.getElementById('customerAiAsk').onclick=ask;document.getElementById('customerAiSendAdmin').onclick=sendAdmin;document.getElementById('customerAiHistoryBtn').onclick=history;document.getElementById('customerAiInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}};
})();
