# ESTADO DO PROJETO

Atualize este arquivo somente depois que o usuário aprovar explicitamente a
tarefa concluída.

## [FEITO]

- Nome e origem canônica definidos: `PDV de Bolso` e `pdvdebolso.com`.
- Stack do core definida: Preact, TypeScript, Vite, Dexie e Cloudflare.
- Estratégia definida: offline-first, dados locais, anúncios opcionais e
  pagamento simbólico para remoção.
- Estrutura base de contexto para IA aprovada: `AGENTS.md`, documentação e três
  skills locais especializadas.
- Etapa 1 aprovada: Preact + TypeScript + Vite, PWA, shell neo-brutalista,
  contratos e schema IndexedDB v1.
- Etapa 2 aprovada: catálogo, carrinho e venda paga por PIX, dinheiro ou cartão.
- Etapa 3 aprovada: clientes, venda fiada, pagamentos parciais, cobrança por
  WhatsApp, módulos separados de cadastro e schema v2 com produtos, serviços e
  estoque opcional.
- Etapa 4 aprovada: BI client-side, backup e restauração, alertas na barra
  superior, PDV compacto com busca e catálogo modal, desconto percentual,
  CRUDs completos, estoque configurável e fiado manual auditável no schema v3.
- Refinamento operacional aprovado: busca e checkout na primeira linha do PDV,
  carrinho em largura total com rolagem e paginação de dez itens, além de
  navegação móvel separada entre busca, carrinho e checkout.
- Sistema de temas aprovado: registro extensível, tema `IMPACTO` como padrão e
  tema `CONFORTO` persistido no IndexedDB e incluído no backup.
- Fundação client-side de monetização aprovada: contrato substituível de
  anúncios, slot que desaparece offline ou com licença, estado local de
  pagamento e licença sem anúncios.

## [EM PROGRESSO]

- Nenhuma etapa em execução. Aguardando o início da integração serverless.

## [PRÓXIMO]

- Etapa 6: implementar o Cloudflare Worker, Mercado Pago Checkout Pro, webhook
  assinado, idempotência, Workers KV e restauração da licença sem anúncios.
- Conectar um provedor real de anúncios com consentimento e política de
  privacidade, mantendo o PDV operacional quando o provedor falhar.
- Preparar e validar o primeiro deploy de produção no Cloudflare Pages.
