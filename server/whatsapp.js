/**
 * Cliente da Z-API (ou compatível) para a instância própria de WhatsApp.
 *
 * Obs.: os nomes exatos de campo/rota da Z-API podem mudar com o tempo —
 * confira a documentação atual deles se algo aqui parar de bater
 * (https://developer.z-api.io). O objetivo deste arquivo é concentrar
 * TODA a integração num único lugar fácil de ajustar.
 */

function credenciais() {
  const base = (process.env.ZAPI_BASE_URL ?? "https://api.z-api.io").replace(/\/$/, "");
  const instanceId = process.env.ZAPI_INSTANCE_ID ?? "";
  const token = process.env.ZAPI_INSTANCE_TOKEN ?? "";
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";
  return { base, instanceId, token, clientToken };
}

function faltaConfigurar() {
  const { instanceId, token, clientToken } = credenciais();
  if (!instanceId || !token || !clientToken) {
    return "Configure ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN e ZAPI_CLIENT_TOKEN no .env.";
  }
  return null;
}

async function chamar(caminho, init) {
  const { base, instanceId, token, clientToken } = credenciais();
  const url = `${base}/instances/${instanceId}/token/${token}${caminho}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", "Client-Token": clientToken, ...(init?.headers ?? {}) },
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, dados };
}

export async function statusConexao() {
  const erro = faltaConfigurar();
  if (erro) return { conectado: false, erro };
  const r = await chamar("/status");
  if (!r.ok) return { conectado: false, erro: "Não foi possível consultar o status da instância." };
  return { conectado: Boolean(r.dados?.connected), numero: r.dados?.smartphoneConnected ? r.dados?.phone : undefined };
}

export async function gerarQrCode() {
  const erro = faltaConfigurar();
  if (erro) return { erro };
  const r = await chamar("/qr-code/image");
  if (!r.ok) return { erro: "Não foi possível gerar o QR Code agora." };
  // A Z-API devolve a imagem já em base64 no campo `value`.
  return { imagemBase64: r.dados?.value };
}

export async function gerarCodigoPareamento(telefone) {
  const erro = faltaConfigurar();
  if (erro) return { erro };
  const numero = (telefone ?? "").replace(/\D/g, "");
  if (!numero) return { erro: "Informe o telefone com DDI (ex: 5511999999999)." };
  const r = await chamar(`/phone-code/${numero}`);
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

/** Normaliza os formatos de payload mais comuns de webhook (Z-API/D-API). */
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
