/**
 * Cliente da D-API para a instância própria de WhatsApp.
 *
 * Diferente do Google Ads (que fica no .env), as credenciais da D-API são
 * configuradas dentro do próprio painel (tela WhatsApp) e ficam guardadas
 * na tabela `config` do SQLite — por isso as funções abaixo recebem/leem
 * do banco, não de variável de ambiente.
 *
 * IMPORTANTE: os caminhos exatos abaixo (/qrcode, /pairing-code, /send-text…)
 * seguem o padrão que a D-API usa para a API administrativa de criação de
 * sessão (`/api/v1/sessions`), mas eu não tenho a documentação completa dos
 * endpoints de uso da sessão (status, enviar mensagem, etc.) — confirme cada
 * um no painel/documentação da D-API antes de confiar 100% neles. Se algo
 * devolver 404, é sinal de que o caminho mudou e é só ajustar aqui.
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

export async function statusConexao() {
  const erro = faltaConfigurar();
  if (erro) return { configurado: false, conectado: false, erro };
  const r = await chamar("/status");
  if (!r.ok) return { configurado: true, conectado: false, erro: "Não foi possível consultar o status da sessão." };
  return {
    configurado: true,
    conectado: Boolean(r.dados?.connected ?? r.dados?.status === "connected"),
    numero: r.dados?.phone,
  };
}

export async function gerarQrCode() {
  const erro = faltaConfigurar();
  if (erro) return { erro };
  const r = await chamar("/qrcode");
  if (!r.ok) return { erro: "Não foi possível gerar o QR Code agora." };
  return { imagemBase64: r.dados?.qrcode ?? r.dados?.value ?? r.dados?.image };
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
