"use client";
import {requestJson} from '../../lib/http-json.mjs';
import {useEffect,useRef,useState,useCallback,type Dispatch,type SetStateAction} from 'react';
import {toast} from 'sonner'; import {navigateTo} from './navigation';
import {seedData,type StudyData} from '@/lib/edutrack';
import {studyDataSchema} from '@/lib/edutrack-schema';
declare global {interface Window {edutrackFlush?:()=>Promise<void>}}
export async function api<T=Record<string,unknown>>(path:string,data?:unknown,method=data?'POST':'GET'):Promise<T>{
  return requestJson(`/api${path}`,data,method) as Promise<T>;
}
export function useStudyStore(enabled:boolean,forceDemo=false){
  const [data,setSnapshot]=useState<StudyData>(()=>seedData());const [ready,setReady]=useState(false);const [mode,setMode]=useState<'account'|'demo'>('demo');const [saving,setSaving]=useState(false);
  const ref=useRef(data),revision=useRef(0),modeRef=useRef<'account'|'demo'>('demo'),queue=useRef(Promise.resolve()),pending=useRef(0),epoch=useRef(0),recovering=useRef(false);
  useEffect(()=>{
    if(!enabled)return;let live=true;
    async function load(){
      try{
        if(forceDemo)localStorage.setItem('edutrack-mode','demo');
        if(forceDemo||localStorage.getItem('edutrack-mode')==='demo'){
          const raw=localStorage.getItem('edutrack-demo-v1');const parsed=raw?studyDataSchema.safeParse(JSON.parse(raw)):null;
          const next=parsed?.success?parsed.data:seedData();if(live){modeRef.current='demo';setMode('demo');ref.current=next;setSnapshot(next);setReady(true);}return;
        }
        const response=await fetch('/api/data',{credentials:'same-origin'});
        if(response.status===401){await navigateTo('/login');return;}
        if(!response.ok)throw new Error('Não foi possível carregar a conta. Verifique se o servidor está rodando.');
        const result=await response.json() as {revision:number;data:StudyData};if(live){modeRef.current='account';setMode('account');revision.current=result.revision;ref.current=result.data;setSnapshot(result.data);setReady(true);}
      }catch(e){toast.error(e instanceof Error?e.message:'Não foi possível carregar os dados.');}
    }
    void load();return()=>{live=false;};
  },[enabled,forceDemo]);
  useEffect(()=>{
    const flush=()=>queue.current;window.edutrackFlush=flush;
    const guard=(e:BeforeUnloadEvent)=>{if(pending.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',guard);return()=>{if(window.edutrackFlush===flush)delete window.edutrackFlush;window.removeEventListener('beforeunload',guard);};
  },[]);
  const setData=useCallback<Dispatch<SetStateAction<StudyData>>>(update=>{
    if(recovering.current){toast.error('Aguarde a recarga dos dados antes de alterar novamente.');return;}
    const next=typeof update==='function'?update(ref.current):update;ref.current=next;setSnapshot(next);
    if(modeRef.current==='demo'){try{localStorage.setItem('edutrack-demo-v1',JSON.stringify(next));}catch{toast.error('Não foi possível salvar no navegador.');}return;}
    const generation=epoch.current;pending.current++;setSaving(true);
    queue.current=queue.current.then(async()=>{
      if(generation!==epoch.current)return;
      try{const result=await api<{revision:number}>('/data',{data:next,revision:revision.current},'PUT');revision.current=result.revision;}
      catch(e){epoch.current++;recovering.current=true;toast.error(e instanceof Error?e.message:'Não foi possível salvar.');const latest=await api<{revision:number;data:StudyData}>('/data');revision.current=latest.revision;ref.current=latest.data;setSnapshot(latest.data);recovering.current=false;}
    }).catch(()=>{toast.error('Servidor indisponível. Recarregue a página.');}).finally(()=>{pending.current--;if(!pending.current)setSaving(false);});
  },[]);
  const reload=useCallback(async()=>{
    await queue.current;
    if(modeRef.current!=='account')return;
    recovering.current=true;
    try{
      const latest=await api<{revision:number;data:StudyData}>('/data');
      revision.current=latest.revision;ref.current=latest.data;setSnapshot(latest.data);
    }finally{recovering.current=false;}
  },[]);
  return {data,setData,ready,mode,saving,reload};
}
