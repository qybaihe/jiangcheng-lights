/** Native fullscreen only; CSS expansion is never reported as fullscreen. */
export function createFullscreenController({doc=globalThis.document,onChange=()=>{}}={}) {
 const element=doc?.documentElement;
 let pending=false,disposed=false,lastResult='idle',legacyRequest=null;
 const active=()=>Boolean(doc?.fullscreenElement||doc?.webkitFullscreenElement);
 const supported=()=>Boolean(element&&(element.requestFullscreen?doc.fullscreenEnabled!==false:element.webkitRequestFullscreen&&doc.webkitFullscreenEnabled!==false));
 const snapshot=()=>({active:active(),supported:supported(),pending,lastResult});
 const notify=()=>{if(!disposed)onChange(snapshot());};
 function changed(){
  if(legacyRequest&&active()===legacyRequest.wanted)legacyRequest.settle(legacyRequest.wanted?'entered':'window');
  else notify();
 }
 function transition(wanted){
  if(disposed)return Promise.resolve({status:'disposed',...snapshot()});
  if(pending)return Promise.resolve({status:'busy',...snapshot()});
  if(active()===wanted)return Promise.resolve({status:wanted?'entered':'window',...snapshot()});
  const target=wanted?element:doc;
  const method=wanted?(element?.requestFullscreen??element?.webkitRequestFullscreen):(doc?.exitFullscreen??doc?.webkitExitFullscreen);
  if(!method||(wanted&&!supported())){lastResult='unsupported';notify();return Promise.resolve({status:lastResult,...snapshot()});}
  pending=true;notify();
  // Invoke inside the original click stack, before any await, preserving activation.
  let request;
  try{request=wanted?method.call(target,{navigationUI:'hide'}):method.call(target);}
  catch{pending=false;lastResult='blocked';notify();return Promise.resolve({status:lastResult,...snapshot()});}
  const finish=status=>{pending=false;lastResult=status;notify();return{status,...snapshot()};};
  // Older WebKit returns void before changing native state. Wait for its real
  // event, keeping requests deduplicated; never leave controls locked forever.
  if(!request||typeof request.then!=='function'){
   if(active()===wanted)return Promise.resolve(finish(wanted?'entered':'window'));
   return new Promise(resolve=>{
    const waiting={wanted,timer:null,settle(status){
     if(legacyRequest!==waiting)return;
     clearTimeout(waiting.timer);legacyRequest=null;resolve(finish(status));
    }};
    legacyRequest=waiting;
    waiting.timer=setTimeout(()=>waiting.settle(active()===wanted?(wanted?'entered':'window'):'blocked'),1800);
   });
  }
  return Promise.resolve(request).then(()=>finish(active()===wanted?(wanted?'entered':'window'):'blocked'),()=>finish('blocked'));
 }
 doc?.addEventListener?.('fullscreenchange',changed);
 doc?.addEventListener?.('webkitfullscreenchange',changed);
 notify();
 return {snapshot,enter:()=>transition(true),leave:()=>transition(false),toggle:()=>transition(!active()),dispose(){if(disposed)return;disposed=true;legacyRequest?.settle('disposed');doc?.removeEventListener?.('fullscreenchange',changed);doc?.removeEventListener?.('webkitfullscreenchange',changed);}};
}
