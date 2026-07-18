# SCHEMA DE DADOS — FONTE DA VERDADE

Este documento define as três entidades de domínio do PDV de Bolso.

> A IA está estritamente proibida de alterar este schema sem pedir e receber
> permissão explícita do usuário. Qualquer nova feature de negócio deve usar
> estas entidades.

Todos os identificadores são UUIDs. Datas são strings ISO 8601. Valores
monetários são inteiros em centavos.

## `clientes`

```ts
interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  anotacoes: string | null;
  data_cadastro: string;
}
```

Regras:

- `nome` é obrigatório e não pode conter apenas espaços.
- `telefone` deve ser normalizado para uso em links `wa.me`.
- Exclusão de cliente com histórico financeiro não pode apagar transações.

Índices: `nome`, `telefone`, `data_cadastro`.

## `catalogo`

```ts
interface ProdutoCatalogo {
  id: string;
  nome: string;
  preco_padrao_centavos: number;
  tipo: "PRODUTO" | "SERVICO";
  estoque_quantidade: number | null;
  ativo: boolean;
}
```

Regras:

- `nome` é obrigatório.
- `preco_padrao_centavos` é um inteiro maior ou igual a zero.
- `tipo` diferencia produtos físicos de serviços.
- `estoque_quantidade` é um inteiro maior ou igual a zero quando o produto usa
  controle de estoque e `null` quando o controle está desabilitado.
- Serviços devem sempre usar `estoque_quantidade: null`.
- Uma venda baixa atomicamente o estoque controlado e deve ser recusada quando
  a quantidade disponível for insuficiente.
- Itens com histórico nunca são apagados; são desativados com `ativo: false`.
- Alterar nome ou preço não altera itens gravados em transações anteriores.

Migração da versão 1:

- itens existentes recebem `tipo: "PRODUTO"`;
- itens existentes recebem `estoque_quantidade: null`;
- nenhuma transação histórica é alterada.

Índices: `nome`, `ativo`, `tipo`.

## `transacoes`

```ts
type TipoTransacao = "VENDA" | "PAGAMENTO_FIADO";
type StatusPagamento = "PAGO" | "FIADO" | "PARCIAL";
type MetodoPagamento = "PIX" | "DINHEIRO" | "CARTAO";

interface ItemTransacao {
  id_produto: string;
  nome_produto: string;
  quantidade: number;
  preco_unitario_centavos: number;
}

interface Transacao {
  id: string;
  data_hora: string;
  tipo: TipoTransacao;
  cliente_id: string | null;
  venda_id: string | null;
  data_vencimento: string | null;
  valor_total_centavos: number;
  status_pagamento: StatusPagamento;
  metodo_pagamento: MetodoPagamento | null;
  itens: ItemTransacao[];
}
```

Regras:

- Transações são um log imutável: não editar nem apagar lançamentos gravados.
- `cliente_id` é obrigatório em venda fiada e em pagamento de fiado.
- `venda_id` é `null` em uma venda e obrigatório em `PAGAMENTO_FIADO`.
- `data_vencimento` é exigida para venda fiada e `null` nos demais casos.
- `itens` é preenchido em `VENDA` e vazio em `PAGAMENTO_FIADO`.
- Nome e preço do item são snapshots do momento da venda.
- Quantidade deve ser positiva e preço deve ser um inteiro não negativo.
- Pagamentos parciais geram novas transações `PAGAMENTO_FIADO`.
- O saldo e o status atual de uma venda fiada são derivados da venda menos seus
  pagamentos relacionados. O campo `status_pagamento` registra a condição no
  momento do lançamento e não deve ser atualizado posteriormente.

Índices: `data_hora`, `tipo`, `cliente_id`, `venda_id`, `status_pagamento`,
`[cliente_id+data_hora]` e `[tipo+data_hora]`.

## Estado técnico

Preferências de UI, data do último backup, consentimento de anúncios e licença
não são entidades de negócio. Elas podem ser persistidas em uma área técnica do
IndexedDB, desde que:

- não alterem as três entidades acima;
- não recebam dados comerciais;
- sejam incluídas no backup apenas quando necessário;
- não sejam usadas para contornar uma mudança de schema de domínio.
