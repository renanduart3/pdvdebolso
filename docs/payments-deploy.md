# PAGAMENTO E LICENÇA — OPERAÇÃO

Este documento descreve a implantação do único backend do PDV de Bolso. O
Worker processa apenas pagamento e licença; dados comerciais nunca são enviados.

## Contrato HTTP

- `GET /v1/saude`: confirma que o Worker está disponível.
- `POST /v1/licencas/checkout`: cria uma preferência de R$ 5,00. Exige
  `Idempotency-Key`.
- `GET /v1/licencas/sessoes/:id`: consulta o pagamento com polling progressivo.
- `POST /v1/licencas/restaurar`: valida um código de restauração.
- `POST /v1/webhooks/mercadopago`: recebe somente o evento `payment`.

O preço, a descrição e a referência da licença são definidos pelo Worker. O
front-end não envia valor, produto, cliente ou qualquer dado do negócio.

## Segredos obrigatórios

Configure-os como secrets do Worker, nunca como `vars` ou variáveis `VITE_*`:

- `MP_ACCESS_TOKEN`: Access Token privado do Mercado Pago.
- `MP_WEBHOOK_SECRET`: assinatura secreta exibida ao configurar o webhook.
- `LICENSE_SIGNING_SECRET`: segredo aleatório exclusivo para assinar licenças.

Para desenvolvimento local, copie `.dev.vars.example` para `.dev.vars`. O
arquivo real está ignorado pelo Git.

## Configuração do Mercado Pago

1. Crie ou selecione a aplicação Checkout Pro em **Suas integrações**.
2. Em **Webhooks**, cadastre:
   `https://SEU-WORKER/v1/webhooks/mercadopago`.
3. Ative somente o evento **Pagamentos**.
4. Copie a assinatura secreta para `MP_WEBHOOK_SECRET`.
5. Use as credenciais de teste no desenvolvimento e as produtivas somente
   depois de concluir os testes.

O Worker valida `x-signature`, `x-request-id` e a janela de tempo. Mesmo com
assinatura válida, ele consulta `GET /v1/payments/:id` e só libera a licença
quando status, valor, moeda e referência conferem.

Documentação oficial:

- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications

## Configuração da Cloudflare

O `wrangler.jsonc` define:

- Worker `pdv-de-bolso-pagamentos`;
- binding KV `LICENCAS`;
- origem canônica `https://pdvdebolso.com`;
- origens CORS permitidas;
- preço fixo `5.00`.

Comandos:

```bash
npm run worker:types
npm run worker:dev
npx --yes wrangler@4.112.0 secret put MP_ACCESS_TOKEN
npx --yes wrangler@4.112.0 secret put MP_WEBHOOK_SECRET
npx --yes wrangler@4.112.0 secret put LICENSE_SIGNING_SECRET
npm run worker:deploy
```

O Wrangler pode provisionar o namespace KV declarado sem `id` no primeiro
deploy. Confirme no painel que o binding se chama exatamente `LICENCAS`.

Documentação oficial:

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/

## Conectar o Cloudflare Pages

Configure no build de produção:

```text
VITE_PAYMENT_WORKER_URL=https://SEU-WORKER
```

Essa variável contém somente a URL pública. Tokens e assinaturas nunca recebem
o prefixo `VITE_`.

Depois de alterar a URL, gere novo build e deploy do Pages. Verifique:

1. criação do checkout;
2. retorno para `/?pagamento=sucesso`;
3. recebimento e assinatura do webhook;
4. ativação da licença;
5. desaparecimento do anúncio;
6. restauração do código em outro navegador;
7. operação normal do PDV offline.

## Limitações do KV

Workers KV possui consistência eventual. O processamento é idempotente e
sobrescreve o mesmo estado, portanto notificações repetidas não emitem licenças
distintas. A confirmação pode levar alguns segundos para aparecer no polling.
