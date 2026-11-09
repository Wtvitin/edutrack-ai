const messages = Object.freeze({
  'provider-safety-blocked': 'O Gemini bloqueou esta solicitação por segurança. Reformule a mensagem.',
  'provider-quota-exhausted': 'A cota diária do Gemini foi atingida. Aguarde sua renovação ou confira os limites do projeto.',
  'provider-timeout': 'O assistente demorou para responder. Tente novamente em instantes.',
  'provider-network': 'Não foi possível conectar ao serviço de IA. Confira a conexão e tente novamente.',
  'provider-empty-response': 'O serviço de IA não retornou uma resposta utilizável. Tente novamente em instantes.',
  'provider-output-truncated': 'A resposta atingiu o limite de saída. Peça uma análise mais curta.',
  'provider-invalid-tool-call': 'O modelo retornou uma chamada de ferramenta inválida. Nenhuma nova ação foi executada.',
  'provider-generation-failed': 'O modelo não concluiu a resposta. Reformule sua solicitação.',
  'provider-not-configured': 'O serviço de IA ainda não está configurado neste servidor.',
  'invalid-structured-output': 'A resposta da IA não passou na validação do sistema.',
});
export function agentErrorMessage(code,status,actionsApplied=false){
  const message=messages[code] || (status===401 ? 'Sua sessão expirou. Entre novamente para usar o assistente.' : status===429 ? 'O limite de uso da IA foi atingido. Aguarde antes de tentar novamente.' : 'Não foi possível concluir a conversa agora. Tente novamente em instantes.');
  return message + (actionsApplied ? ' Uma ação já foi aplicada. Confira suas tarefas antes de repetir o pedido.' : '');
}
