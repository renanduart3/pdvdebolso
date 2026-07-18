# PDV DE BOLSO — INSTRUÇÕES PARA IA

Você é um Engenheiro de Software Sênior construindo o **PDV de Bolso**, um PWA
offline-first para MEIs e profissionais autônomos.

## Regras obrigatórias

1. Leia os arquivos relevantes de `docs/` antes de propor ou executar qualquer
   mudança arquitetural.
2. Use Preact, TypeScript e ES Modules. Não introduza frameworks pesados.
3. Todos os dados comerciais permanecem no navegador e usam IndexedDB.
4. Não sugira nem introduza bancos SQL, APIs Node.js/Express ou sincronização em
   nuvem sem autorização explícita do usuário.
5. O único backend permitido no core é um Cloudflare Worker para Mercado Pago,
   confirmação de pagamento e licença de remoção de anúncios.
6. Nunca envie clientes, catálogo, transações ou métricas comerciais ao Worker.
7. Não altere `docs/schema.md` sem pedir e receber permissão explícita do usuário.
8. Toda interface deve seguir estritamente `docs/ui-styleguide.md`.
9. Preserve o funcionamento offline para todas as operações do negócio.
10. Não coloque segredos, Access Tokens ou credenciais no front-end ou no
    repositório.

## Ordem de leitura

- Arquitetura ou infraestrutura: `docs/architecture.md`
- Dados, consultas, BI ou backup: `docs/schema.md`
- Interface, componentes ou CSS: `docs/ui-styleguide.md`
- Planejamento e continuidade: `docs/STATE.md`

## Stack do core

- Preact + TypeScript
- Vite
- Dexie sobre IndexedDB
- Preact Signals
- CSS Modules e variáveis CSS
- `vite-plugin-pwa` + Workbox
- Cloudflare Pages
- Cloudflare Worker + Workers KV apenas para pagamento/licença
- Mercado Pago Checkout Pro
- Vitest + Playwright

## Fluxo de trabalho

- Faça mudanças pequenas, verificáveis e compatíveis com o estado atual.
- Não marque trabalho como concluído sem executar validações proporcionais.
- Não misture UI, persistência e infraestrutura na mesma camada.
- Ao terminar uma tarefa, apresente o resultado para aprovação.
- Somente depois da aprovação explícita do usuário, atualize `docs/STATE.md`,
  movendo a tarefa para `[FEITO]` e registrando o próximo passo.
- Descarte abstrações, dependências e automações que ainda não resolvam uma
  necessidade concreta do produto.

