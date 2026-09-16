/**
 * Cliente da D-API para a instância própria de WhatsApp.
 *
 * Diferente do Google Ads (que fica no .env), as credenciais da D-API são
 * configuradas dentro do próprio painel (tela WhatsApp) e ficam guardadas
 * na tabela `config` do SQLite — por isso as funções abaixo recebem/leem
 * do banco, não de variável de ambiente.
 *
 * Endpoints confirmados na documentação oficial (docs.d-api.cloud):
 *  - GET  /api/v1/sessions/{id}/qr       → status da sessão + QR Code atual
 *  - GET  /api/v1/sessions/{id}/connect  → força reconexão (chamar quando o QR expirou)
 * Os demais (/pairing-code, /disconnect, /send-text) ainda são um chute
 * baseado no padrão da API — confirme na documentação se algo der 404.
 */
import { getConfig, setConfig, apagarConfig } from "./db.js";

const BASE = (process.env.DAPI_BASE_URL ?? "https://api.d-api.cloud").replace(/\/$/, "");

export function credenciaisSalvas() {
  return {
    sessionId: getConfig("dapi_session_id"),
    apiKey: getConfig("dapi_api_key"),
  };
}

export function credenciaisConfiguradas() {
  const { sessionId, apiKey } = credenciaisSalvas();
  return Boolean(sessionId && apiKey);
}

export function salvarCredenciais({ sessionId, apiKey }) {
  setConfig("dapi_session_id", String(sessionId ?? "").trim());
  setConfig("dapi_api_key", String(apiKey ?? "").trim());
}

export function limparCredenciais() {
  apagarConfig("dapi_session_id");
  apagarConfig("dapi_api_key");
}

function faltaConfigurar() {
  if (!credenciaisConfiguradas()) {
    return "Preencha o Session ID e a API Key da D-API na tela do WhatsApp.";
  }
  return null;
}

async function chamar(caminho, init) {
  const { sessionId, apiKey } = credenciaisSalvas();
  const url = `${BASE}/api/v1/sessions/${sessionId}${caminho}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: apiKey, ...(init?.headers ?? {}) },
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, dados };
}

/** Consulta bruta ao endpoint /qr — é ele quem informa o status da sessão também. */
async function consultarQr() {
  const r = await chamar("/qr");
  return r;
}

export async function statusConexao() {
  const erro = faltaConfigurar();
  if (erro) return { configurado: false, conectado: false, erro };
  const r = await consultarQr();
  if (!r.ok) return { configurado: true, conectado: false, erro: "Não foi possível consultar o status da sessão." };
  return { configurado: true, conectado: r.dados?.status === "connected" };
}

/**
 * Devolve o QR Code atual pra escanear. Se o código já tiver expirado,
 * chama /connect pra gerar um novo antes de devolver (conforme a
 * documentação da D-API).
 */
export async function gerarQrCode() {
  const erro = faltaConfigurar();
  if (erro) return { erro };

  let r = await consultarQr();
  if (!r.ok) return { erro: "Não foi possível consultar o QR Code agora." };

  if (r.dados?.status === "connected") return { conectado: true };

  if (r.dados?.expired) {
    const reconectar = await chamar("/connect");
    if (!reconectar.ok) return { erro: "Não foi possível reconectar a sessão agora." };
    r = await consultarQr();
    if (!r.ok) return { erro: "Não foi possível gerar um novo QR Code agora." };
  }

  if (r.dados?.status === "connected") return { conectado: true };
  return { imagemBase64: r.dados?.qrCodeImage, conectado: false };
}

export async function gerarCodigoPareamento(telefone) {
  const erro = faltaConfigurar();
  if (erro) return { erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  if (!numero) return { erro: "Informe o telefone com DDI (ex: 5511999999999)." };
  const r = await chamar("/pairing-code", { method: "POST", body: JSON.stringify({ phone: numero }) });
  if (!r.ok) return { erro: "Não foi possível gerar o código de pareamento agora." };
  return { codigo: r.dados?.code };
}

export async function desconectar() {
  const erro = faltaConfigurar();
  if (erro) return { erro };
  const r = await chamar("/disconnect", { method: "POST" });
  return { ok: r.ok };
}

export async function enviarMensagem(telefone, mensagem) {
  const erro = faltaConfigurar();
  if (erro) return { ok: false, erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  const r = await chamar("/send-text", { method: "POST", body: JSON.stringify({ phone: numero, message: mensagem }) });
  if (!r.ok) return { ok: false, erro: "Falha ao enviar a mensagem." };
  return { ok: true };
}

/** Confere o segredo do webhook público (query ?chave= ou header x-dingdong-key). */
export function webhookAutorizado(req) {
  const esperado = (process.env.WHATSAPP_WEBHOOK_SECRET ?? "").trim();
  if (!esperado) return false;
  const recebido = (req.query.chave ?? req.headers["x-dingdong-key"] ?? "").toString().trim();
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i += 1) dif |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

/** Normaliza os formatos de payload mais comuns de webhook da D-API. */
export function normalizarPayloadInbound(bruto) {
  const cru = bruto ?? {};
  const dado = typeof cru.data === "object" && cru.data ? cru.data : cru;
  const chat = typeof dado.chat === "object" && dado.chat ? dado.chat : {};
  const telefone = String(dado.phone ?? dado.fromNumber ?? "").replace(/\D/g, "");
  const texto = String(dado.text?.message ?? dado.body ?? dado.message ?? "");
  const deMim = dado.fromMe === true || dado.flow === "outbound";
  const grupo = dado.isGroup === true || chat.type === "group" || String(dado.chatId ?? "").includes("@g.us");
  const nome = dado.senderName ?? dado.pushname ?? undefined;
  return { telefone, texto, deMim, grupo, nome };
}
