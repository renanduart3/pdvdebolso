# PDV DE BOLSO

PWA offline-first para MEIs e profissionais autônomos. O sistema funciona no
navegador, mantém os dados comerciais no IndexedDB do dispositivo e será
publicado no Cloudflare Pages em `pdvdebolso.com`.

## Princípios

- Operação rápida: o PDV serve para vender, sem formulários de cadastro.
- Cadastros separados: Produtos e Serviços, Clientes e Configurações possuem
  módulos próprios.
- Propriedade dos dados: clientes, catálogo e transações não saem do aparelho.
- Offline-first: vendas pagas, fiado, pagamentos e consultas funcionam sem rede.
- Histórico financeiro imutável: correções e baixas geram novos lançamentos.
- Monetização leve: anúncios online e remoção mediante pagamento simbólico,
  sem bloquear o uso do sistema.

## Stack

- Preact + TypeScript + Vite
- Dexie sobre IndexedDB
- CSS Modules com temas Impacto (neo-brutalista) e Conforto
- Vitest
- `vite-plugin-pwa` + Workbox
- Cloudflare Pages
- Cloudflare Worker e Workers KV apenas para pagamento/licença

## Módulos atuais

- **Vender:** busca por início do nome e checkout na primeira linha, catálogo
  paginado em modal e carrinho em largura total com paginação de dez itens,
  desconto percentual, confirmação e finalização explícita por PIX, dinheiro,
  cartão ou fiado.
- **Cadastros:** produtos, serviços e clientes em listas pesquisáveis e
  paginadas diretamente no IndexedDB, com edição e exclusão confirmada.
- **Fiado:** lançamento por itens ou valor avulso, contas a receber, correção
  auditável, baixa parcial, exclusão confirmada e cobrança por WhatsApp.
- **Produtos e Serviços:** estoque numérico para produtos e ausência de estoque
  para serviços; itens com histórico são arquivados ao serem excluídos.
- **Clientes:** telefone, indicador de WhatsApp, e-mail, anotações e atalho
  `wa.me`; clientes com histórico também são arquivados ao serem excluídos.
- **Configurações:** chave PIX, validação opcional de estoque, proteção do
  armazenamento local e escolha de tema persistida no backup.
- **Barra superior:** totais de produtos e clientes, faturamento do dia e do
  mês, último backup, ocultação de valores e central de notificações.
- **Inteligência:** caixa, métodos de pagamento, horários de pico, mapa
  semanal, produtos campeões, burn rate e saúde do fiado.
- **Backup:** exportação JSON, importação validada, restauração atômica e
  lembrete a cada 14 dias.

Produtos têm a quantidade baixada atomicamente junto da venda. A configuração
de validação decide se estoque insuficiente bloqueia a operação; quando ela está
desligada, o saldo pode ficar negativo. Serviços não possuem estoque.

O banco atual usa o schema v3. Backups antigos do schema v2 são migrados na
importação, preservando clientes, catálogo e histórico financeiro.

## Desenvolvimento

```bash
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm test
npm run build
```

O diretório de publicação no Cloudflare Pages é `dist`.

Worker de pagamento e licença:

```bash
npm run worker:types
npm run worker:dev
npm run worker:deploy
```

Copie `.env.example` para `.env.local` para apontar o PWA ao Worker local. Os
segredos do Mercado Pago e da licença ficam em `.dev.vars` no desenvolvimento e
em secrets da Cloudflare na produção. Consulte
[Pagamento e licença](docs/payments-deploy.md).

## Arquitetura e regras

- [Arquitetura](docs/architecture.md)
- [Schema de dados](docs/schema.md)
- [Styleguide de interface](docs/ui-styleguide.md)
- [Estado do projeto](docs/STATE.md)

Apagar os dados do site, trocar de dispositivo ou mudar a origem da aplicação
pode eliminar o banco local. Use o backup em Configurações pelo menos a cada
14 dias.

Os arquivos JavaScript antigos na raiz são um scaffold legado e ainda não estão
conectados ao aplicativo Preact em `src/`.
