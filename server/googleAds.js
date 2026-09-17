/**
 * Integração com a API do Google Ads (REST) — multi-empresa.
 *
 * O app OAuth (client id/secret) e o developer token são do SEU projeto no
 * Google Cloud e ficam no .env, compartilhados. Cada EMPRESA autoriza a
 * PRÓPRIA conta do Google Ads (refresh token, conta escolhida e MCC de
 * login, se houver, ficam guardados por empresa em `google_conexoes`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, buscarEmpresa } from "./db.js";

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

/** Assina o id da empresa no `state` do OAuth, pra saber qual empresa volta no callback. */
function assinarEstado(empresaId) {
  const corpo = `${empresaId}.${Date.now()}`;
  const assinatura = createHmac("sha256", segredoEstado()).update(corpo).digest("hex");
  return `${Buffer.from(corpo).toString("base64url")}.${assinatura}`;
}

export function lerEstado(estado) {
  const [dados, assinatura] = (estado || "").split(".");
  if (!dados || !assinatura) return { erro: "Retorno inválido do Google." };
  const corpo = Buffer.from(dados, "base64url").toString();
  const esperado = createHmac("sha256", segredoEstado()).update(corpo).digest("hex");
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { erro: "Retorno inválido do Google." };
  const [empresaId, quando] = corpo.split(".");
  if (!empresaId || Date.now() - Number(quando) > 30 * 60 * 1000) {
    return { erro: "O pedido de conexão expirou. Tente novamente." };
  }
  return { empresaId: Number(empresaId) };
}

export function urlDeConsentimento(empresaId) {
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
    state: assinarEstado(empresaId),
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

export function conexaoSalva(empresaId) {
  const c = db.prepare("SELECT * FROM google_conexoes WHERE empresa_id = ?").get(empresaId);
  return {
    refreshToken: c?.refresh_token ?? null,
    email: c?.email ?? null,
    customerId: c?.customer_id ?? null,
    customerNome: c?.customer_nome ?? null,
    loginCustomerId: c?.login_customer_id ?? undefined,
  };
}

/**
 * Como conexaoSalva(), mas confirma de verdade que o token ainda funciona
 * (tenta renovar o access token) em vez de só olhar se tem refresh_token
 * salvo no banco — assim a tela avisa se a conexão quebrou (token revogado
 * pelo usuário no Google, por exemplo) em vez de mostrar "conectado" à toa.
 */
export async function statusConexaoReal(empresaId) {
  const conexao = conexaoSalva(empresaId);
  if (!conexao.refreshToken) return { ...conexao, conectado: false };
  const c = lerCredenciaisApp();
  if (c.erro) return { ...conexao, conectado: false, erro: c.erro };
  const auth = await obterAccessToken(conexao.refreshToken);
  if (!auth.token) return { ...conexao, conectado: false, erro: auth.erro };
  return { ...conexao, conectado: true };
}

export function salvarConexao(empresaId, { refreshToken, email }) {
  db.prepare(
    `INSERT INTO google_conexoes (empresa_id, refresh_token, email) VALUES (?, ?, ?)
     ON CONFLICT(empresa_id) DO UPDATE SET refresh_token = excluded.refresh_token,
       email = COALESCE(excluded.email, google_conexoes.email)`,
  ).run(empresaId, refreshToken, email || null);
}

/** `loginCustomerId` é a MCC usada como "conta de login" — só necessária quando a conta é subconta de uma MCC. */
export function salvarContaEscolhida(empresaId, { customerId, nome, loginCustomerId }) {
  db.prepare(
    // Troca de conta zera as campanhas selecionadas — eram de outra conta, não fazem mais sentido aqui.
    `UPDATE google_conexoes
     SET customer_id = ?, customer_nome = ?, login_customer_id = ?, campanhas_selecionadas = NULL
     WHERE empresa_id = ?`,
  ).run(limparId(customerId), nome ?? null, limparId(loginCustomerId ?? "") || null, empresaId);
}

export function desconectarGoogle(empresaId) {
  db.prepare("DELETE FROM google_conexoes WHERE empresa_id = ?").run(empresaId);
}

/** Limpa só a conta escolhida (mantém o e-mail/refresh token conectado) — reabre a tela de escolher conta. */
export function limparContaEscolhida(empresaId) {
  db.prepare(
    `UPDATE google_conexoes
     SET customer_id = NULL, customer_nome = NULL, login_customer_id = NULL, campanhas_selecionadas = NULL
     WHERE empresa_id = ?`,
  ).run(empresaId);
}

/** IDs das campanhas que a empresa escolheu acompanhar — só essas aparecem nos insights do Painel. */
export function campanhasSelecionadasDe(empresaId) {
  const linha = db.prepare("SELECT campanhas_selecionadas FROM google_conexoes WHERE empresa_id = ?").get(empresaId);
  if (!linha?.campanhas_selecionadas) return [];
  try {
    return JSON.parse(linha.campanhas_selecionadas);
  } catch {
    return [];
  }
}

export function salvarCampanhasSelecionadas(empresaId, ids) {
  const lista = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
  db.prepare("UPDATE google_conexoes SET campanhas_selecionadas = ? WHERE empresa_id = ?").run(
    JSON.stringify(lista),
    empresaId,
  );
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
export async function listarContas(empresaId) {
  const c = lerCredenciaisApp();
  if (c.erro) return { contas: [], erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { contas: [], erro: "Conecte a conta do Google primeiro." };
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
    if (info.deletada) continue;
    contas.push({ customerId: id, nome: info.nome || `Conta ${id}`, isManager: info.isManager });
  }
  return { contas };
}

/** Contas CANCELED/CLOSED no Google Ads são contas apagadas/encerradas — não devem aparecer no app. */
async function infoDaConta(token, developerToken, customerId, loginCustomerId) {
  try {
    const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: cabecalhos(token, developerToken, loginCustomerId),
      body: JSON.stringify({
        query: "SELECT customer.descriptive_name, customer.manager, customer.status FROM customer LIMIT 1",
      }),
    });
    const d = await res.json().catch(() => ({}));
    const cliente = d.results?.[0]?.customer;
    const deletada = cliente?.status === "CANCELED" || cliente?.status === "CLOSED";
    return { nome: cliente?.descriptiveName ?? "", isManager: Boolean(cliente?.manager), deletada };
  } catch {
    return { nome: "", isManager: false, deletada: false };
  }
}

