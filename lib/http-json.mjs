export async function requestJson(path,input,method=input===undefined?'GET':'POST',fetchImpl=fetch){
  let response;try{response=await fetchImpl(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});}catch{throw new Error('Não foi possível conectar ao servidor. Verifique a conexão antes de tentar novamente.');}
  let value;try{value=await response.json();}catch{throw new Error('O servidor retornou uma resposta incompleta. Consulte os dados salvos antes de tentar novamente.');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('O servidor retornou uma resposta inválida. Consulte os dados salvos.');
  if(!response.ok)throw Object.assign(new Error(typeof value.message==='string'?value.message:'Não foi possível concluir a operação.'),{status:response.status});
  return value;
}
