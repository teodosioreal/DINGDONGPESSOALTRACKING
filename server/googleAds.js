/**
 * Integração com a API do Google Ads (REST) — versão single-user.
 *
 * Você cria seu próprio app OAuth no Google Cloud Console e usa seu próprio
 * developer token. O refresh token da conexão fica salvo na tabela `config`
 * (uma única conexão, é uso pessoal).
 *
 * A "conta de login" (login-customer-id / MCC) NÃO é fixa: ela é descoberta
 * dinamicamente a partir de qual conta você escolhe no painel — assim
 * funciona com qualquer MCC que o e-mail conectado tiver acesso, sem
 * precisar configurar nada fixo no .env.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig, setConfig, apagarConfig } from "./db.js";

const ESCOPO_ADS = "https://www.googleapis.com/auth/adwords";
const ESCOPO_DATA_MANAGER = "https://www.googleapis.com/auth/datamanager";
const ESCOPO_EMAIL = "openid email";
const ESCOPOS = `${ESCOPO_ADS} ${ESCOPO_DATA_MANAGER} ${ESCOPO_EMAIL}`;
const NOME_CONVERSAO = "LEADCONVERTIDO";

function versao() {
  return process.env.GOOGLE_ADS_API_VERSION ?? "v22";
}

function limpo(v) {
  return (v ?? "").trim().replace(/[\r\n\s]/g, "");
}

export function lerCredenciaisApp() {
  const clientId = limpo(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = limpo(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const developerToken = limpo(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const faltando = [
    !clientId && "GOOGLE_OAUTH_CLIENT_ID",
    !clientSecret && "GOOGLE_OAUTH_CLIENT_SECRET",
    !developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
  ].filter(Boolean);
  if (faltando.length > 0) {
    return { erro: `Configuração do Google Ads incompleta: ${faltando.join(", ")}.` };
  }
  return { clientId, clientSecret, developerToken };
}

export function urlDeRetorno() {
  const origem = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  return `${origem}/auth/callback/google-ads`;
}

function segredoEstado() {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.SESSION_SECRET ?? "dingdong";
}

function assinarEstado() {
  const corpo = `dingdong.${Date.now()}`;
  const assinatura = createHmac("sha256", segredoEstado()).update(corpo).digest("hex");
  return `${Buffer.from(corpo).toString("base64url")}.${assinatura}`;
}

export function estadoValido(estado) {
  const [dados, assinatura] = (estado || "").split(".");
  if (!dados || !assinatura) return false;
  const corpo = Buffer.from(dados, "base64url").toString();
  const esperado = createHmac("sha256", segredoEstado()).update(corpo).digest("hex");
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [, quando] = corpo.split(".");
  return Date.now() - Number(quando) <= 30 * 60 * 1000;
}

export function urlDeConsentimento() {
  const c = lerCredenciaisApp();
  if (c.erro) return { erro: c.erro };
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: urlDeRetorno(),
    response_type: "code",
    scope: ESCOPOS,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: assinarEstado(),
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}` };
}

export async function trocarCodigoPorToken(code) {
  const c = lerCredenciaisApp();
  if (c.erro) return { erro: c.erro };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: urlDeRetorno(),
      grant_type: "authorization_code",
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.refresh_token) {
    return { erro: d.error_description ?? d.error ?? "O Google não devolveu a autorização." };
  }
  return { refreshToken: d.refresh_token, accessToken: d.access_token ?? "" };
}

async function obterAccessToken(refreshToken) {
  const c = lerCredenciaisApp();
  if (c.erro) return { erro: c.erro };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) {
    return { erro: d.error_description ?? d.error ?? "Não foi possível renovar o acesso ao Google." };
  }
  return { token: d.access_token };
}

function cabecalhos(token, developerToken, loginCustomerId) {
  const h = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) h["login-customer-id"] = loginCustomerId;
  return h;
}

function limparId(v) {
  return (v || "").replace(/\D/g, "");
}

function mensagemAmigavel(bruto, status) {
  const t = bruto ?? "";
  if (/DEVELOPER_TOKEN_NOT_APPROVED|only.*test accounts/i.test(t)) {
    return "Seu developer token ainda só tem acesso a contas de teste. Solicite o acesso Básico no Google Ads.";
  }
  if (/CUSTOMER_NOT_FOUND|NOT_FOUND/i.test(t)) return "Conta do Google Ads não encontrada.";
  if (/redirect_uri_mismatch/i.test(t)) {
    return `O endereço de retorno não confere. Cadastre ${urlDeRetorno()} no Google Cloud Console.`;
  }
  if (/PERMISSION_DENIED|USER_PERMISSION_DENIED|caller does not have permission/i.test(t)) {
    return "Esse e-mail não tem permissão nessa conta do Google Ads (ou escolheu a conta errada dentro da MCC). Reconecte e escolha de novo.";
  }
  return t || `O Google respondeu com status ${status ?? "desconhecido"}.`;
}

/* ---------------------------------------------------------- conexão salva */

