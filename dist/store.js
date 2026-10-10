import {clone,initialEnvelope,validateState,validateBackup} from './core.js';
let db;export async function openStore(){
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lot-ledger-pwa:'+new URL('.',location.href).pathname,1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  let value=await read();
  if(!value){const response=await fetch('./seed.json');if(!response.ok)throw new Error('Не удалось загрузить начальные данные.');value=initialEnvelope(await response.json());await put(value,0,true);}
  validateState(value.state);return value;
}
export function read(){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readonly');const r=tx.objectStore('data').get('ledger');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function put(value,expected,initial=false){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite'),store=tx.objectStore('data');const r=store.get('ledger');r.onsuccess=()=>{if(!initial&&(r.result?.revision??0)!==expected){tx.abort();reject(new Error('Данные изменились в другой вкладке. Обновите страницу.'));return;}if(initial&&r.result){tx.abort();reject(new Error('Начальные данные уже созданы. Обновите страницу.'));return;}store.put(value,'ledger');};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||new Error('Не удалось сохранить данные.'));tx.onabort=()=>reject(tx.error||new Error('Сохранение отменено.'));});}
export async function commit(envelope,state,label,details='') {
  validateState(state);const next=clone(envelope);next.state=state;next.revision=(envelope.revision||0)+1;
  next.history.push({id:crypto.randomUUID(),at:new Date().toISOString(),label,details,before:clone(envelope.state),after:clone(state)});
  return put(next,envelope.revision||0);
}
export async function restore(envelope,value){const imported=validateBackup(value);const next=clone(imported);next.revision=(envelope.revision||0)+1;next.history=[...new Map([...envelope.history,...next.history].map(h=>[h.id,h])).values()].sort((a,b)=>a.at.localeCompare(b.at));next.history.push({id:crypto.randomUUID(),at:new Date().toISOString(),label:'Восстановлена резервная копия',details:'Предыдущие данные доступны в этой записи истории.',before:clone(envelope.state),after:clone(next.state)});if(next.history.length>20000)throw new Error('История слишком велика для восстановления.');return put(next,envelope.revision||0);}
