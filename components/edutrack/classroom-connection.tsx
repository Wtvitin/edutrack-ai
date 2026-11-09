"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {BookOpenCheck,Check,Link2,MoreVertical,RefreshCw,Unplug} from 'lucide-react';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {api} from './account-store';
import Link from './link';
import {ClassroomDeliveryStatus} from './classroom-deliveries';

type Status={configured:boolean;connected:boolean;lastSyncAt:string|null;selectedCourseIds:string[]};
type Course={id:string;name:string;section:string};
type ImportResult={created:number;updated:number;unchanged:number;skippedDeleted:number;subjectsCreated:number};
const callbackMessages:Record<string,string>={
  connected:'Classroom autorizado. Escolha as turmas que você quer importar.',
  'classroom-denied':'Você cancelou a autorização. Nenhuma conta foi conectada.',
  'classroom-state':'A autorização expirou ou já foi utilizada. Clique em conectar novamente.',
  'classroom-scope':'É necessário autorizar a leitura das turmas e atividades.',
  'classroom-scope-response':'O Google retornou a autorização sem informar as permissões concedidas. A conexão não foi salva; o diagnóstico seguro está disponível no servidor.',
  'classroom-scope-both':'O Google não confirmou as permissões de leitura das turmas e atividades nesta autorização. Confira os dois acessos e tente conectar novamente.',
  'classroom-scope-courses':'O Google não confirmou a permissão de leitura das turmas nesta autorização. Autorize esse acesso ao reconectar.',
  'classroom-scope-coursework':'O Google não confirmou a permissão de leitura das suas atividades nesta autorização. Autorize esse acesso ao reconectar.',
  'classroom-scope-no-courses':'O Google retornou uma permissão alternativa, mas não há turmas ativas como aluno para validar a leitura das atividades. Confira se está usando a conta que possui suas turmas.',
  'classroom-scope-api-denied':'A conta foi autorizada no Google, mas a API negou a leitura das atividades. Confira a Classroom API e as regras de acesso da instituição. A conexão não foi salva.',
  'classroom-reconnect':'Reconecte o Classroom e confirme as permissões solicitadas.',
  'classroom-session':'Entre no EduTrack novamente antes de conectar o Classroom.',
  'classroom-failed':'Não foi possível conectar. Confira sua sessão, as credenciais e o endereço de retorno no Google.',
};
export function ClassroomConnection({mode,saving,onImported}:{mode:'account'|'demo';saving:boolean;onImported:()=>Promise<void>}){
  const [status,setStatus]=useState<Status|null>(null),[courses,setCourses]=useState<Course[]>([]);
  const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(mode==='account');
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[result,setResult]=useState<ImportResult|null>(null);
  const [confirmDisconnect,setConfirmDisconnect]=useState(false);
  const menuButton=useRef<HTMLButtonElement>(null);
  const load=useCallback(()=>api<Status>('/integrations/classroom/status').then(async next=>{
      setStatus(next);setError('');
      if(next.connected&&next.configured){
        const response=await api<{courses:Course[]}>('/integrations/classroom/courses');
        setCourses(response.courses);setSelected(next.selectedCourseIds.filter(id=>response.courses.some(c=>c.id===id)));
      }else{setCourses([]);setSelected([]);}
  }).catch(e=>{setError(e instanceof Error?e.message:'Não foi possível carregar a conexão.');})
    .finally(()=>{setLoading(false);}),[]);
  useEffect(()=>{
    if(mode!=='account')return;
    const params=new URLSearchParams(window.location.search),outcome=params.get('classroom');
    let active=true;
    void load().then(()=>{
      if(active&&outcome&&callbackMessages[outcome]){
        setNotice(callbackMessages[outcome]);params.delete('classroom');
        window.history.replaceState(null,'',window.location.pathname+(params.size?'?'+params.toString():'')+window.location.hash);
      }
    });
    return()=>{active=false;};
  },[mode,load]);
  function refresh(){setLoading(true);setError('');void load();}
  async function connect(){
    setBusy(true);setError('');
    try{
      await window.edutrackFlush?.();
      const response=await api<{authorizationUrl:string}>('/integrations/classroom/connect',{});
      const url=new URL(response.authorizationUrl);
      if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw new Error('Endereço de autorização inválido.');
      window.location.assign(url.href);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar a autorização.');setBusy(false);}
  }
  async function sync(){
    setBusy(true);setError('');setNotice('');setResult(null);
    try{
      await window.edutrackFlush?.();
      const snapshot=await api<{revision:number}>('/data');
      const imported=await api<ImportResult>('/integrations/classroom/sync',{courseIds:selected,revision:snapshot.revision});
      setResult(imported);
      window.dispatchEvent(new Event('edutrack-classroom-changed'));
      try{await onImported();await load();}catch{setError('A importação foi concluída, mas a interface não atualizou. Recarregue a página.');}
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível importar as atividades.');}
    finally{setBusy(false);}
  }
  async function disconnect(){
    setBusy(true);setError('');setResult(null);
    try{
      await api('/integrations/classroom/disconnect',{});
      window.dispatchEvent(new Event('edutrack-classroom-changed'));
      setNotice('Conexão removida. As tarefas e disciplinas já importadas foram mantidas.');await load();
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível desconectar.');}
    finally{setBusy(false);}
  }
  const disabled=busy||saving||loading;
  const connected=!!(status?.configured&&status.connected);
  const label=mode==='demo'?'Demonstração':loading?'Verificando…':connected?'Conectado':status?.configured?'Não conectado':status?'Não configurado':'Indisponível';

  return <section className="classroom-connection" id="classroom-connection" aria-labelledby="classroom-connection-title" aria-busy={busy||loading}>
    <header className="classroom-connection-heading">
      <span className="classroom-mark" aria-hidden="true"><BookOpenCheck size={26}/></span>
      <div className="classroom-connection-name">
        <div><h2 id="classroom-connection-title">Google Classroom</h2><span className={`classroom-status${connected?' is-connected':''}`}>{connected&&<Check size={14}/>} {label}</span></div>
        <p>Somente leitura</p>
      </div>
      {connected&&<DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button ref={menuButton} type="button" className="icon-button classroom-menu" aria-label="Opções do Classroom" disabled={disabled}><MoreVertical size={20}/></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={()=>void connect()}><Link2 size={16}/>Reconectar Google</DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>setConfirmDisconnect(true)}><Unplug size={16}/>Desconectar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </header>

    {mode==='demo'?<p className="classroom-info">Entre na sua conta para conectar o Classroom. <Link href="/login" className="text-link">Entrar</Link></p>:<>
      {notice&&<p className="classroom-info" role="status">{notice}</p>}
      {error&&<p className="classroom-error" role="alert">{error}</p>}
      {loading&&<p className="classroom-caption" role="status">Carregando sua conexão e suas turmas…</p>}
      {!loading&&status&&!status.configured&&<p className="classroom-info">O Classroom ainda não foi configurado neste servidor.</p>}
      {!loading&&status?.configured&&!connected&&<div className="classroom-actions">
        <p className="classroom-caption">Conecte sua conta Google para escolher as turmas que deseja importar.</p>
        <button type="button" className="button primary" disabled={disabled} onClick={()=>void connect()}><Link2 size={17}/>{busy?'Aguarde…':'Conectar Google Classroom'}</button>
      </div>}
      {connected&&<>
        <div className="classroom-courses-heading">
          <h3 id="classroom-courses-title">Suas turmas</h3>
          <button type="button" className="button secondary" disabled={disabled} onClick={refresh}><RefreshCw size={15}/>Atualizar turmas</button>
        </div>
        <fieldset className="classroom-courses" aria-labelledby="classroom-courses-title" disabled={disabled}>
          {courses.map(course=><label className="classroom-course" key={course.id}>
            <input type="checkbox" checked={selected.includes(course.id)} onChange={event=>setSelected(previous=>event.target.checked?[...previous,course.id]:previous.filter(id=>id!==course.id))} disabled={!selected.includes(course.id)&&selected.length>=20}/>
            <span><strong>{course.name}</strong>{course.section&&<small>{course.section}</small>}</span>
          </label>)}
          {!loading&&!error&&!courses.length&&<p className="classroom-caption">Nenhuma turma ativa encontrada como aluno. Confira a conta Google conectada.</p>}
        </fieldset>
        {courses.length>0&&<div className="classroom-sync-footer">
          <button type="button" className="button primary" disabled={disabled||!selected.length} onClick={()=>void sync()}><RefreshCw size={17}/>{busy?'Aguarde…':'Sincronizar atividades'}</button>
          <div aria-live="polite">
            <strong>{selected.length===1?'1 turma selecionada':`${selected.length} turmas selecionadas`}</strong>
            {selected.length>=20&&<p>Limite de 20 turmas atingido.</p>}
            <p>Última sincronização: {status?.lastSyncAt?new Date(status.lastSyncAt).toLocaleString('pt-BR'):'ainda não realizada'}</p>
          </div>
        </div>}
        <details className="classroom-details">
          <summary>Sobre a sincronização</summary>
          <p>O EduTrack importa as atividades publicadas das turmas selecionadas e preserva suas alterações locais. As entregas no Google continuam sob seu controle.</p>
          <ClassroomDeliveryStatus/>
        </details>
      </>}
      {result&&<p className="classroom-info" role="status">Importação concluída: {result.created} novas, {result.updated} atualizadas e {result.unchanged} sem alterações. {result.subjectsCreated} disciplinas criadas.{result.skippedDeleted>0?` ${result.skippedDeleted} atividades removidas no EduTrack não foram recriadas.`:''} <Link href="/tarefas" className="text-link">Ver tarefas</Link></p>}
      {!loading&&!status&&<button type="button" className="button secondary" disabled={busy} onClick={refresh}>Tentar novamente</button>}
    </>}

    <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
      <AlertDialogContent onCloseAutoFocus={event=>{event.preventDefault();menuButton.current?.focus();}}>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar o Classroom?</AlertDialogTitle>
          <AlertDialogDescription>O acesso no Google será revogado. As tarefas e disciplinas já importadas permanecem no EduTrack.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={()=>void disconnect()}>Desconectar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
