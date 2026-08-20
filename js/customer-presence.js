document.addEventListener('DOMContentLoaded',async()=>{
  try{
    const {data:{user}}=await supabaseClient.auth.getUser();
    if(!user)return;
    let lastTouch=0,timer=null;
    const touch=async(force=false)=>{
      if(document.visibilityState==='hidden')return;
      const now=Date.now();
      if(!force&&now-lastTouch<210000)return;
      lastTouch=now;
      try{await supabaseClient.rpc('touch_customer_presence')}catch(_){lastTouch=0}
    };
    touch(true);
    timer=setInterval(touch,240000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')touch()});
    window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer)},{once:true});
  }catch(e){}
});
