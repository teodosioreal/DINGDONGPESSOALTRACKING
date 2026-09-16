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
 *
 * Webhook inbound (messages.received) confirmado na documentação: o
 * telefone vem em data.from.jid (ex: "5511999999999@s.whatsapp.net"), o
 * texto em data.message, nome do remetente em data.from_name, e is_group /
 * fromMe como booleanos — ver normalizarPayloadInbound() abaixo.
 */
import { db } from "./db.js";

const BASE = (process.env.DAPI_BASE_URL ?? "https://api.d-api.cloud").replace(/\/$/, "");
const DAPI_ACCOUNT_API_KEY = process.env.DAPI_ACCOUNT_API_KEY ?? "";

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

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function statusConexao(empresaId) {
  const erro = faltaConfigurar(empresaId);
  if (erro) return { configurado: false, conectado: false, erro };
  const r = await consultarQr(empresaId);
  if (!r.ok) return { configurado: true, conectado: false, erro: "Não foi possível consultar o status da sessão." };
  return { configurado: true, conectado: r.dados?.status === "connected" };
}

const POLL_INTERVALO_MS = 5000;
const POLL_MAX_TENTATIVAS = 5; // ~25s esperando o QR novo depois do /connect

/**
 * Devolve o QR Code atual pra escanear. Se o código já tiver expirado,
 * chama /connect UMA VEZ pra gerar um novo e faz polling em /qr a cada 5s
 * até ele atualizar (conforme a documentação da D-API) antes de devolver —
 * assim o front, que também faz polling a cada 5s, não acaba disparando um
 * /connect novo a cada chamada e resetando o QR sem ele nunca estabilizar.
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

    for (let tentativa = 0; tentativa < POLL_MAX_TENTATIVAS; tentativa += 1) {
      await esperar(POLL_INTERVALO_MS);
      r = await consultarQr(empresaId);
      if (!r.ok) return { erro: "Não foi possível gerar um novo QR Code agora." };
      if (r.dados?.status === "connected" || !r.dados?.expired) break;
    }
  }

  if (r.dados?.status === "connected") return { conectado: true };
  return { imagemBase64: r.dados?.qrCodeImage, conectado: false };
}

/**
 * Cria a sessão da D-API automaticamente (nome baseado na empresa) e já
 * configura o webhook dela — assim não precisa mais entrar no painel da
 * D-API pra conectar um cliente novo. Confirmado no OpenAPI oficial:
 * POST /api/v1/sessions, autenticado com a MESMA chave de API da conta (o
 * schema declara um único ApiKeyAuth global pra toda a API, sem chave por
 * sessão) — por isso essa mesma chave é salva como "apiKey" da empresa.
 */
export async function criarSessaoAutomatica(empresa) {
  if (!DAPI_ACCOUNT_API_KEY) {
    return { erro: "Falta configurar DAPI_ACCOUNT_API_KEY no .env do servidor pra criar sessões automaticamente." };
  }
  const sessionId = `${slugificar(empresa.nome)}-${empresa.id}`;
  const webhookUrl = `${process.env.APP_PUBLIC_URL}/api/public/whatsapp/webhook?empresa=${empresa.id}&chave=${empresa.webhook_secret}`;

  const res = await fetch(`${BASE}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: DAPI_ACCOUNT_API_KEY },
    body: JSON.stringify({
      sessionId,
      type: "unofficial",
      webhookUrl,
      // O campo "webhookUrl" sozinho não ativa a entrega — a D-API exige
      // webhookConfig.enabled=true (confirmado no OpenAPI oficial), senão a
      // sessão fica criada com o webhook desligado por padrão.
      webhookConfig: {
        enabled: true,
        type: "single",
        events: {
          "messages.received": { enabled: true, webhookUrl },
        },
      },
      connectionMode: "qr",
      ignoreGroups: true,
      ignoreStatus: true,
      historySync: false,
    }),
  });
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    return { erro: corpo?.message ?? `Não foi possível criar a sessão na D-API (status ${res.status}).` };
  }

  salvarCredenciais(empresa.id, { sessionId, apiKey: DAPI_ACCOUNT_API_KEY });
  return { ok: true, sessionId };
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

/**
 * Normaliza o payload do webhook messages.received da D-API (confirmado na
 * documentação oficial). Outros eventos (connection.status, chats.upsert etc.)
 * chegam na mesma URL quando o modo é "single" — são ignorados aqui.
 */
export function normalizarPayloadInbound(bruto) {
  const cru = bruto ?? {};
  if (cru.event && cru.event !== "messages.received") {
    return { telefone: "", texto: "", deMim: false, grupo: false, nome: undefined };
  }
  const dado = typeof cru.data === "object" && cru.data ? cru.data : cru;
  const telefone = String(dado.from?.jid ?? "").split("@")[0].replace(/\D/g, "");
  const texto = String(dado.message ?? "");
  const deMim = dado.fromMe === true;
  const grupo = dado.is_group === true;
  const nome = dado.from_name ?? dado.from?.name ?? undefined;
  return { telefone, texto, deMim, grupo, nome };
}
