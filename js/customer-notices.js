(async function(){
 const box=document.getElementById('customerNoticeArea'); if(!box||!window.supabase)return;
 const client=window.supabase.createClient('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87');
 const now=new Date().toISOString();
 const {data,error}=await client.from('announcements').select('*').eq('is_published',true).lte('start_at',now).or(`end_at.is.null,end_at.gte.${now}`).order('is_pinned',{ascending:false}).order('created_at',{ascending:false}).limit(8);
 if(error||!data?.length){box.hidden=true;return;}
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
 let seen=[];try{seen=JSON.parse(localStorage.getItem('designjam_seen_notices')||'[]')}catch(_){seen=[]}
 const unseen=data.filter(n=>!seen.includes(n.id)).length;
 box.innerHTML=`<div class="customer-notice-heading"><b>📢 새 소식</b><span>${unseen?`NEW ${unseen}`:`${data.length}건`}</span></div>${data.map((n,i)=>`<details class="customer-notice-item ${seen.includes(n.id)?'':'unread'}" data-notice-id="${esc(n.id)}" ${i===0&&n.is_pinned?'open':''}><summary><em>${esc(n.notice_type)}</em>${esc(n.title)}${seen.includes(n.id)?'':' <b class="notice-new-badge">NEW</b>'}</summary>${n.image_url?`<img src="${esc(n.image_url)}" alt="">`:''}<p>${esc(n.content).replace(/\n/g,'<br>')}</p>${n.link_url?`<a class="customer-notice-link" href="${esc(n.link_url)}" target="_blank" rel="noopener">자세히 보기</a>`:''}</details>`).join('')}`;
 box.hidden=false;
 box.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(!d.open)return;const id=d.dataset.noticeId;if(!seen.includes(id)){seen.push(id);localStorage.setItem('designjam_seen_notices',JSON.stringify(seen.slice(-200)));d.classList.remove('unread');d.querySelector('.notice-new-badge')?.remove();}}));
})();
