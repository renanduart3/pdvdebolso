export interface KvPutOptions {
  expirationTtl?: number;
}

export interface KvNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KvPutOptions): Promise<void>;
}

export interface WorkerEnv {
  LICENCAS: KvNamespace;
  APP_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  LICENSE_PRICE_BRL: string;
  MP_ACCESS_TOKEN: string;
  MP_WEBHOOK_SECRET: string;
  LICENSE_SIGNING_SECRET: string;
}

export type StatusSessao = "PENDENTE" | "APROVADA" | "RECUSADA";

export interface SessaoLicenca {
  versao: 1;
  id: string;
  status: StatusSessao;
  preference_id: string;
  payment_id: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface MercadoPagoPayment {
  id: number | string;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  metadata?: {
    license_session_id?: string;
  };
}
