export type TipoTransacao =
  | "VENDA"
  | "PAGAMENTO_FIADO"
  | "CANCELAMENTO_VENDA";
export type StatusPagamento = "PAGO" | "FIADO" | "PARCIAL" | "CANCELADO";
export type MetodoPagamento = "PIX" | "DINHEIRO" | "CARTAO";
export type TipoItemCatalogo = "PRODUTO" | "SERVICO";

export interface Cliente {
  id: string;
  nome: string;
  telefone: string | null;
  telefone_whatsapp: boolean;
  email: string | null;
  anotacoes: string | null;
  data_cadastro: string;
  ativo: boolean;
}

export interface ProdutoCatalogo {
  id: string;
  nome: string;
  preco_padrao_centavos: number;
  tipo: TipoItemCatalogo;
  estoque_quantidade: number | null;
  ativo: boolean;
}

export interface ItemTransacao {
  id_produto: string | null;
  nome_produto: string;
  quantidade: number;
  preco_unitario_centavos: number;
}

export interface Transacao {
  id: string;
  data_hora: string;
  tipo: TipoTransacao;
  cliente_id: string | null;
  venda_id: string | null;
  data_vencimento: string | null;
  valor_total_centavos: number;
  status_pagamento: StatusPagamento;
  metodo_pagamento: MetodoPagamento | null;
  descricao: string | null;
  itens: ItemTransacao[];
}

export interface ConfiguracaoTecnica {
  chave: string;
  valor: unknown;
}
