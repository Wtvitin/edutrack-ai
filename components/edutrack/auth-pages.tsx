"use client";
import {useCallback,useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Eye,EyeOff,Mail,Sparkles} from 'lucide-react';
import Link from './link';
import {Brand} from './app';
import {api} from './account-store'; import {navigateTo} from './navigation';
const info:Record<string,{title:string;description:string;button:string}>={
  login:{title:'Entre na sua conta',description:'Continue de onde você parou.',button:'Entrar'},
  cadastro:{title:'Seu próximo passo começa aqui',description:'Crie sua conta e confirme seu e-mail para começar.',button:'Criar minha conta'},
  'recuperar-senha':{title:'Vamos recuperar seu acesso',description:'Enviaremos um link válido por 30 minutos.',button:'Enviar link de recuperação'},
  'nova-senha':{title:'Uma nova senha',description:'Escolha uma senha com pelo menos 10 caracteres.',button:'Atualizar senha'},
  'verificar-email':{title:'Confirme seu e-mail',description:'A confirmação protege sua conta e é necessária no primeiro acesso.',button:'Confirmar meu e-mail'},
};
function subscribeToLocation(onChange:()=>void){window.addEventListener('popstate',onChange);return ()=>window.removeEventListener('popstate',onChange);}
const readToken=()=>new URLSearchParams(window.location.search).get('token')||'';
const emptyToken=()=>'';
export function AuthPage({page}:{page:string}){
  const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[success,setSuccess]=useState(false),[resend,setResend]=useState(false),[localMailbox,setLocalMailbox]=useState(false);
  const token=useSyncExternalStore(subscribeToLocation,readToken,emptyToken);
  const content=info[page]||info.login;
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const fields=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);setMessage('');setSuccess(false);
    try{
      if(page==='nova-senha'&&fields.password!==fields.confirmation)throw new Error('As senhas precisam ser iguais.');
      const path=resend?'/auth/resend':({login:'/auth/login',cadastro:'/auth/register','recuperar-senha':'/auth/request-reset','nova-senha':'/auth/reset','verificar-email':'/auth/verify'} as Record<string,string>)[page];
      const result=await api<{message?:string}>(path,{...fields,token});
      if(page==='login'&&!resend){localStorage.removeItem('edutrack-mode');await navigateTo('/');return;}
      setMessage(result.message||'Concluído.');setSuccess(true);setLocalMailbox(false);
      if(page==='cadastro'||page==='recuperar-senha'||resend){
        try{const status=await api<{localMailbox:boolean}>('/health');setLocalMailbox(status.localMailbox);}
        catch{}
      }
      if(page==='nova-senha'||page==='verificar-email')window.history.replaceState(null,'',window.location.pathname);
    }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}
  }
  return <div className="auth-layout"><aside className="auth-story"><Brand/><div><span className="eyebrow">SEU ESPAÇO PARA IR ALÉM</span><h2>Pequenos passos.<br/>Grandes<br/><span>possibilidades.</span></h2><p>Organize seus estudos, encontre seu ritmo e abra espaço para o que vem pela frente.</p></div><span className="auth-tagline">Seu tempo. Seu ritmo. Seu futuro. <Sparkles size={17}/></span></aside><main className="auth-main"><Link className="back-link" href="/inicio"><ArrowLeft size={16}/>Voltar ao início</Link><div className="auth-card"><span className="eyebrow">BEM-VINDO AO EDUTRACK AI</span><h1>{resend?'Solicitar nova confirmação':content.title}</h1><p className="section-description">{content.description}</p>
    <form className="edu-form" onSubmit={submit}>
      {page==='cadastro'&&<div className="field"><label htmlFor="auth-name">Seu nome</label><input id="auth-name" name="name" autoComplete="name" required maxLength={80}/></div>}
      {(!['nova-senha','verificar-email'].includes(page)||resend)&&<div className="field"><label htmlFor="auth-email">E-mail</label><input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="voce@gmail.com"/></div>}
      {['login','cadastro','nova-senha'].includes(page)&&!resend&&<div className="field"><div className="field-label-row"><label htmlFor="auth-password">{page==='nova-senha'?'Nova senha':'Senha'}</label>{page==='login'&&<Link href="/recuperar-senha">Esqueci minha senha</Link>}</div><div className="password-field"><input id="auth-password" name="password" type={visible?'text':'password'} minLength={page==='login'?1:10} maxLength={128} required autoComplete={page==='login'?'current-password':'new-password'} placeholder="Pelo menos 10 caracteres"/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?'Ocultar senha':'Mostrar senha'}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>}
      {page==='nova-senha'&&<div className="field"><label htmlFor="auth-confirm">Confirme a nova senha</label><input id="auth-confirm" name="confirmation" type="password" minLength={10} maxLength={128} required autoComplete="new-password"/></div>}
      {page==='verificar-email'&&!resend&&<div className="email-illustration"><Mail size={42}/><p>{token?'Clique abaixo para confirmar seu endereço.':'Abra o link enviado ao seu e-mail ou solicite uma nova confirmação.'}</p></div>}
      <button className="button primary full-width" disabled={busy||((page==='verificar-email'||page==='nova-senha')&&!token&&!resend)||success&&['nova-senha','verificar-email'].includes(page)&&!resend}>{busy?'Aguarde…':resend?'Enviar novo link':content.button}<ArrowRight size={16}/></button>
      {message&&<p className={`form-feedback ${success?'success':'error'}`} role={success?'status':'alert'}>{message}</p>}
      {success&&localMailbox&&<p className="form-feedback success">Este ambiente não envia e-mails externos. Consulte sua mensagem em <Link href="/emails-locais">E-mails de teste</Link>.</p>}
    </form>
    {['login','verificar-email'].includes(page)&&<button className="text-link resend-button" onClick={()=>{setResend(!resend);setMessage('');setSuccess(false);}}>{resend?'Voltar':'Não recebi a confirmação'}</button>}
    <div className="auth-switch">{page==='login'?<>Ainda não tem conta? <Link href="/cadastro">Criar conta</Link></>:<Link href="/login">Voltar para entrar</Link>}</div><div className="auth-divider"><span>ou conheça agora</span></div><Link className="button secondary full-width" href="/demo">Explorar sem criar conta<ArrowRight size={16}/></Link><p className="auth-policy">Confira a <Link href="/privacidade">política de privacidade</Link>. Nunca compartilhe sua senha.</p></div></main></div>;
}
type Message={id:string;recipient:string;subject:string;body:string;link:string;created_at:string};
export function LocalMailbox(){const [messages,setMessages]=useState<Message[]>([]),[error,setError]=useState('');const load=useCallback(()=>api<{messages:Message[]}>('/dev/mail').then(result=>{setMessages(result.messages);setError('');}).catch(()=>setError('A caixa local não está disponível neste ambiente.')),[]);useEffect(()=>{void load();},[load]);return <main className="information-page"><Link className="back-link" href="/login"><ArrowLeft size={16}/>Voltar para entrar</Link><h1>E-mails de teste</h1><p>Somente para desenvolvimento local. Os links abaixo permitem ativar contas de teste e redefinir senhas; não use esta caixa em produção.</p><button className="button secondary" onClick={()=>void load()}>Atualizar caixa</button>{error&&<p role="alert">{error}</p>}{!messages.length&&!error&&<p>Nenhuma mensagem ainda. Crie uma conta para começar.</p>}{messages.map(m=><article className="panel" key={m.id}><h2>{m.subject}</h2><p>Para: {m.recipient}</p><p>{m.body}</p><Link className="button primary" href={new URL(m.link).pathname+new URL(m.link).search}>Abrir link</Link></article>)}</main>;}
