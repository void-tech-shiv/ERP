import type { Course } from './calculator';

export type ERPCache={studentId:string;academicYear:string;semester:string;courses:Course[];savedAt:string};
const DB='attendly-private-erp-cache-v1',STORE='attendance',KEY='latest';

async function db():Promise<IDBDatabase|null>{
  if(typeof indexedDB==='undefined')return null;
  return new Promise(resolve=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
    req.onerror=()=>resolve(null);
    req.onsuccess=()=>resolve(req.result);
  });
}
export async function readERP(studentId:string):Promise<ERPCache|null>{
  const store=await db();if(!store)return null;
  return new Promise(resolve=>{
    const req=store.transaction(STORE,'readonly').objectStore(STORE).get(KEY);
    req.onsuccess=()=>{
      const record=req.result as ERPCache|undefined;
      resolve(record?.studentId===studentId?record:null);
      store.close();
    };
    req.onerror=()=>{resolve(null);store.close()};
  });
}
export async function writeERP(value:ERPCache):Promise<void>{
  const store=await db();if(!store)return;
  return new Promise(resolve=>{
    const tx=store.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(value,KEY);
    tx.oncomplete=()=>{resolve();store.close()};
    tx.onerror=()=>{resolve();store.close()};
    tx.onabort=()=>{resolve();store.close()};
  });
}
export async function clearERP():Promise<void>{
  const store=await db();if(!store)return;
  return new Promise(resolve=>{
    const tx=store.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete=()=>{resolve();store.close()};
    tx.onerror=()=>{resolve();store.close()};
    tx.onabort=()=>{resolve();store.close()};
  });
}
