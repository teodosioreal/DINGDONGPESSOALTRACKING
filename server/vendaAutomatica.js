/**
 * Detecção de venda por palavras-chave (sem IA) — configurável por empresa.
 *
 * A empresa cadastra palavras/frases-gatilho (uma por linha ou separadas por
 * vírgula) em `empresas.palavras_chave`. Quando uma mensagem recebida bate
 * com alguma delas, tentamos extrair um valor em reais da própria mensagem;
 * se a empresa tiver "confirmar antes de enviar" desligado E um valor foi
 * encontrado, a venda é enviada automaticamente — senão fica marcada como
 * "venda provável" esperando confirmação manual.
 */

function normalizar(texto) {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function listaDePalavras(palavrasChave) {
  return (palavrasChave ?? "")
    .split(/[,\n]/)
    .map((p) => normalizar(p).trim())
    .filter(Boolean);
}

export function bateComPalavraChave(texto, palavrasChave) {
  const palavras = listaDePalavras(palavrasChave);
  if (palavras.length === 0) return false;
  const alvo = normalizar(texto);
  return palavras.some((p) => alvo.includes(p));
}

const REGEX_VALOR = /r\$\s*([\d.,]+)|([\d.,]+)\s*reais/i;

/** Extração aproximada de valor (formato brasileiro: ponto = milhar, vírgula = decimal). */
export function extrairValor(texto) {
  const m = REGEX_VALOR.exec(texto ?? "");
  if (!m) return null;
  const bruto = (m[1] ?? m[2] ?? "").trim();
  const numero = Number(bruto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** Avalia se a mensagem indica venda pras regras da empresa. */
export function avaliarMensagem(texto, empresa) {
  if (!bateComPalavraChave(texto, empresa.palavras_chave)) return { detectado: false };
  return { detectado: true, valor: extrairValor(texto) };
}
