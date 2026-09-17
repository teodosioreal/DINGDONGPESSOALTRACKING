/**
 * Cliente da nossa Evolution API (self-hosted) para as instâncias de
 * WhatsApp — multi-empresa.
 *
 * Cada empresa tem sua própria instância (tabela `whatsapp_conexoes`:
 * session_id = nome da instância na Evolution API, api_key = apikey usada
 * pra autenticar as chamadas dela), configuradas na tela WhatsApp daquela
 * empresa — manualmente ou pelo botão "Criar sessão automaticamente".
 *
 * Endpoints usados (Evolution API v2, autenticação via header `apikey`):
 *  - GET  /instance/connectionState/{name}      → status da conexão
 *  - GET  /instance/connect/{name}               → QR Code (campo base64)
 *  - GET  /instance/connect/{name}?number=...    → código de pareamento
 *  - DELETE /instance/logout/{name}              → desconecta a sessão
 *  - POST /message/sendText/{name}               → envia mensagem de texto
 *  - POST /instance/create                        → cria instância nova
 *  - POST /webhook/set/{name}                     → configura o webhook dela
 *
 * Webhook inbound (messages.upsert): o telefone vem em
 * data.key.remoteJid (ex: "5511999999999@s.whatsapp.net"), o texto em
 * data.message.conversation (ou extendedTextMessage.text/legendas de
 * mídia), nome do remetente em data.pushName, e data.key.fromMe indica se
 * fomos nós que mandamos — ver normalizarPayloadInbound() abaixo.
 */
import { db } from "./db.js";

const BASE = (process.env.EVOLUTION_API_URL ?? "https://api.evolutiondingdong.online").replace(/\/$/, "");
const EVOLUTION_ACCOUNT_API_KEY = process.env.EVOLUTION_API_KEY ?? "";

function slugificar(texto) {
  const limpo = String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return limpo || "empresa";
}

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
    return "Preencha o Instance Name e a API Key da Evolution API na tela do WhatsApp desta empresa.";
  }
  return null;
}