/** Contas anunciantes (clientes) de dentro de uma MCC específica. */
export async function listarSubcontasDe(empresaId, mccId) {
  const c = lerCredenciaisApp();
  if (c.erro) return { contas: [], erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { contas: [], erro: "Conecte a conta do Google primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { contas: [], erro: auth.erro };

  const id = limparId(mccId);
  if (!id) return { contas: [], erro: "MCC inválida." };

  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${id}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(auth.token, c.developerToken, id),
    body: JSON.stringify({
      // status = ENABLED tira contas canceladas/suspensas/encerradas; hidden = FALSE tira contas ocultas
      // (ex: contas de teste da própria MCC) — nenhuma das duas deve aparecer pra escolha no app.
      query: `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager
              FROM customer_client
              WHERE customer_client.status = 'ENABLED'
                AND customer_client.hidden = FALSE
                AND customer_client.level <= 1`,
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
    .filter((x) => x.customerId && x.customerId !== id);
  return { contas };
}

const PERIODOS_VALIDOS = {
  hoje: "TODAY",
  "7dias": "LAST_7_DAYS",
  "30dias": "LAST_30_DAYS",
  este_mes: "THIS_MONTH",
  mes_passado: "LAST_MONTH",
};

/** Traduz o período escolhido na tela pro macro de data do GAQL — cai em LAST_30_DAYS se vier algo inesperado. */
function macroPeriodo(periodo) {
  return PERIODOS_VALIDOS[periodo] ?? "LAST_30_DAYS";
}

export async function listarCampanhas(empresaId, periodo) {
  const c = lerCredenciaisApp();
  if (c.erro) return { campanhas: [], erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva(empresaId);
  if (!refreshToken) return { campanhas: [], erro: "Conecte a conta do Google primeiro." };
  if (!customerId) return { campanhas: [], erro: "Escolha a conta do Google Ads primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { campanhas: [], erro: auth.erro };

  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(auth.token, c.developerToken, loginCustomerId),
    body: JSON.stringify({
      query: `SELECT campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.impressions,
                metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion,
                metrics.invalid_clicks
              FROM campaign
              WHERE segments.date DURING ${macroPeriodo(periodo)} AND campaign.status != 'REMOVED'`,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { campanhas: [], erro: mensagemAmigavel(d.error?.message, res.status) };

  const selecionadas = new Set(campanhasSelecionadasDe(empresaId));
  const campanhas = (d.results ?? []).map((r) => ({
    id: r.campaign?.id ?? "",
    nome: r.campaign?.name ?? "",
    status: r.campaign?.status ?? "",
    cliques: Number(r.metrics?.clicks ?? 0),
    impressoes: Number(r.metrics?.impressions ?? 0),
    cpcMedio: Number(r.metrics?.averageCpc ?? 0) / 1_000_000,
    custo: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
    conversoes: Number(r.metrics?.conversions ?? 0),
    custoPorConversao: Number(r.metrics?.costPerConversion ?? 0) / 1_000_000,
    cliquesInvalidos: Number(r.metrics?.invalidClicks ?? 0),
    selecionada: selecionadas.has(String(r.campaign?.id ?? "")),
  }));
  return { campanhas };
}

/** Pausa ou reativa uma campanha direto pelo app. */
export async function definirStatusCampanha(empresaId, campanhaId, ativar) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva(empresaId);
  if (!refreshToken || !customerId) return { ok: false, erro: "Google Ads não conectado nesta empresa." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/campaigns:mutate`, {
    method: "POST",
    headers: cabecalhos(auth.token, c.developerToken, loginCustomerId),
    body: JSON.stringify({
      operations: [
        {
          updateMask: "status",
          update: {
            resourceName: `customers/${customerId}/campaigns/${campanhaId}`,
            status: ativar ? "ENABLED" : "PAUSED",
          },
        },
      ],
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, erro: mensagemAmigavel(d.error?.message, res.status) };
  return { ok: true };
}

/**
 * Soma cliques inválidos das campanhas que a empresa escolheu acompanhar,
 * pro card "Cliques Inválidos" do Painel. Se a empresa não selecionou
 * nenhuma campanha ainda, devolve zero sem erro (o Painel mostra um aviso
 * pedindo pra selecionar em vez de quebrar).
 */
export async function cliquesInvalidosDasSelecionadas(empresaId, periodo) {
  const selecionadas = campanhasSelecionadasDe(empresaId);
  if (selecionadas.length === 0) return { cliquesInvalidos: 0, semSelecao: true };

  const c = lerCredenciaisApp();
  if (c.erro) return { cliquesInvalidos: 0, erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva(empresaId);
  if (!refreshToken || !customerId) return { cliquesInvalidos: 0, erro: "Google Ads não conectado nesta empresa." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { cliquesInvalidos: 0, erro: auth.erro };

  const idsEmLista = selecionadas.map((id) => `'${id}'`).join(",");
  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(auth.token, c.developerToken, loginCustomerId),
    body: JSON.stringify({
      query: `SELECT metrics.invalid_clicks FROM campaign
              WHERE segments.date DURING ${macroPeriodo(periodo)} AND campaign.id IN (${idsEmLista})`,
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { cliquesInvalidos: 0, erro: mensagemAmigavel(d.error?.message, res.status) };

  const total = (d.results ?? []).reduce((soma, r) => soma + Number(r.metrics?.invalidClicks ?? 0), 0);
  return { cliquesInvalidos: total };
}

/**
 * IDs das campanhas da conta pra aplicar a exclusão de IP — o escopo é
 * escolhido pela empresa (tela Bloqueio de IP): "ativas" pega só campanhas
 * ENABLED; "todas" pega ENABLED + PAUSED (campanhas REMOVED de verdade são
 * ignoradas nos dois casos — não faz sentido excluir IP de campanha apagada).
 */
async function campanhasParaExclusao(token, developerToken, customerId, loginCustomerId, escopo) {
  const filtroStatus = escopo === "todas" ? "campaign.status IN ('ENABLED', 'PAUSED')" : "campaign.status = 'ENABLED'";
  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(token, developerToken, loginCustomerId),
    body: JSON.stringify({ query: `SELECT campaign.id FROM campaign WHERE ${filtroStatus}` }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { erro: mensagemAmigavel(d.error?.message, res.status) };
  return { ids: (d.results ?? []).map((r) => String(r.campaign?.id ?? "")).filter(Boolean) };
}

/**
 * Exclui um IP das campanhas do Google Ads da empresa (todas, ou só as
 * ativas — a empresa escolhe em Bloqueio de IP) — é o mecanismo de "clique
 * suspeito" (bloqueio de IP), totalmente separado do envio de conversão de
 * venda: um IP bloqueado passa a não ver/gastar clique nos seus anúncios,
 * mas isso não tem nada a ver com se uma venda específica é enviada ou não
 * pro Google Ads.
 *
 * Devolve os resourceNames dos critérios criados, pra poder remover se a
 * empresa desbloquear o IP depois. Best-effort: se a empresa ainda não
 * conectou o Google Ads, devolve erro sem quebrar o bloqueio local do IP.
 */
export async function excluirIpDasCampanhas(empresaId, ip) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva(empresaId);
  if (!refreshToken || !customerId) return { ok: false, erro: "Google Ads não conectado nesta empresa." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const escopo = buscarEmpresa(empresaId)?.bloqueio_auto_escopo === "todas" ? "todas" : "ativas";
  const campanhas = await campanhasParaExclusao(auth.token, c.developerToken, customerId, loginCustomerId, escopo);
  if (campanhas.erro) return { ok: false, erro: campanhas.erro };
  if (campanhas.ids.length === 0) return { ok: true, resourceNames: [] };

  const operations = campanhas.ids.map((id) => ({
    create: {
      campaign: `customers/${customerId}/campaigns/${id}`,
      negative: true,
      ipBlock: { ipAddress: ip },
    },
  }));

  const res = await fetch(
    `https://googleads.googleapis.com/${versao()}/customers/${customerId}/campaignCriteria:mutate`,
    {
      method: "POST",
      headers: cabecalhos(auth.token, c.developerToken, loginCustomerId),
      body: JSON.stringify({ operations, partialFailure: true }),
    },
  );
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, erro: mensagemAmigavel(d.error?.message, res.status) };

  const resourceNames = (d.results ?? []).map((r) => r.resourceName).filter(Boolean);
  const avisoParcial = d.partialFailureError ? mensagemAmigavel(d.partialFailureError.message, res.status) : null;
  return { ok: true, resourceNames, aviso: avisoParcial };
}

/** Remove exclusões de IP criadas anteriormente pelas campanhas (desbloqueio). */
export async function removerExclusaoIp(empresaId, resourceNames) {
  if (!resourceNames || resourceNames.length === 0) return { ok: true };
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva(empresaId);
  if (!refreshToken || !customerId) return { ok: false, erro: "Google Ads não conectado nesta empresa." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const operations = resourceNames.map((resourceName) => ({ remove: resourceName }));
  const res = await fetch(
    `https://googleads.googleapis.com/${versao()}/customers/${customerId}/campaignCriteria:mutate`,
    {
      method: "POST",
      headers: cabecalhos(auth.token, c.developerToken, loginCustomerId),
      body: JSON.stringify({ operations, partialFailure: true }),
    },
  );
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, erro: mensagemAmigavel(d.error?.message, res.status) };
  return { ok: true };
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
 * Envia uma conversão offline (venda) pelo clique (gclid) pra conta conectada da empresa.
 * Usa a Data Manager API (events:ingest) — não pede token de desenvolvedor
 * pra esta chamada específica, só para a busca da ação de conversão acima.
 */
export async function enviarConversaoGoogle(empresaId, { gclid, valor, moeda = "BRL", quando }) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken, customerId, loginCustomerId } = conexaoSalva(empresaId);
  if (!refreshToken) return { ok: false, erro: "Conecte a conta do Google primeiro." };
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
