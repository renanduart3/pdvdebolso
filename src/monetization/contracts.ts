export type PlanoAplicacao = "GRATUITO" | "SEM_ANUNCIOS";

export interface LicencaLocal {
  versao: 1;
  token_restauracao: string;
  ativada_em: string;
  verificada_em: string;
}

export interface PagamentoLicencaPendente {
  versao: 1;
  sessao_id: string;
  criado_em: string;
}

export interface EstadoLicenca {
  plano: PlanoAplicacao;
  licenca: LicencaLocal | null;
  pagamento_pendente: PagamentoLicencaPendente | null;
}

export type PosicaoAnuncio = "BARRA_LATERAL";

export interface ProvedorAnuncios {
  readonly id: string;
  montar(
    elemento: HTMLElement,
    posicao: PosicaoAnuncio
  ): void | (() => void);
}
