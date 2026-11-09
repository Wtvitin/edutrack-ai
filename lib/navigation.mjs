export function internalDestination(path,origin){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw new Error('Destino interno inválido.');
  const target=new URL(path,origin);
  if(target.origin!==new URL(origin).origin||target.username||target.password)throw new Error('Destino interno inválido.');
  return target.href;
}
export function isSameDocumentDestination(path,currentHref){
  const current=new URL(currentHref);
  const destination=new URL(path,currentHref);
  return destination.origin===current.origin&&destination.pathname===current.pathname&&destination.search===current.search&&destination.hash===current.hash;
}

const studyPages=new Set(['disciplinas','tarefas','calendario','sessoes','laboratorio','progresso','relatorios','integracoes','agente','perfil','configuracoes','ajuda','notificacoes','historico']);
export function isStudyPath(pathname){
  if(pathname==='/')return true;
  const parts=pathname.replace(/\/$/,'').slice(1).split('/');
  return studyPages.has(parts[0])&&(parts.length===1||(parts[0]==='disciplinas'&&parts.length===2&&parts[1]!==''));
}
export function canNavigateWithinStudy(path,currentHref){
  const current=new URL(currentHref);
  const destination=new URL(internalDestination(path,current.origin));
  return isStudyPath(current.pathname)&&isStudyPath(destination.pathname);
}
