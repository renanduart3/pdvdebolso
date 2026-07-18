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
- CSS Modules no styleguide neo-brutalista
- Vitest
- `vite-plugin-pwa` + Workbox
- Cloudflare Pages
- Cloudflare Worker e Workers KV apenas para pagamento/licença

## Módulos atuais

- **Vender:** catálogo rápido, carrinho, PIX, dinheiro, cartão e fiado.
- **Fiado:** contas a receber, saldo derivado, baixa parcial e cobrança por
  WhatsApp.
- **Produtos e Serviços:** cadastro, ativação, desativação e estoque opcional.
- **Clientes:** cadastro, WhatsApp e anotações.
- **Configurações:** chave PIX e proteção do armazenamento local.

Produtos com estoque controlado têm a quantidade baixada atomicamente junto da
venda. Serviços não possuem estoque. Itens antigos são migrados como produtos
sem controle de estoque.

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

## Arquitetura e regras

- [Arquitetura](docs/architecture.md)
- [Schema de dados](docs/schema.md)
- [Styleguide de interface](docs/ui-styleguide.md)
- [Estado do projeto](docs/STATE.md)

Apagar os dados do site, trocar de dispositivo ou mudar a origem da aplicação
pode eliminar o banco local. Exportação, importação e lembrete quinzenal de
backup fazem parte da próxima etapa.

Os arquivos JavaScript antigos na raiz são um scaffold legado e ainda não estão
conectados ao aplicativo Preact em `src/`.
