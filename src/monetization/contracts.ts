export type PlanoAplicacao = "GRATUITO" | "PREMIUM";

export type UserSession = {
  email: string;
  plano: PlanoAplicacao;
  expira_em: string;
};

export type AuthState = {
  sessao: UserSession | null;
};

export type ProvedorAnuncios = "ADSENSE" | "NENHUM";