export function conexaoSalva() {
  return {
    refreshToken: getConfig("google_refresh_token"),
    email: getConfig("google_email"),
    customerId: getConfig("google_customer_id"),
    customerNome: getConfig("google_customer_nome"),
    loginCustomerId: getConfig("google_login_customer_id") || undefined,
  };
}

export function salvarConexao({ refreshToken, email }) {
  setConfig("google_refresh_token", refreshToken);
  if (email) setConfig("google_email", email);
}

/**
 * `loginCustomerId` é a MCC usada como "conta de login" pra essa conta —
 * só é necessária quando a conta escolhida está dentro de uma MCC.
 */
export function salvarContaEscolhida({ customerId, nome, loginCustomerId }) {
  setConfig("google_customer_id", limparId(customerId));
  setConfig("google_customer_nome", nome ?? "");
  const login = limparId(loginCustomerId ?? "");
  if (login) setConfig("google_login_customer_id", login);
  else apagarConfig("google_login_customer_id");
}

export function desconectarGoogle() {
  for (const chave of [
    "google_refresh_token",
    "google_email",
    "google_customer_id",
    "google_customer_nome",
    "google_login_customer_id",
  ]) {
    apagarConfig(chave);
  }
}

export async function emailDoAccessToken(token) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json().catch(() => ({}));
    return (d.email ?? "").toLowerCase();
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------- chamadas */

/**
 * Contas diretamente acessíveis ao e-mail conectado — pode incluir MCCs
 * (aparecem com `isManager: true`) e contas de anúncio avulsas.
 */
