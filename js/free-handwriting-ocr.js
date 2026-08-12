(function(){
  'use strict';
  let worker=null,busy=false,lastRecognized=[];
  const normalize=value=>String(value||'').normalize('NFKC').toUpperCase().replace(/[OQ]/g,'0').replace(/[IL|!]/g,'1').replace(/[Z]/g,'2').replace(/[G]/g,'6').replace(/[‐‑‒–—_]/g,'-');
  function distance(a,b){const x=String(a),y=String(b),dp=Array.from({length:x.length+1},()=>Array(y.length+1).fill(0));for(let i=0;i<=x.length;i++)dp[i][0]=i;for(let j=0;j<=y.length;j++)dp[0][j]=j;for(let i=1;i<=x.length;i++)for(let j=1;j<=y.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(x[i-1]===y[j-1]?0:1));return dp[x.length][y.length]}
  async function bitmap(file){try{return await createImageBitmap(file)}catch{return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=reject;image.src=url})}}
  async function splitLines(file){
    const source=await bitmap(file),sw=source.width||source.naturalWidth,sh=source.height||source.naturalHeight,scale=Math.min(1,1400/sw,2200/sh),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);source.close?.();
    const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data,w=canvas.width,h=canvas.height,rowCounts=new Uint32Array(h),dark=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,gray=.299*data[p]+.587*data[p+1]+.114*data[p+2];if(gray<128){dark[y*w+x]=1;rowCounts[y]++}}
    const threshold=Math.max(3,Math.round(w*.004)),active=[];for(let y=2;y<h-2;y++){const smooth=(rowCounts[y-2]+rowCounts[y-1]+rowCounts[y]+rowCounts[y+1]+rowCounts[y+2])/5;active[y]=smooth>threshold}
    const bands=[];let start=-1,last=-1;for(let y=0;y<h;y++){if(active[y]){if(start<0)start=y;last=y}else if(start>=0&&y-last>Math.max(6,Math.round(h*.004))){bands.push([start,last]);start=-1}}if(start>=0)bands.push([start,last]);
    const lines=[];for(const [top,bottom] of bands){if(bottom-top<7||bottom-top>Math.max(220,h*.2))continue;let left=w,right=0,pixels=0;for(let y=top;y<=bottom;y++)for(let x=0;x<w;x++)if(dark[y*w+x]){left=Math.min(left,x);right=Math.max(right,x);pixels++}if(pixels<18||right-left<8)continue;const padX=Math.max(12,Math.round((bottom-top)*.5)),padY=Math.max(8,Math.round((bottom-top)*.35)),x0=Math.max(0,left-padX),y0=Math.max(0,top-padY),cw=Math.min(w-x0,right-left+1+padX*2),ch=Math.min(h-y0,bottom-top+1+padY*2),out=document.createElement('canvas'),targetH=96;out.width=Math.max(180,Math.round(cw*(targetH/ch)));out.height=targetH;const outCtx=out.getContext('2d');outCtx.fillStyle='#fff';outCtx.fillRect(0,0,out.width,out.height);outCtx.filter='grayscale(1) contrast(1.8)';outCtx.drawImage(canvas,x0,y0,cw,ch,0,0,out.width,out.height);lines.push(out.toDataURL('image/png'))}
    if(!lines.length){const fallback=document.createElement('canvas');fallback.width=Math.min(1400,w);fallback.height=Math.round(h*(fallback.width/w));fallback.getContext('2d').drawImage(canvas,0,0,fallback.width,fallback.height);lines.push(fallback.toDataURL('image/png'))}return lines.slice(0,80)
  }
  function parse(text,knownItems){
    const cleaned=normalize(text).replace(/[^0-9AMSB\-\s]/g,' ').replace(/\s+/g,' ').trim(),numbers=cleaned.match(/(?:[SBI]-?)?\d+[AM]?/g)||[];if(!numbers.length)return{observed_text:text,item_number:'',qty:1,registered:false,confidence:0,needs_review:true};let rawItem=numbers[0],qty=1;const separated=cleaned.match(/(?:[SBI]-?)?\d+[AM]?\s*-\s*(\d{1,3})\s*$/);if(separated){rawItem=cleaned.match(/(?:[SBI]-?)?\d+[AM]?/)?.[0]||rawItem;qty=Math.max(1,Number(separated[1]))}else if(numbers.length>1){const tail=numbers[numbers.length-1].replace(/\D/g,'');if(tail.length<=3)qty=Math.max(1,Number(tail))}
    const itemKey=rawItem.replace(/^([SBI])-?/,'').replace(/[^0-9AM]/g,''),known=knownItems.map(value=>String(value).toUpperCase()),exact=known.find(value=>value.replace(/^([SBI])[-_\s]+/,'')===itemKey);if(exact)return{observed_text:text,item_number:exact,qty,registered:true,confidence:.99,needs_review:false};
    let best='',score=99;for(const candidate of known){const key=candidate.replace(/^([SBI])[-_\s]+/,'');if(Math.abs(key.length-itemKey.length)>1)continue;const d=distance(itemKey,key);if(d<score){score=d;best=candidate}}const confidence=best?Math.max(0,1-score/Math.max(itemKey.length,best.length)):0;return{observed_text:text,item_number:best||itemKey,qty,registered:Boolean(best),confidence,needs_review:!best||confidence<.82}
  }
  async function analyze(files,knownItems,onStatus=()=>{}){
    if(busy)throw new Error('이미 다른 사진을 분석하고 있습니다. 잠시 기다려주세요.');
    busy=true;
    try{
      if(!window.PaddleHandwritingOCR){onStatus('PP-OCRv5 무료 인식 엔진을 불러오는 중…');await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-paddle-ocr]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('PP-OCRv5 엔진 로드 실패')),{once:true});return}const script=document.createElement('script');script.src='js/paddle-ocr-browser.js?v=65840';script.dataset.paddleOcr='1';script.onload=resolve;script.onerror=()=>reject(new Error('PP-OCRv5 엔진 로드 실패'));document.head.appendChild(script)});}if(!window.PaddleHandwritingOCR)throw new Error('PP-OCRv5 무료 인식 엔진을 불러오지 못했습니다.');
      const recognized=await window.PaddleHandwritingOCR.recognize(files,onStatus);
      onStatus(`PP-OCRv5가 손글씨 ${recognized.length}줄을 품번 목록과 대조 중…`);
      const parsed=recognized.map(line=>{
        const row=parse(line.text,knownItems);
        row.ocr_score=Number(line.score||0);
        row.confidence=Math.min(Number(row.confidence||0),Math.max(.01,Number(line.score||0)));
        row.needs_review=row.needs_review||row.confidence<.82;
        return row;
      }).filter(row=>row.item_number);lastRecognized=parsed.map(row=>({...row}));return parsed;
    }finally{busy=false}
  }
  async function saveTrainingData(supabase,files,confirmedItems,source='admin'){
    if(!supabase||!files?.length||!confirmedItems?.length)return{saved:0};
    const {data:{user}}=await supabase.auth.getUser();if(!user)return{saved:0};let saved=0;
    for(let index=0;index<files.length;index++){
      const file=files[index],extension=String(file.name||'photo.jpg').split('.').pop().replace(/[^a-z0-9]/gi,'').slice(0,8)||'jpg',path=`${user.id}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${index}.${extension}`;
      const upload=await supabase.storage.from('handwriting-training').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});if(upload.error){console.warn('학습사진 저장 생략:',upload.error.message);continue}
      const insert=await supabase.from('handwriting_training_samples').insert({created_by:user.id,source_type:source,image_path:path,ocr_result:lastRecognized,confirmed_items:confirmedItems});if(insert.error){console.warn('학습정답 저장 생략:',insert.error.message);continue}saved++;
    }
    return{saved};
  }
  window.FreeHandwritingOCR={analyze,saveTrainingData};
})();
