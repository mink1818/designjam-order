(()=>{
  const page=document.body;
  const STORAGE_KEY=`designjam_accordion_${location.pathname}`;

  function saveState(){
    const state={};
    document.querySelectorAll('details.admin-accordion[data-key]').forEach(d=>state[d.dataset.key]=d.open);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){ }
  }

  function getState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}catch(_){return {};}
  }

  function makeAccordion({key,title,subtitle,countId,nodes,open=false}){
    const valid=(nodes||[]).filter(Boolean);
    if(!valid.length)return null;
    const details=document.createElement('details');
    details.className='admin-accordion';
    details.dataset.key=key;
    const saved=getState();
    details.open=Object.prototype.hasOwnProperty.call(saved,key)?!!saved[key]:open;

    const summary=document.createElement('summary');
    summary.innerHTML=`<span class="admin-accordion-title">${title}</span>${subtitle?`<small>${subtitle}</small>`:''}<span class="admin-accordion-count" ${countId?`data-source-count="${countId}"`:''}></span><span class="admin-accordion-chevron" aria-hidden="true">⌄</span>`;
    details.appendChild(summary);

    const body=document.createElement('div');
    body.className='admin-accordion-body';
    valid.forEach(node=>body.appendChild(node));
    details.appendChild(body);
    details.addEventListener('toggle',saveState);
    return details;
  }

  function addToolbar(container){
    const bar=document.createElement('div');
    bar.className='accordion-global-toolbar';
    bar.innerHTML='<button type="button" data-accordion-action="close">모두 접기</button><button type="button" data-accordion-action="open">모두 펼치기</button>';
    bar.addEventListener('click',e=>{
      const action=e.target.closest('button')?.dataset.accordionAction;
      if(!action)return;
      container.querySelectorAll('details.admin-accordion').forEach(d=>d.open=action==='open');
      saveState();
    });
    container.prepend(bar);
  }

  function updateCounts(){
    document.querySelectorAll('[data-source-count]').forEach(badge=>{
      const source=document.getElementById(badge.dataset.sourceCount);
      if(!source)return;
      const value=String(source.textContent||'').trim();
      badge.textContent=value?`(${value})`:'';
    });
  }

  function setupProducts(){
    const main=document.querySelector('main.products-admin-page');
    if(!main)return;
    const toolbar=document.querySelector('.admin-product-toolbar');
    const guide=document.querySelector('.product-management-guide');
    const summary=document.querySelector('.product-summary-grid');
    const mount=document.createElement('section');
    mount.className='admin-accordion-stack';
    (summary||guide||toolbar).insertAdjacentElement('afterend',mount);

    const headings=[...document.querySelectorAll('h2.admin-section-title')];
    const mainHeading=headings.find(h=>h.textContent.includes('등록된 대분류'));
    const categoryHeading=headings.find(h=>h.textContent.includes('등록된 카테고리'));
    const groupHeading=headings.find(h=>h.textContent.includes('등록된 상품 묶음'));
    const productPicker=[...document.querySelectorAll('section.product-card')].find(s=>s.querySelector('h2')?.textContent.includes('상품목록 선택'));

    const groups=[
      makeAccordion({key:'main-categories',title:'📁 대분류 관리',subtitle:'등록·수정 및 목록',countId:'mainCategoryCount',nodes:[document.getElementById('mainCategoryEditor'),mainHeading,document.getElementById('mainCategoryList')]}),
      makeAccordion({key:'categories',title:'📂 카테고리 관리',subtitle:'등록·수정 및 목록',countId:'categoryCount',nodes:[document.getElementById('categoryEditor'),categoryHeading,document.getElementById('categoryList')]}),
      makeAccordion({key:'excel-import',title:'📥 엑셀·사진 대량등록',subtitle:'신규 추가·동기화·전체 교체',nodes:[document.getElementById('excelUploader')]}),
      makeAccordion({key:'group-editor',title:'🧦 상품 묶음 등록',subtitle:'상품 사진 묶음 등록·수정',nodes:[document.getElementById('groupEditor')]}),
      makeAccordion({key:'group-management',title:'📦 상품·품절 관리',subtitle:'검색·표시·품절 관리',countId:'groupCount',nodes:[groupHeading,document.getElementById('groupManagement'),productPicker,document.getElementById('groupPaginationTop'),document.getElementById('groupList'),document.getElementById('groupPaginationBottom')],open:true}),
      makeAccordion({key:'hidden-management',title:'🗂️ 숨김 항목 관리',subtitle:'숨김 상품·카테고리·대분류 복원 및 삭제',nodes:[document.getElementById('hiddenManagement')]})
    ].filter(Boolean);
    groups.forEach(g=>mount.appendChild(g));
    document.querySelectorAll('.admin-section-divider').forEach(hr=>hr.remove());
    addToolbar(mount);
    setInterval(updateCounts,700);
    updateCounts();

    toolbar?.querySelectorAll('[data-scroll-target]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const target=document.getElementById(btn.dataset.scrollTarget);
        const details=target?.closest('details.admin-accordion');
        if(details){details.open=true;saveState();setTimeout(()=>details.scrollIntoView({behavior:'smooth',block:'start'}),30);}
      },true);
    });
  }

  function setupSettings(){
    const main=document.querySelector('body[data-session-page="admin"] main.container');
    if(!main||!location.pathname.endsWith('/settings.html')&&!location.pathname.endsWith('settings.html'))return;
    const back=main.querySelector(':scope > button');
    const passwordCard=document.querySelector('.account-password-card');
    const accountAdd=document.getElementById('accountLabel')?.closest('section.product-card');
    const adminCard=document.getElementById('adminAccountList')?.closest('section.product-card');
    const accountList=document.getElementById('accountList')?.closest('section');
    const mount=document.createElement('section');
    mount.className='admin-accordion-stack settings-accordion-stack';
    (back||main.firstElementChild)?.insertAdjacentElement('afterend',mount);

    [
      makeAccordion({key:'payment-accounts',title:'💳 입금계좌 관리',subtitle:'계좌 등록·수정·기본계좌·계좌목록',nodes:[accountAdd,accountList],open:true}),
      makeAccordion({key:'admin-accounts',title:'👤 관리자 계정 관리',subtitle:'관리자 추가·비밀번호 변경·사용중지',nodes:[adminCard]}),
      makeAccordion({key:'my-password',title:'🔐 내 비밀번호 변경',subtitle:'현재 로그인한 관리자 계정',nodes:[passwordCard]})
    ].filter(Boolean).forEach(g=>mount.appendChild(g));
    addToolbar(mount);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setupProducts();
    setupSettings();
  });
})();
