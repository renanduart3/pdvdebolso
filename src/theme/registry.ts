export const temasAplicacao = [
  {
    id: "IMPACTO",
    nome: "IMPACTO",
    descricao: "Neo-brutalista, vibrante, com bordas e sombras marcantes."
  },
  {
    id: "CONFORTO",
    nome: "CONFORTO",
    descricao: "Cores suaves, bordas leves e leitura visual mais tranquila."
  }
] as const;

export type TemaAplicacao = (typeof temasAplicacao)[number]["id"];

export const TEMA_PADRAO: TemaAplicacao = "IMPACTO";

export function ehTemaAplicacao(valor: unknown): valor is TemaAplicacao {
  return temasAplicacao.some((tema) => tema.id === valor);
}
