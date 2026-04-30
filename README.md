# WhatsDelsuc MVP

MVP de plataforma SaaS para:
- gerenciar instancias do WhatsApp;
- configurar auto-resposta com IA via prompt customizado;
- executar disparo em massa.
- autenticar usuarios com login/cadastro JWT.

## Stack

- Backend: Node.js + TypeScript + Fastify
- Banco: MongoDB
- IA: OpenAI SDK (`gpt-4o-mini`)
- Frontend: React + Tailwind CSS

## Estrutura de pastas

- `apps/backend/src/controllers`
- `apps/backend/src/services`
- `apps/backend/src/repositories`
- `apps/backend/src/routes`
- `apps/backend/src/lib`
- `apps/frontend/src/components`
- `apps/frontend/src/pages`
- `apps/frontend/src/hooks`
- `apps/frontend/src/services`

## Setup rapido

1. Copie `.env.example` para `.env` na raiz e preencha as chaves.
2. Suba backend e frontend em terminais separados:
   - `npm run dev:backend`
   - `npm run dev:frontend`

## Autenticacao (login/cadastro)

- Endpoint de cadastro: `POST /auth/signup`
  - payload: `name`, `email`, `password`
- Endpoint de login: `POST /auth/login`
  - payload: `email`, `password`
- O backend retorna `accessToken` (JWT) e o frontend salva para autenticar rotas privadas.

### Criacao automatica do token WhatsAppConnect no cadastro

No `signup`, o backend autentica no WhatsAppConnect com `WHATSAPP_CONNECT_EMAIL` e `WHATSAPP_CONNECT_PASSWORD` (`.env` do servidor). Configure `WHATSAPP_CONNECT_BASE_URL` sem `/api/v1`, por exemplo em producao `https://whatsapp-connect.tech`; o codigo chama `POST ${WHATSAPP_CONNECT_BASE_URL}/api/v1/auth/login` (ex.: [login em producao](https://whatsapp-connect.tech/api/v1/auth/login)) ou `.../register`, obtem o JWT de sessao e chama:

- `POST ${WHATSAPP_CONNECT_BASE_URL}/api/v1/tokens`
- Header: `Authorization: Bearer <jwt_sessao>`
- Body: `{ "name": "Integracao <email>" }`

O retorno (`id` e `key` com prefixo `otp_...`) e salvo no usuario para uso nas rotas de instancia.

## Webhook WhatsApp Connect

- Endpoint backend: `POST /webhooks/whatsapp`
- Para testes locais, exponha com Ngrok:
  - `ngrok http 3333`
- Configure a URL no painel do WhatsApp Connect:
  - `https://sua-url-ngrok.io/webhooks/whatsapp`

## Fluxo da auto-resposta

1. Webhook recebe evento `on-message`.
2. Controller valida se a mensagem e inbound.
3. Sistema busca `systemPrompt` da instancia no banco.
4. Chama OpenAI com:
   - `system`: prompt salvo pelo usuario
   - `user`: mensagem recebida do cliente
5. Envia resposta ao cliente em `POST /message/sendText`.
6. Persiste mensagens de entrada e saida no `ChatLog`.

## Fluxo para iniciar instancia com QR Code

1. Usuario autenticado cria instancia em `POST /instances`.
2. Backend usa token manual enviado ou `waApiToken` salvo no cadastro.
3. Usuario clica em iniciar e chama `POST /instances/:instanceId/start`.
4. Backend consulta WhatsApp Connect e retorna o QR Code para o frontend.