export async function listarContas() {
  const c = lerCredenciaisApp();
  if (c.erro) return { contas: [], erro: c.erro };
  const { refreshToken } = conexaoSalva();
  if (!refreshToken) return { contas: [], erro: "Conecte sua conta do Google primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { contas: [], erro: auth.erro };

  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers:listAccessibleCustomers`, {
    headers: cabecalhos(auth.token, c.developerToken),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { contas: [], erro: mensagemAmigavel(d.error?.message, res.status) };

  const ids = (d.resourceNames ?? []).map((r) => r.split("/")[1] ?? "").filter(Boolean);
  const contas = [];
  for (const id of ids) {
    const info = await infoDaConta(auth.token, c.developerToken, id);
    contas.push({ customerId: id, nome: info.nome || `Conta ${id}`, isManager: info.isManager });
  }
  return { contas };
}

async function infoDaConta(token, developerToken, customerId, loginCustomerId) {
  try {
    const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: cabecalhos(token, developerToken, loginCustomerId),
      body: JSON.stringify({ query: "SELECT customer.descriptive_name, customer.manager FROM customer LIMIT 1" }),
    });
    const d = await res.json().catch(() => ({}));
    const cliente = d.results?.[0]?.customer;
    return { nome: cliente?.descriptiveName ?? "", isManager: Boolean(cliente?.manager) };
  } catch {
    return { nome: "", isManager: false };
  }
}

/** Contas anunciantes (clientes) de dentro de uma MCC específica. */
export async function listarSubcontasDe(mccId) {
  const c = lerCredenciaisApp();
  if (c.erro) return { contas: [], erro: c.erro };
  const { refreshToken } = conexaoSalva();
  if (!refreshToken) return { contas: [], erro: "Conecte sua conta do Google primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { contas: [], erro: auth.erro };

  const id = limparId(mccId);
  if (!id) return { contas: [], erro: "MCC inválida." };

  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${id}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(auth.token, c.developerToken, id),
    body: JSON.stringify({
      query: `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager
              FROM customer_client
              WHERE customer_client.status = 'ENABLED' AND customer_client.level <= 1`,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { contas: [], erro: mensagemAmigavel(d.error?.message, res.status) };
  const contas = (d.results ?? [])
    .map((r) => ({
      customerId: limparId(r.customerClient?.id ?? ""),
      nome: r.customerClient?.descriptiveName || `Conta ${r.customerClient?.id ?? ""}`,
      isManager: Boolean(r.customerClient?.manager),
    }))
    // Não lista a própria MCC entre suas subcontas.
    .filter((x) => x.customerId && x.customerId !== id);
  return { contas };
}

export async function listarCampanhas() {
  const c = lerCredenciaisApp();
  if (c.erro) return { campanhas: [], erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva();
  if (!refreshToken) return { campanhas: [], erro: "Conecte sua conta do Google primeiro." };
  if (!customerId) return { campanhas: [], erro: "Escolha a conta do Google Ads primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { campanhas: [], erro: auth.erro };

  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(auth.token, c.developerToken, loginCustomerId),
    body: JSON.stringify({
      query: `SELECT campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.impressions
              FROM campaign WHERE segments.date DURING LAST_30_DAYS`,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { campanhas: [], erro: mensagemAmigavel(d.error?.message, res.status) };

  const campanhas = (d.results ?? []).map((r) => ({
    id: r.campaign?.id ?? "",
    nome: r.campaign?.name ?? "",
    status: r.campaign?.status ?? "",
    cliques: Number(r.metrics?.clicks ?? 0),
    impressoes: Number(r.metrics?.impressions ?? 0),
  }));
  return { campanhas };
}

async function acaoDeConversao(token, developerToken, customerId, loginCustomerId) {
  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(token, developerToken, loginCustomerId),
    body: JSON.stringify({
      query: `SELECT conversion_action.id, conversion_action.resource_name
              FROM conversion_action WHERE conversion_action.name = '${NOME_CONVERSAO}' LIMIT 1`,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { erro: mensagemAmigavel(d.error?.message, res.status) };
  const acao = d.results?.[0]?.conversionAction;
  if (!acao?.id) {
    return {
      erro: `Crie no Google Ads uma ação de conversão offline chamada "${NOME_CONVERSAO}" (importação de conversões offline) e tente de novo.`,
    };
  }
  return { acaoId: String(acao.id) };
}

/**
 * Envia uma conversão offline (venda) pelo clique (gclid) pra conta conectada.
 * Usa a Data Manager API (events:ingest) — não pede token de desenvolvedor
 * pra esta chamada específica, só para a busca da ação de conversão acima.
 */
export async function enviarConversaoGoogle({ gclid, valor, moeda = "BRL", quando }) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva();
  if (!refreshToken) return { ok: false, erro: "Conecte sua conta do Google primeiro." };
  if (!customerId) return { ok: false, erro: "Escolha a conta do Google Ads primeiro." };

  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const acao = await acaoDeConversao(auth.token, c.developerToken, customerId, loginCustomerId);
  if (!acao.acaoId) return { ok: false, erro: acao.erro };

  const data = quando ?? new Date();
  const destino = {
    reference: "leadconvertido",
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: customerId },
    productDestinationId: acao.acaoId,
  };
  if (loginCustomerId) destino.loginAccount = { accountType: "GOOGLE_ADS", accountId: loginCustomerId };
  const payload = {
    destinations: [destino],
    events: [
      {
        destinationReferences: ["leadconvertido"],
        adIdentifiers: { gclid },
        eventTimestamp: data.toISOString(),
        conversionValue: Number(valor) || 0,
        currency: moeda,
      },
    ],
  };

  const res = await fetch("https://datamanager.googleapis.com/v1/events:ingest", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = resposta.error;
    return { ok: false, erro: mensagemAmigavel(err?.message ?? err?.status, res.status) };
  }
  return { ok: true, resposta };
}
