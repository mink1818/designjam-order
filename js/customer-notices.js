(async function(){
 const box=document.getElementById('customerNoticeArea'); if(!box||!window.supabase)return;
 const client=window.supabase.createClient('https://dtjhuejmxrjkcxzvilgw.supabase.co','sb_publishable_kwXvFOCpknkDf9BKmcszrQ_Q7IBVg87');
 const now=new Date().toISOString();
 const {data,error}=await client.from('announcements').select('*').eq('is_published',true).or(`end_at.is.null,end_at.gte.${now}`).order('is_pinned',{ascending:false}).order('created_at',{ascending:false}).limit(5);
 if(error||!data?.length){box.hidden=true;return;}
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
 box.innerHTML=`<div class="customer-notice-heading"><b>📢 새 소식</b><span>${data.length}건</span></div>${data.map((n,i)=>`<details class="customer-notice-item" ${i===0&&n.is_pinned?'open':''}><summary><em>${esc(n.notice_type)}</em>${esc(n.title)}</summary>${n.image_url?`<img src="${esc(n.image_url)}" alt="">`:''}<p>${esc(n.content).replace(/\n/g,'<br>')}</p></details>`).join('')}`;
 box.hidden=false;
})();
