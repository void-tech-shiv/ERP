import type { Course } from './calculator';

type DemoSnapshot = {courses: Course[]; savedAt:string};
const DB='attendly-demo-v1', STORE='attendance', KEY='demo';

function openDb():Promise<IDBDatabase|null>{
  if(typeof indexedDB==='undefined')return Promise.resolve(null);
  return new Promise(resolve=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
    req.onerror=()=>resolve(null);
    req.onsuccess=()=>resolve(req.result);
  });
}
export async function loadDemo():Promise<DemoSnapshot|null>{
  const db=await openDb();if(!db)return null;
  return new Promise(resolve=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).get(KEY);
    req.onsuccess=()=>{resolve((req.result as DemoSnapshot)||null);db.close()};
    req.onerror=()=>{resolve(null);db.close()};
  });
}
export async function saveDemo(data:DemoSnapshot):Promise<void>{
  const db=await openDb();if(!db)return;
  return new Promise(resolve=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(data,KEY);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();resolve()};
    tx.onabort=()=>{db.close();resolve()};
  });
}

export async function clearDemo():Promise<void>{
  const db=await openDb();if(!db)return;
  return new Promise(resolve=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();resolve()};
    tx.onabort=()=>{db.close();resolve()};
  });
}
