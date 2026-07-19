const encoder = new TextEncoder();

function bytesParaHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function assinarHmacHex(
  conteudo: string,
  segredo: string
): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    encoder.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    encoder.encode(conteudo)
  );
  return bytesParaHex(new Uint8Array(assinatura));
}

export function comparacaoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice += 1) {
    diferenca |= a.charCodeAt(indice) ^ b.charCodeAt(indice);
  }
  return diferenca === 0;
}

export async function criarTokenLicenca(
  sessaoId: string,
  segredo: string
): Promise<string> {
  const assinatura = await assinarHmacHex(`licenca:${sessaoId}`, segredo);
  return `pdvb1.${sessaoId}.${assinatura}`;
}

export async function criarIdSessao(
  idempotencyKey: string,
  segredo: string
): Promise<string> {
  const hex = await assinarHmacHex(
    `checkout:${idempotencyKey}`,
    segredo
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

export async function extrairSessaoDoToken(
  token: string,
  segredo: string
): Promise<string | null> {
  const partes = token.trim().split(".");
  if (
    partes.length !== 3 ||
    partes[0] !== "pdvb1" ||
    !/^[0-9a-f-]{36}$/i.test(partes[1]) ||
    !/^[0-9a-f]{64}$/i.test(partes[2])
  ) {
    return null;
  }
  const esperada = await assinarHmacHex(`licenca:${partes[1]}`, segredo);
  return comparacaoConstante(esperada, partes[2].toLowerCase())
    ? partes[1]
    : null;
}