async function chamar(empresaId, caminho, init) {
  const { apiKey } = credenciaisSalvas(empresaId);
  const url = `${BASE}${caminho}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: apiKey, ...(init?.headers ?? {}) },
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, dados };
}

/** Consulta o status atual da conexão dessa instância. */
async function consultarStatus(empresaId, sessionId) {
  return chamar(empresaId, `/instance/connectionState/${encodeURIComponent(sessionId)}`);
}

export async function statusConexao(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { configurado: false, conectado: false, erro };
  const { sessionId } = credenciaisSalvas(empresaId);
  const r = await consultarStatus(empresaId, sessionId);
  if (!r.ok) return { configurado: true, conectado: false, erro: "Não foi possível consultar o status da sessão." };
  return { configurado: true, conectado: r.dados?.instance?.state === "open" };
}

/**
 * Devolve o QR Code atual pra escanear. A Evolution API já devolve o QR
 * pronto (campo base64, formato data URL) na própria chamada de connect —
 * sem precisar de polling separado.
 */
export async function gerarQrCode(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { erro };

  const { sessionId } = credenciaisSalvas(empresaId);
  const status = await consultarStatus(empresaId, sessionId);
  if (status.ok && status.dados?.instance?.state === "open") return { conectado: true };

  const r = await chamar(empresaId, `/instance/connect/${encodeURIComponent(sessionId)}`);
  if (!r.ok) return { erro: "Não foi possível gerar o QR Code agora." };
  if (r.dados?.instance?.state === "open") return { conectado: true };

  return { imagemBase64: r.dados?.base64 ?? null, conectado: false };
}

/**
 * Cria a instância na Evolution API automaticamente (nome baseado na
 * empresa) e já configura o webhook dela — assim não precisa mais entrar no
 * painel da Evolution API pra conectar um cliente novo.
 */
export async function criarSessaoAutomatica(empresa) {
  if (!EVOLUTION_ACCOUNT_API_KEY) {
    return { erro: "Falta configurar EVOLUTION_API_KEY no .env do servidor pra criar sessões automaticamente." };
  }
  const sessionId = `${slugificar(empresa.nome)}-${empresa.id}`;
  const webhookUrl = `${process.env.APP_PUBLIC_URL}/api/public/whatsapp/webhook?empresa=${empresa.id}&chave=${empresa.webhook_secret}`;

  const criar = await fetch(`${BASE}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_ACCOUNT_API_KEY },
    body: JSON.stringify({ instanceName: sessionId, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });
  if (!criar.ok) {
    const corpo = await criar.json().catch(() => ({}));
    const mensagem = Array.isArray(corpo?.response?.message) ? corpo.response.message[0] : corpo?.message;
    return { erro: mensagem ?? `Não foi possível criar a sessão na Evolution API (status ${criar.status}).` };
  }

  const webhook = await fetch(`${BASE}/webhook/set/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_ACCOUNT_API_KEY },
    body: JSON.stringify({
      webhook: { enabled: true, url: webhookUrl, byEvents: false, events: ["MESSAGES_UPSERT"] },
    }),
  });
  if (!webhook.ok) {
    salvarCredenciais(empresa.id, { sessionId, apiKey: EVOLUTION_ACCOUNT_API_KEY });
    return { erro: "Sessão criada, mas não foi possível configurar o webhook automaticamente. Gere o QR Code e tente reconectar depois." };
  }

  salvarCredenciais(empresa.id, { sessionId, apiKey: EVOLUTION_ACCOUNT_API_KEY });
  return { ok: true, sessionId };
}

export async function gerarCodigoPareamento(empresaId, telefone) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  if (!numero) return { erro: "Informe o telefone com DDI (ex: 5511999999999)." };
  const { sessionId } = credenciaisSalvas(empresaId);
  const r = await chamar(empresaId, `/instance/connect/${encodeURIComponent(sessionId)}?number=${numero}`);
  if (!r.ok) return { erro: "Não foi possível gerar o código de pareamento agora." };
  const codigo = r.dados?.pairingCode ?? r.dados?.code;
  if (!codigo) return { erro: "A Evolution API não devolveu um código de pareamento agora." };
  return { codigo };
}

export async function desconectar(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { erro };
  const { sessionId } = credenciaisSalvas(empresaId);
  const r = await chamar(empresaId, `/instance/logout/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  return { ok: r.ok };
}

export async function enviarMensagem(empresaId, telefone, mensagem) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { ok: false, erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  const { sessionId } = credenciaisSalvas(empresaId);
  const r = await chamar(empresaId, `/message/sendText/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    body: JSON.stringify({ number: numero, text: mensagem }),
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

/**
 * Normaliza o payload do webhook messages.upsert da Evolution API. Outros
 * eventos (connection.update, chats.upsert etc.) podem chegar na mesma URL
 * quando o webhook não está filtrado por evento — são ignorados aqui.
 */
export function normalizarPayloadInbound(bruto) {
  const cru = bruto ?? {};
  if (cru.event && cru.event !== "messages.upsert") {
    return { telefone: "", texto: "", deMim: false, grupo: false, nome: undefined };
  }
  const dado = typeof cru.data === "object" && cru.data ? cru.data : cru;
  const remoteJid = String(dado.key?.remoteJid ?? "");
  const grupo = remoteJid.endsWith("@g.us");
  const telefone = remoteJid.split("@")[0].replace(/\D/g, "");
  const msg = dado.message ?? {};
  const texto = String(
    msg.conversation ?? msg.extendedTextMessage?.text ?? msg.imageMessage?.caption ?? msg.videoMessage?.caption ?? "",
  );
  const deMim = dado.key?.fromMe === true;
  const nome = dado.pushName ?? undefined;
  return { telefone, texto, deMim, grupo, nome };
}
