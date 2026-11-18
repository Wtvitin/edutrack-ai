export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EduTrack AI — API Reference',
    version: '0.1.0',
    description: 'Documentação interativa de todas as APIs do sistema EduTrack AI: autenticação, snapshot de dados, histórico, analytics (Python/Pandas), chat com agente de IA e integração com Google Classroom.',
    contact: {
      name: 'EduTrack AI Team'
    }
  },
  servers: [
    {
      url: 'http://localhost:4173',
      description: 'Servidor Local (Loopback)'
    }
  ],
  tags: [
    { name: 'Autenticação', description: 'Registro, login, confirmação de e-mail e recuperação de senha' },
    { name: 'Dados Acadêmicos', description: 'Snapshot completo de disciplinas, tarefas e sessões de estudo' },
    { name: 'Analytics', description: 'Métricas e relatórios de produtividade gerados com Python e Pandas' },
    { name: 'Agente de IA', description: 'Chat autenticado com provedores LLM (Groq / Gemini) e execução de tools' },
    { name: 'Notificações', description: 'Lembretes internos de prazos e tarefas pendentes' },
    { name: 'Integrações (Google Classroom)', description: 'OAuth 2.0 e sincronização de turmas e atividades do Classroom' },
    { name: 'Diagnóstico e Desenvolvimento', description: 'Health check e caixa de e-mails local para ambiente de desenvolvimento' }
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Diagnóstico e Desenvolvimento'],
        summary: 'Verificação de saúde do backend',
        description: 'Retorna o status operacional do backend e se a caixa de e-mails local está ativa.',
        responses: {
          '200': {
            description: 'Backend em execução normal',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    localMailbox: { type: 'boolean', example: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/dev/mail': {
      get: {
        tags: ['Diagnóstico e Desenvolvimento'],
        summary: 'Caixa de entrada local de desenvolvimento',
        description: 'Disponível apenas em modo local com MAIL_MODE=local. Retorna os últimos 30 e-mails de confirmação ou recuperação.',
        responses: {
          '200': {
            description: 'Lista de e-mails capturados no ambiente de desenvolvimento',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    messages: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          recipient: { type: 'string', format: 'email' },
                          subject: { type: 'string' },
                          body: { type: 'string' },
                          link: { type: 'string', format: 'uri' },
                          created_at: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '404': { description: 'Não disponível em ambiente de produção' }
        }
      }
    },
    '/api/auth/register': {
      post: {
        tags: ['Autenticação'],
        summary: 'Cadastro de novo usuário',
        description: 'Cria o usuário, associa a disciplina padrão "Estudo livre" e envia o token de confirmação por e-mail.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 80, example: 'Maria Silva' },
                  email: { type: 'string', format: 'email', maxLength: 254, example: 'maria@example.com' },
                  password: { type: 'string', minLength: 10, maxLength: 128, example: 'SenhaSegura123!' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Solicitação aceita. Se o e-mail estiver elegível, as instruções serão enviadas.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Se o endereço estiver disponível, você receberá um link para confirmar sua conta.' }
                  }
                }
              }
            }
          },
          '400': { description: 'Campos inválidos ou senha fora do padrão exigido' },
          '429': { description: 'Muitas tentativas de cadastro' }
        }
      }
    },
    '/api/auth/login': {
      post: {
        tags: ['Autenticação'],
        summary: 'Autenticação e início de sessão',
        description: 'Verifica as credenciais scrypt e se a conta foi ativada. Retorna o cookie de sessão HttpOnly.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'maria@example.com' },
                  password: { type: 'string', minLength: 10, maxLength: 128, example: 'SenhaSegura123!' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login efetuado com sucesso',
            headers: {
              'Set-Cookie': {
                schema: { type: 'string' },
                description: 'Cookie de sessão HttpOnly com validade de 7 dias'
              }
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        verified: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': { description: 'E-mail ou senha incorretos' },
          '403': { description: 'E-mail ainda não confirmado' }
        }
      }
    },
    '/api/auth/session': {
      get: {
        tags: ['Autenticação'],
        summary: 'Dados da sessão atual',
        description: 'Verifica a identidade autenticada através do cookie de sessão.',
        responses: {
          '200': {
            description: 'Sessão válida',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        verified: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': { description: 'Não autenticado ou sessão expirada' }
        }
      }
    },
    '/api/auth/logout': {
      post: {
        tags: ['Autenticação'],
        summary: 'Encerramento de sessão',
        description: 'Revoga o token de sessão no banco e invalida o cookie no navegador.',
        responses: {
          '200': {
            description: 'Sessão encerrada com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/auth/verify': {
      post: {
        tags: ['Autenticação'],
        summary: 'Confirmação de e-mail por token',
        description: 'Confirma o endereço de e-mail e ativa a conta para login.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string', pattern: '^[a-f0-9]{64}$', example: 'd3b07384d113edec49eaa6238ad5ff00...' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Conta ativada com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'E-mail confirmado! Agora você pode entrar.' }
                  }
                }
              }
            }
          },
          '400': { description: 'Token inválido, expirado ou já utilizado' }
        }
      }
    },
    '/api/auth/resend': {
      post: {
        tags: ['Autenticação'],
        summary: 'Reenvio de token de confirmação',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'maria@example.com' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Instruções enviadas caso a conta exista e não esteja confirmada'
          }
        }
      }
    },
    '/api/auth/request-reset': {
      post: {
        tags: ['Autenticação'],
        summary: 'Solicitação de recuperação de senha',
        description: 'Gera um token de uso único com validade de 30 minutos e envia o link de redefinição.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'maria@example.com' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Instruções enviadas se a conta existir'
          }
        }
      }
    },
    '/api/auth/reset': {
      post: {
        tags: ['Autenticação'],
        summary: 'Redefinição de senha com token',
        description: 'Define a nova senha e cancela todas as sessões ativas do usuário.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                  password: { type: 'string', minLength: 10, maxLength: 128, example: 'NovaSenhaSegura123!' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Senha atualizada com sucesso'
          },
          '400': { description: 'Token inválido, expirado ou senha inválida' }
        }
      }
    },
    '/api/data': {
      get: {
        tags: ['Dados Acadêmicos'],
        summary: 'Snapshot completo dos dados do usuário',
        description: 'Retorna todas as disciplinas, tarefas, sessões de estudo e configurações de perfil com a revisão de concorrência.',
        responses: {
          '200': {
            description: 'Snapshot carregado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    revision: { type: 'integer', example: 5 },
                    data: {
                      type: 'object',
                      properties: {
                        version: { type: 'integer', example: 1 },
                        profile: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            name: { type: 'string' },
                            goal: { type: 'string' },
                            weeklyGoalMinutes: { type: 'integer' },
                            email: { type: 'string', format: 'email' },
                            notificationsEnabled: { type: 'boolean' },
                            theme: { type: 'string', enum: ['system', 'light', 'dark'] }
                          }
                        },
                        subjects: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              name: { type: 'string' },
                              color: { type: 'string', enum: ['blue', 'purple', 'green', 'rose', 'orange'] },
                              description: { type: 'string' }
                            }
                          }
                        },
                        tasks: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              title: { type: 'string' },
                              subjectId: { type: 'string' },
                              due: { type: 'string', example: '2026-11-25' },
                              done: { type: 'boolean' },
                              status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
                              priority: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
                              difficulty: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD'] },
                              estimatedMinutes: { type: 'integer', nullable: true },
                              description: { type: 'string' }
                            }
                          }
                        },
                        sessions: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              subjectId: { type: 'string' },
                              date: { type: 'string', example: '2026-11-18' },
                              minutes: { type: 'integer', example: 45 }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': { description: 'Sessão inválida' }
        }
      },
      put: {
        tags: ['Dados Acadêmicos'],
        summary: 'Salvar snapshot completo (controle de concorrência)',
        description: 'Grava atomicamente o estado completo de disciplinas, tarefas e estudos, verificando propriedade e revisão.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['revision', 'data'],
                properties: {
                  revision: { type: 'integer', example: 5 },
                  data: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Dados salvos com sucesso' },
          '400': { description: 'Erro de validação nos campos informados' },
          '409': { description: 'Conflito de concorrência: outra aba ou dispositivo salvou os dados antes' }
        }
      }
    },
    '/api/history': {
      get: {
        tags: ['Dados Acadêmicos'],
        summary: 'Histórico de alterações de tarefas',
        description: 'Retorna as últimas 100 alterações registradas em tarefas do usuário autenticado.',
        responses: {
          '200': {
            description: 'Lista de registros de histórico',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          changed_at: { type: 'string', format: 'date-time' },
                          changes_json: { type: 'object' },
                          title: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/analytics': {
      get: {
        tags: ['Analytics'],
        summary: 'Relatórios analíticos de desempenho (Python / Pandas)',
        description: 'Calcula carga horária, pendências, tarefas concluídas e comparativos temporais através de script Python em background.',
        parameters: [
          {
            name: 'days',
            in: 'query',
            required: false,
            schema: { type: 'integer', enum: [7, 30, 90], default: 7 },
            description: 'Período de análise em dias'
          },
          {
            name: 'subject',
            in: 'query',
            required: false,
            schema: { type: 'string', default: 'all' },
            description: 'ID da disciplina ou "all" para todas as disciplinas'
          }
        ],
        responses: {
          '200': {
            description: 'Métricas analíticas calculadas com sucesso'
          },
          '400': { description: 'Filtro de período ou disciplina inválido' },
          '503': { description: 'Falha no processador Python/Pandas' }
        }
      }
    },
    '/api/ai/chat': {
      post: {
        tags: ['Agente de IA'],
        summary: 'Interação com o agente acadêmico inteligente',
        description: 'Processa a mensagem com o modelo LLM configurado (Groq/Gemini), podendo acionar ferramentas do usuário (criação, edição e consulta de tarefas).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', minLength: 1, maxLength: 12000, example: 'Quais são as minhas tarefas mais urgentes desta semana?' },
                  conversationId: { type: 'string', format: 'uuid', nullable: true }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Resposta estruturada do agente (texto, análise com gráfico ou ação executada)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    conversationId: { type: 'string', format: 'uuid' },
                    response: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['text', 'analysis', 'action'] },
                        content: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': { description: 'Mensagem inválida ou malformada' }
        }
      }
    },
    '/api/notifications': {
      get: {
        tags: ['Notificações'],
        summary: 'Lista de notificações do usuário',
        description: 'Retorna notificações e lembretes de tarefas atrasadas ou prestes a vencer.',
        responses: {
          '200': {
            description: 'Lista de notificações ativas'
          }
        }
      }
    },
    '/api/notifications/read': {
      post: {
        tags: ['Notificações'],
        summary: 'Marcar notificações como lidas',
        description: 'Marca uma notificação por ID ou todas as notificações se o campo for omitido.',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid', nullable: true }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Notificações marcadas como lidas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', example: true } }
                }
              }
            }
          }
        }
      }
    },
    '/api/integrations/classroom/status': {
      get: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Status da conexão com o Google Classroom',
        responses: {
          '200': {
            description: 'Status do vínculo e escopos autorizados'
          }
        }
      }
    },
    '/api/integrations/classroom/connect': {
      post: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Iniciar fluxo de autorização OAuth 2.0',
        responses: {
          '200': {
            description: 'Retorna a URL de redirecionamento para o consentimento do Google'
          }
        }
      }
    },
    '/api/integrations/google/callback': {
      get: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Retorno do fluxo OAuth do Google',
        description: 'Recebe o código de autorização e o parâmetro de estado para vincular o Classroom à conta do usuário.',
        parameters: [
          { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', required: true, schema: { type: 'string' } }
        ],
        responses: {
          '303': { description: 'Redirecionamento para a página de integrações com o resultado' }
        }
      }
    },
    '/api/integrations/classroom/courses': {
      get: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Listar turmas do Google Classroom',
        responses: {
          '200': { description: 'Lista de turmas ativas' }
        }
      }
    },
    '/api/integrations/classroom/deliveries': {
      post: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Consultar atividades e entregas do Classroom',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },
        responses: {
          '200': { description: 'Lista de atividades com prazos e status de entrega' }
        }
      }
    },
    '/api/integrations/classroom/sync': {
      post: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Sincronizar turmas selecionadas do Classroom para o EduTrack',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['courseIds', 'revision'],
                properties: {
                  courseIds: { type: 'array', items: { type: 'string' } },
                  revision: { type: 'integer' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Atividades importadas com sucesso como tarefas acadêmicas' }
        }
      }
    },
    '/api/integrations/classroom/disconnect': {
      post: {
        tags: ['Integrações (Google Classroom)'],
        summary: 'Desconectar conta do Google Classroom',
        responses: {
          '200': { description: 'Tokens removidos com sucesso' }
        }
      }
    }
  }
};

export const swaggerHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EduTrack AI — Documentação da API (Swagger)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .header-bar {
      background: #1e293b;
      color: #f8fafc;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
    }
    .header-title {
      font-size: 1.25rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      background: #3b82f6;
      color: white;
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 9999px;
      font-weight: 600;
    }
    .header-link {
      color: #38bdf8;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .header-link:hover {
      text-decoration: underline;
    }
    #swagger-ui {
      background: #ffffff;
      margin: 20px auto;
      max-width: 1400px;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      padding: 20px;
    }
    .swagger-ui .topbar { display: none !important; }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">
      <span>📚 EduTrack AI</span>
      <span class="badge">Swagger UI Interativo</span>
    </div>
    <div>
      <a href="/" class="header-link">Ir para o App Principal →</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        docExpansion: "list",
        filter: true
      });
    };
  </script>
</body>
</html>`;
