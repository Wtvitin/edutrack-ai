import {agentErrorMessage} from '../lib/agent-errors.mjs';
export class LabError extends Error{
  constructor(message,status=400,code='lab-input'){super(message);this.status=status;this.code=code;}
}
export async function labModelDocument(provider,request,validate){
  try{
    const result=await provider.complete(request);
    if(result.toolCalls?.length)throw new LabError('A IA tentou usar uma ferramenta durante o estudo. Nenhuma ação foi executada.',502,'lab-invalid-generation');
    if(typeof result.content!=='string'||Buffer.byteLength(result.content)>120000)throw new LabError('A resposta da IA ficou incompleta ou excedeu o limite.',502,'lab-invalid-generation');
    let json;try{json=JSON.parse(result.content);}catch{throw new LabError('A IA retornou um conteúdo inválido. Nenhum resultado foi publicado.',502,'lab-invalid-generation');}
    const checked=validate(json);
    if(!checked.success)throw new LabError('O conteúdo não passou na validação de respostas, referências ou evidências.',502,'lab-invalid-generation');
    return checked.data;
  }catch(cause){
    if(cause instanceof LabError)throw cause;
    const providerFailure=typeof cause.code==='string'&&(cause.code.startsWith('provider-')||cause.code==='model-not-configured');
    const failure=new LabError(providerFailure?agentErrorMessage(cause.code,cause.status):'Não foi possível acessar a IA. Tente novamente mais tarde.',providerFailure&&cause.status===429?429:503,providerFailure?cause.code:'lab-provider-failed');
    if(providerFailure){
      failure.providerStatus=cause.providerStatus;
      failure.providerCode=cause.providerCode;
    }
    throw failure;
  }
}
