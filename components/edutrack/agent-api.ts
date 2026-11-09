import {agentErrorMessage} from '../../lib/agent-errors.mjs';
import {structuredResponseSchema} from '../../lib/agent-response-schemas.mjs';

export type ChartSpecification = {
  type: string;
  title: string;
  description?: string;
  xAxis: { field: string; label: string };
  yAxis: { field: string; label: string };
  series: Array<{ field: string; label: string }>;
  data: Array<Record<string, unknown>>;
  source: { tool: string };
  datasetVersion: string;
};

export type AgentResponse =
  | { type: 'text'; content: string; metadata?: Record<string, unknown> }
  | { type: 'analysis'; analysis: string; metrics: Record<string, unknown>; chart?: ChartSpecification; metadata?: Record<string, unknown> }
  | { type: 'action'; action: 'create_task' | 'update_task' | 'complete_task' | 'prepare_study_quiz' | 'prepare_study_exam' | 'prepare_study_flashcards'; result: Record<string, unknown>; metadata?: Record<string, unknown> };

export type AgentChatResult = { conversationId: string; response: AgentResponse; metadata?: { model?: string; iterations?: number; toolCalls?: number } };

export class AgentRequestError extends Error {
  conversationId?: string;
  actionsApplied: boolean;
  code: string;
  constructor(code:string,status:number,conversationId?:string,actionsApplied=false){
    super(agentErrorMessage(code,status,actionsApplied));
    this.name='AgentRequestError';this.code=code;this.conversationId=conversationId;this.actionsApplied=actionsApplied;
  }
}

export async function chatWithAgent(input: { message: string; conversationId?: string }, fetchImpl: typeof fetch = fetch): Promise<AgentChatResult> {
  await (typeof window!=='undefined'?window.edutrackFlush?.():undefined);
  let response: Response;
  try {response = await fetchImpl('/api/ai/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });}
  catch {throw new AgentRequestError('provider-network',503);}
  let result: AgentChatResult & {code?: string; actionsApplied?: boolean};
  try {result = await response.json();}catch {throw new AgentRequestError('agent-invalid-response',response.status);}
  if(!result||typeof result!=='object')throw new AgentRequestError('agent-invalid-response',response.status);
  if (!response.ok) {
    const id=typeof result.conversationId==='string'&&/^[0-9a-f-]{36}$/i.test(result.conversationId)?result.conversationId:undefined;
    throw new AgentRequestError(typeof result.code==='string'?result.code:'agent-error',response.status,id,result.actionsApplied===true);
  }
  const checked=structuredResponseSchema.safeParse(result.response);
  if(typeof result.conversationId!=='string'||!checked.success)throw new AgentRequestError('agent-invalid-response',503);
  return {...result,response:checked.data};
}
