/**
 * Cliente da D-API para as instâncias de WhatsApp — multi-empresa.
 *
 * Cada empresa tem seu próprio Session ID + API Key (tabela
 * `whatsapp_conexoes`), configurados na tela WhatsApp daquela empresa.
 *
 * Endpoints confirmados na documentação oficial (docs.d-api.cloud):
 *  - GET /api/v1/sessions/{id}/qr       → status da sessão + QR Code atual
 *  - GET /api/v1/sessions/{id}/connect  → força reconexão (quando o QR expira)
 * Os demais (/pairing-code, /disconnect, /send-text) ainda são um chute
 * baseado no padrão da API — confirme na documentação se algo der 404.
 */
import { db } from "./db.js";

const BASE = (process.env.DAPI_BASE_URL ?? "https://api.d-api.cloud").replace(/\/$/, "");

export function credenciaisSalvas(empresaId) {
  const c = db.prepare("SELECT session_id, api_key FROM whatsapp_conexoes WHERE empresa_id = ?").get(empresaId);
  return { sessionId: c?.session_id ?? null, apiKey: c?.api_key ?? null };
}

export function credenciaisConfiguradas(empresaId) {
  const { sessionId, apiKey } = credenciaisSalvas(empresaId);
  return Boolean(sessionId && apiKey);
}

export function salvarCredenciais(empresaId, { sessionId, apiKey }) {
  db.prepare(
    `INSERT INTO whatsapp_conexoes (empresa_id, session_id, api_key) VALUES (?, ?, ?)
     ON CONFLICT(empresa_id) DO UPDATE SET session_id = excluded.session_id, api_key = excluded.api_key`,
  ).run(empresaId, String(sessionId ?? "").trim(), String(apiKey ?? "").trim());
}

export function limparCredenciais(empresaId) {
  db.prepare("DELETE FROM whatsapp_conexoes WHERE empresa_id = ?").run(empresaId);
}

function faltaConfigurar(empresaId) {
  if (!credenciaisConfiguradas(empresaId)) {
    return "Preencha o Session ID e a API Key da D-API na tela do WhatsApp desta empresa.";
  }
  return null;
}

async function chamar(empresaId, caminho, init) {
  const { sessionId, apiKey } = credenciaisSalvas(empresaId);
  const url = `${BASE}/api/v1/sessions/${sessionId}${caminho}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: apiKey, ...(init?.headers ?? {}) },
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, dados };
}

/** Consulta bruta ao endpoint /qr — é ele quem informa o status da sessão também. */
async function consultarQr(empresaId) {
  return chamar(empresaId, "/qr");
}

export async function statusConexao(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { configurado: false, conectado: false, erro };
  const r = await consultarQr(empresaId);
  if (!r.ok) return { configurado: true, conectado: false, erro: "Não foi possível consultar o status da sessão." };
  return { configurado: true, conectado: r.dados?.status === "connected" };
}

/**
 * Devolve o QR Code atual pra escanear. Se o código já tiver expirado,
 * chama /connect pra gerar um novo antes de devolver (conforme a
 * documentação da D-API).
 */
export async function gerarQrCode(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { erro };

  let r = await consultarQr(empresaId);
  if (!r.ok) return { erro: "Não foi possível consultar o QR Code agora." };

  if (r.dados?.status === "connected") return { conectado: true };

  if (r.dados?.expired) {
    const reconectar = await chamar(empresaId, "/connect");
    if (!reconectar.ok) return { erro: "Não foi possível reconectar a sessão agora." };
    r = await consultarQr(empresaId);
    if (!r.ok) return { erro: "Não foi possível gerar um novo QR Code agora." };
  }

  if (r.dados?.status === "connected") return { conectado: true };
  return { imagemBase64: r.dados?.qrCodeImage, conectado: false };
}

export async function gerarCodigoPareamento(empresaId, telefone) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  if (!numero) return { erro: "Informe o telefone com DDI (ex: 5511999999999)." };
  const r = await chamar(empresaId, "/pairing-code", { method: "POST", body: JSON.stringify({ phone: numero }) });
  if (!r.ok) return { erro: "Não foi possível gerar o código de pareamento agora." };
  return { codigo: r.dados?.code };
}

export async function desconectar(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { erro };
  const r = await chamar(empresaId, "/disconnect", { method: "POST" });
  return { ok: r.ok };
}

export async function enviarMensagem(empresaId, telefone, mensagem) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { ok: false, erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  const r = await chamar(empresaId, "/send-text", {
    method: "POST",
    body: JSON.stringify({ phone: numero, message: mensagem }),
  });
  if (!r.ok) return { ok: false, erro: "Falha ao enviar a mensagem." };
  return { ok: true };
}

/**
 * Confere o segredo do webhook público e devolve a empresa correspondente,
 * ou null se a empresa/chave não bater. A URL de cada empresa é:
 * /api/public/whatsapp/webhook?empresa=<id>&chave=<webhook_secret>
 */
export function empresaDoWebhook(req) {
  const empresaId = Number(req.query.empresa);
  const recebido = (req.query.chave ?? req.headers["x-dingdong-key"] ?? "").toString().trim();
  if (!empresaId || !recebido) return null;
  const empresa = db.prepare("SELECT * FROM empresas WHERE id = ?").get(empresaId);
  if (!empresa) return null;
  const esperado = empresa.webhook_secret;
  if (recebido.length !== esperado.length) return null;
  let dif = 0;
  for (let i = 0; i < esperado.length; i += 1) dif |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0 ? empresa : null;
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
