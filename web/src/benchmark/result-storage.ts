declare const FRAME_LAB_HOSTED: boolean;
export const hosted = typeof FRAME_LAB_HOSTED !== 'undefined' && FRAME_LAB_HOSTED;
async function database(): Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{const request=indexedDB.open('frame-lab-results',1);request.onupgradeneeded=()=>request.result.createObjectStore('runs',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function saveBrowserResult(report:Record<string,unknown>){
 const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('runs','readwrite');tx.objectStore('runs').put({...report,id:'browser-'+crypto.randomUUID()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function browserResults():Promise<any[]>{
 const db=await database();try{return await new Promise((resolve,reject)=>{const request=db.transaction('runs').objectStore('runs').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
