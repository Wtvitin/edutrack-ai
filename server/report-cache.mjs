// Small per-process cache: ownership and revision are supplied by the caller.
export function createReportCache({ttlMs=30000,maxEntries=32,now=Date.now}={}){
  const entries=new Map();
  return {get(key,create){const current=entries.get(key);if(current&&current.expires>now())return current.promise;if(current)entries.delete(key);while(entries.size>=maxEntries)entries.delete(entries.keys().next().value);const entry={expires:now()+ttlMs};entry.promise=Promise.resolve().then(create).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});entries.set(key,entry);return entry.promise;},size:()=>entries.size};
}
