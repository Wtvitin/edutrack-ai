const fields = {
  name: {type: 'string', minLength: 1, maxLength: 60},
  color: {type: 'string', enum: ['blue', 'purple', 'green', 'rose', 'orange']},
  description: {type: 'string', maxLength: 200},
  teacher: {type: 'string', maxLength: 120},
  hours: {type: 'integer', minimum: 0, maximum: 10000},
  revision: {type: 'integer', minimum: 0},
};
const parameters = [{name: 'id', in: 'path', required: true, schema: {type: 'string', format: 'uuid'}}];
const errors = Object.fromEntries([[400, 'Entrada inválida'], [401, 'Sessão obrigatória'], [404, 'Registro indisponível nesta conta'], [409, 'Revisão desatualizada ou disciplina em uso'], [503, 'Processamento Python indisponível']].map(([status, description]) => [status, {description}]));
const body = (required, properties = fields) => ({required: true, content: {'application/json': {schema: {type: 'object', required, properties, additionalProperties: false}}}});
const operation = (summary, extra = {}) => ({tags: ['Dados Acadêmicos'], summary, description: 'Exige cookie de sessão autenticada. A identidade é obtida no servidor; user_id nunca é aceito do cliente.', responses: {'200': {description: 'Operação concluída'}, ...errors}, ...extra});

export const courseworkPaths = {
  '/api/subjects': {
    get: operation('Listar disciplinas da conta'),
    post: operation('Criar disciplina', {requestBody: body(['revision', 'name']), responses: {'201': {description: 'Disciplina criada'}, ...errors}}),
  },
  '/api/subjects/{id}': {
    get: operation('Consultar disciplina', {parameters}),
    patch: operation('Atualizar campos de uma disciplina', {parameters, requestBody: body(['revision'])}),
    delete: operation('Excluir disciplina sem vínculos', {parameters, requestBody: body(['revision'], {revision: fields.revision})}),
  },
  '/api/subjects/search': {get: operation('Buscar por nome OU tarefas atrasadas usando Python', {parameters: [{name: 'q', in: 'query', schema: {type: 'string', maxLength: 120}}, {name: 'overdue', in: 'query', schema: {type: 'boolean', default: false}}]})},
  '/api/progress': {get: operation('Calcular percentual de tarefas concluídas usando Python', {parameters: [{name: 'subject', in: 'query', schema: {type: 'string', default: 'all'}}]})},
  '/api/reports/generate': {post: operation('Obter URL protegida de download do relatório', {requestBody: body([], {subject: {type: 'string', default: 'all'}})})},
  '/api/reports/download': {get: operation('Gerar e baixar PDF em Python', {parameters: [{name: 'subject', in: 'query', schema: {type: 'string', default: 'all'}}], responses: {'200': {description: 'PDF da conta autenticada', content: {'application/pdf': {schema: {type: 'string', format: 'binary'}}}}, ...errors}})},
};
