import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.useBrowserCache = true;
let recognizerPromise;

function recognizer(){
  if(!recognizerPromise){
    recognizerPromise=pipeline('image-to-text','Xenova/trocr-small-handwritten',{dtype:'q8',device:'wasm',progress_callback:progress=>self.postMessage({type:'progress',progress})});
  }
  return recognizerPromise;
}

self.onmessage=async event=>{
  if(event.data?.type!=='analyze')return;
  try{
    const pipe=await recognizer(),texts=[];
    for(let index=0;index<event.data.lines.length;index++){
      self.postMessage({type:'line-progress',index,total:event.data.lines.length});
      const output=await pipe(event.data.lines[index],{max_new_tokens:32});
      texts.push(String(output?.[0]?.generated_text||''));
    }
    self.postMessage({type:'result',texts});
  }catch(error){self.postMessage({type:'error',error:error?.message||String(error)})}
};
