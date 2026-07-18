---
name: cloudflare-payment-worker
description: Implementar e revisar a infraestrutura mínima do PDV de Bolso em Cloudflare Pages, Workers e KV, incluindo Mercado Pago Checkout Pro, criação de preferência, webhook assinado, confirmação, idempotência e licença para remover anúncios. Usar para deploy, Worker, wrangler, secrets, CORS, KV, pagamento ou restauração de licença.
---

# Negociador Cloudflare

1. Ler `AGENTS.md` e `docs/architecture.md` por completo.
2. Manter o Worker limitado a pagamento e licença.
3. Usar APIs compatíveis com o runtime Web Standards dos Workers.
4. Guardar credenciais somente em secrets do Wrangler.
5. Validar a assinatura do webhook e confirmar o pagamento na API do Mercado
   Pago antes de emitir licença.
6. Implementar idempotência, expiração, tratamento de erros e CORS restrito à
   origem de produção.
7. Minimizar leituras KV e usar polling com intervalo progressivo.
8. Testar com credenciais e eventos de teste antes de produção.

## Limites

- Não receber nem persistir clientes, catálogo, transações ou métricas do PDV.
- Não criar Express, servidor Node.js ou banco SQL.
- Não expor Access Token, secret de webhook ou chave privada no front-end.
- Não tornar operações offline dependentes do Worker.
- Não ampliar a infraestrutura sem uma necessidade concreta e aprovação.

