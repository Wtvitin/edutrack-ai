// Bounded process-local technical metrics. No content, identity, URLs or secrets.
export function createRuntimeMetrics(){
  const values=new Map();
  return {record({operation,status,durationMs,provider}={}){
    if(!['auth','data','analytics','agent','lab','classroom','other','provider'].includes(operation)||!Number.isFinite(durationMs)||!Number.isInteger(status))return;
    const safeProvider=['google-gemini','groq','openrouter'].includes(provider)?provider:'none',key=operation+':'+safeProvider+':'+status;
    if(!values.has(key)&&values.size>=64)return;
    const item=values.get(key)||{operation,provider:safeProvider,status,count:0,totalMs:0,samples:[]};item.count++;item.totalMs+=Math.max(0,durationMs);item.samples.push(Math.max(0,durationMs));if(item.samples.length>128)item.samples.shift();values.set(key,item);
  },snapshot(){return [...values.values()].map(({samples,...v})=>{const sorted=[...samples].sort((a,b)=>a-b);return {...v,averageMs:Math.round(v.totalMs/v.count*100)/100,p95RecentMs:Math.round(sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]*100)/100};});}};
}
export function instrumentProvider(provider,metrics,name){return {async complete(request){const started=performance.now();let status=200;try{return await provider.complete(request);}catch(e){status=Number.isInteger(e.status)?e.status:503;throw e;}finally{metrics.record({operation:'provider',provider:name,status,durationMs:performance.now()-started});}}};}
export const metricOperation=path=>path.startsWith('/api/auth/')?'auth':path==='/api/data'?'data':path==='/api/analytics'?'analytics':path==='/api/ai/chat'?'agent':path.startsWith('/api/lab')?'lab':path.startsWith('/api/integrations/')?'classroom':'other';
