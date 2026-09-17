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
export const NOME_CONVERSAO = "LEADCONVERTIDO";

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

export function desconectarGoogle(empresaId) {
  db.prepare("DELETE FROM google_conexoes WHERE empresa_id = ?").run(empresaId);
  db.prepare("DELETE FROM google_contas_selecionadas WHERE empresa_id = ?").run(empresaId);
}

/** Contas do Google Ads que a empresa escolheu monitorar — podem ser várias. */
export function contasSelecionadasDe(empresaId) {
  return db
    .prepare(
      "SELECT customer_id, customer_nome, login_customer_id FROM google_contas_selecionadas WHERE empresa_id = ? ORDER BY criado_em ASC",
    )
    .all(empresaId)
    .map((r) => ({ customerId: r.customer_id, nome: r.customer_nome, loginCustomerId: r.login_customer_id }));
}

/** `loginCustomerId` é a MCC usada como "conta de login" — só necessária quando a conta é subconta de uma MCC. */
export function adicionarContaSelecionada(empresaId, { customerId, nome, loginCustomerId }) {
  db.prepare(
    `INSERT INTO google_contas_selecionadas (empresa_id, customer_id, customer_nome, login_customer_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(empresa_id, customer_id) DO UPDATE SET
       customer_nome = excluded.customer_nome, login_customer_id = excluded.login_customer_id`,
  ).run(empresaId, limparId(customerId), nome ?? null, limparId(loginCustomerId ?? "") || null);
}

/** Remove uma conta da lista de monitoradas — as campanhas dela somem dos insights e da tabela. */
export function removerContaSelecionada(empresaId, customerId) {
  db.prepare("DELETE FROM google_contas_selecionadas WHERE empresa_id = ? AND customer_id = ?").run(
    empresaId,
    limparId(customerId),
  );
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
    // Nunca usa o número como "nome" — o número já aparece separado, entre parênteses, no front.
    contas.push({ customerId: id, nome: info.nome || "Conta sem nome cadastrado", isManager: info.isManager });
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
      // Nunca usa o número como "nome" — o número já aparece separado, entre parênteses, no front.
      nome: r.customerClient?.descriptiveName || "Conta sem nome cadastrado",
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

/**
 * Campanhas de TODAS as contas que a empresa escolheu monitorar, agregadas
 * numa lista só — cada campanha carrega de qual conta ela é (`customerId`/
 * `customerNome`), já que o mesmo id de campanha pode existir em contas
 * diferentes. Se uma conta falhar (token revogado, sem permissão etc.) as
 * outras continuam aparecendo — o erro dela vem em `avisos`.
 */
export async function listarCampanhas(empresaId, periodo) {
  const c = lerCredenciaisApp();
  if (c.erro) return { campanhas: [], erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { campanhas: [], erro: "Conecte a conta do Google primeiro." };
  const contas = contasSelecionadasDe(empresaId);
  if (contas.length === 0) return { campanhas: [], erro: "Selecione ao menos uma conta do Google Ads primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { campanhas: [], erro: auth.erro };

  const selecionadas = new Set(campanhasSelecionadasDe(empresaId));
  const campanhas = [];
  const avisos = [];

  for (const conta of contas) {
    const res = await fetch(
      `https://googleads.googleapis.com/${versao()}/customers/${conta.customerId}/googleAds:search`,
      {
        method: "POST",
        headers: cabecalhos(auth.token, c.developerToken, conta.loginCustomerId),
        body: JSON.stringify({
          query: `SELECT campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.impressions,
                    metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion,
                    metrics.invalid_clicks
                  FROM campaign
                  WHERE segments.date DURING ${macroPeriodo(periodo)} AND campaign.status != 'REMOVED'`,
        }),
      },
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      avisos.push(`${conta.nome || conta.customerId}: ${mensagemAmigavel(d.error?.message, res.status)}`);
      continue;
    }
    for (const r of d.results ?? []) {
      const campanhaId = String(r.campaign?.id ?? "");
      campanhas.push({
        id: campanhaId,
        chave: `${conta.customerId}:${campanhaId}`,
        customerId: conta.customerId,
        customerNome: conta.nome,
        nome: r.campaign?.name ?? "",
        status: r.campaign?.status ?? "",
        cliques: Number(r.metrics?.clicks ?? 0),
        impressoes: Number(r.metrics?.impressions ?? 0),
        cpcMedio: Number(r.metrics?.averageCpc ?? 0) / 1_000_000,
        custo: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
        conversoes: Number(r.metrics?.conversions ?? 0),
        custoPorConversao: Number(r.metrics?.costPerConversion ?? 0) / 1_000_000,
        cliquesInvalidos: Number(r.metrics?.invalidClicks ?? 0),
        selecionada: selecionadas.has(`${conta.customerId}:${campanhaId}`),
      });
    }
  }
  return { campanhas, avisos: avisos.length ? avisos : null };
}

/** Pausa ou reativa uma campanha direto pelo app. */
export async function definirStatusCampanha(empresaId, customerId, campanhaId, ativar) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { ok: false, erro: "Google Ads não conectado nesta empresa." };
  const conta = contasSelecionadasDe(empresaId).find((x) => x.customerId === limparId(customerId));
  if (!conta) return { ok: false, erro: "Essa conta não está mais entre as monitoradas." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const res = await fetch(
    `https://googleads.googleapis.com/${versao()}/customers/${conta.customerId}/campaigns:mutate`,
    {
      method: "POST",
      headers: cabecalhos(auth.token, c.developerToken, conta.loginCustomerId),
      body: JSON.stringify({
        operations: [
          {
            updateMask: "status",
            update: {
              resourceName: `customers/${conta.customerId}/campaigns/${campanhaId}`,
              status: ativar ? "ENABLED" : "PAUSED",
            },
          },
        ],
      }),
    },
  );
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, erro: mensagemAmigavel(d.error?.message, res.status) };
  return { ok: true };
}

/**
 * Cliques inválidos + quanto isso "economizou" (o Google não cobra clique
 * inválido — a economia estimada é cliques inválidos × CPC médio da mesma
 * campanha) nas campanhas que a empresa escolheu acompanhar, somando todas
 * as contas monitoradas. Usado no card "Cliques Inválidos" do Painel e no
 * "Você economizou" do Bloqueio de IP. Sem nenhuma campanha selecionada,
 * devolve zero sem erro (a tela mostra um aviso pedindo pra selecionar).
 */
export async function metricasCampanhasSelecionadas(empresaId, periodo) {
  const selecionadas = campanhasSelecionadasDe(empresaId);
  if (selecionadas.length === 0) return { cliquesInvalidos: 0, economia: 0, semSelecao: true };

  const c = lerCredenciaisApp();
  if (c.erro) return { cliquesInvalidos: 0, economia: 0, erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { cliquesInvalidos: 0, economia: 0, erro: "Google Ads não conectado nesta empresa." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { cliquesInvalidos: 0, economia: 0, erro: auth.erro };

  // Agrupa as campanhas selecionadas (formato "customerId:campanhaId") por conta.
  const porConta = new Map();
  for (const chave of selecionadas) {
    const [customerId, campanhaId] = String(chave).split(":");
    if (!customerId || !campanhaId) continue;
    if (!porConta.has(customerId)) porConta.set(customerId, []);
    porConta.get(customerId).push(campanhaId);
  }
  if (porConta.size === 0) return { cliquesInvalidos: 0, economia: 0, semSelecao: true };

  const contas = contasSelecionadasDe(empresaId);
  let cliquesInvalidos = 0;
  let economia = 0;
  const avisos = [];

  for (const [customerId, idsCampanhas] of porConta) {
    const conta = contas.find((x) => x.customerId === customerId);
    if (!conta) continue; // conta foi removida das monitoradas — ignora
    const idsEmLista = idsCampanhas.map((id) => `'${id}'`).join(",");
    const res = await fetch(
      `https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: cabecalhos(auth.token, c.developerToken, conta.loginCustomerId),
        body: JSON.stringify({
          query: `SELECT metrics.invalid_clicks, metrics.average_cpc FROM campaign
                  WHERE segments.date DURING ${macroPeriodo(periodo)} AND campaign.id IN (${idsEmLista})`,
        }),
      },
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      avisos.push(`${conta.nome || customerId}: ${mensagemAmigavel(d.error?.message, res.status)}`);
      continue;
    }
    for (const r of d.results ?? []) {
      const invalidos = Number(r.metrics?.invalidClicks ?? 0);
      const cpc = Number(r.metrics?.averageCpc ?? 0) / 1_000_000;
      cliquesInvalidos += invalidos;
      economia += invalidos * cpc;
    }
  }
  return { cliquesInvalidos, economia, erro: avisos.length ? avisos.join("; ") : null };
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
 * Exclui um IP das campanhas do Google Ads de TODAS as contas monitoradas
 * pela empresa (todas as campanhas, ou só as ativas — a empresa escolhe em
 * Bloqueio de IP) — é o mecanismo de "clique suspeito" (bloqueio de IP),
 * totalmente separado do envio de conversão de venda: um IP bloqueado passa
 * a não ver/gastar clique nos seus anúncios, mas isso não tem nada a ver
 * com se uma venda específica é enviada ou não pro Google Ads.
 *
 * Devolve os resourceNames dos critérios criados, pra poder remover se a
 * empresa desbloquear o IP depois. Best-effort: se uma conta falhar (sem
 * permissão etc.) as outras continuam, o erro dela vira aviso.
 */
export async function excluirIpDasCampanhas(empresaId, ip) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { ok: false, erro: "Google Ads não conectado nesta empresa." };
  const contas = contasSelecionadasDe(empresaId);
  if (contas.length === 0) return { ok: false, erro: "Nenhuma conta do Google Ads sendo monitorada." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const escopo = buscarEmpresa(empresaId)?.bloqueio_auto_escopo === "todas" ? "todas" : "ativas";
  const resourceNames = [];
  const avisos = [];

  for (const conta of contas) {
    const campanhas = await campanhasParaExclusao(
      auth.token,
      c.developerToken,
      conta.customerId,
      conta.loginCustomerId,
      escopo,
    );
    if (campanhas.erro) {
      avisos.push(`${conta.nome || conta.customerId}: ${campanhas.erro}`);
      continue;
    }
    if (campanhas.ids.length === 0) continue;

    const operations = campanhas.ids.map((id) => ({
      create: {
        campaign: `customers/${conta.customerId}/campaigns/${id}`,
        negative: true,
        ipBlock: { ipAddress: ip },
      },
    }));

    const res = await fetch(
      `https://googleads.googleapis.com/${versao()}/customers/${conta.customerId}/campaignCriteria:mutate`,
      {
        method: "POST",
        headers: cabecalhos(auth.token, c.developerToken, conta.loginCustomerId),
        body: JSON.stringify({ operations, partialFailure: true }),
      },
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      avisos.push(`${conta.nome || conta.customerId}: ${mensagemAmigavel(d.error?.message, res.status)}`);
      continue;
    }
    resourceNames.push(...(d.results ?? []).map((r) => r.resourceName).filter(Boolean));
    if (d.partialFailureError) avisos.push(mensagemAmigavel(d.partialFailureError.message, res.status));
  }

  return { ok: true, resourceNames, aviso: avisos.length ? avisos.join("; ") : null };
}

/**
 * Remove exclusões de IP criadas anteriormente (desbloqueio). Os
 * resourceNames já carregam o id da conta embutido (formato
 * "customers/{id}/campaignCriteria/..."), então agrupa por conta e manda um
 * mutate de remoção por conta.
 */
export async function removerExclusaoIp(empresaId, resourceNames) {
  if (!resourceNames || resourceNames.length === 0) return { ok: true };
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { ok: false, erro: "Google Ads não conectado nesta empresa." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const porConta = new Map();
  for (const rn of resourceNames) {
    const m = /^customers\/(\d+)\//.exec(rn);
    if (!m) continue;
    if (!porConta.has(m[1])) porConta.set(m[1], []);
    porConta.get(m[1]).push(rn);
  }

  const contas = contasSelecionadasDe(empresaId);
  const avisos = [];
  for (const [customerId, resourceNamesDaConta] of porConta) {
    const conta = contas.find((x) => x.customerId === customerId);
    const operations = resourceNamesDaConta.map((resourceName) => ({ remove: resourceName }));
    const res = await fetch(
      `https://googleads.googleapis.com/${versao()}/customers/${customerId}/campaignCriteria:mutate`,
      {
        method: "POST",
        headers: cabecalhos(auth.token, c.developerToken, conta?.loginCustomerId),
        body: JSON.stringify({ operations, partialFailure: true }),
      },
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) avisos.push(`${conta?.nome || customerId}: ${mensagemAmigavel(d.error?.message, res.status)}`);
  }
  return avisos.length ? { ok: false, erro: avisos.join("; ") } : { ok: true };
}

async function acaoDeConversao(token, developerToken, customerId, loginCustomerId) {
  const res = await fetch(`https://googleads.googleapis.com/${versao()}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: cabecalhos(token, developerToken, loginCustomerId),
    body: JSON.stringify({
      query: `SELECT conversion_action.id, conversion_action.resource_name, conversion_action.status,
                conversion_action.type
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
  return { acaoId: String(acao.id), status: acao.status ?? "", tipo: acao.type ?? "" };
}

/**
 * "Testar ação de conversão" — confirma que a ação LEADCONVERTIDO existe e
 * está pronta pra receber conversões em CADA conta monitorada, SEM mandar
 * nenhum evento fake pro Google Ads (não polui as métricas reais). É um
 * teste de configuração, não um teste de envio.
 */
export async function testarAcaoDeConversao(empresaId) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { ok: false, erro: "Conecte a conta do Google primeiro." };
  const contas = contasSelecionadasDe(empresaId);
  if (contas.length === 0) return { ok: false, erro: "Selecione ao menos uma conta do Google Ads primeiro." };
  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const detalhes = [];
  for (const conta of contas) {
    const acao = await acaoDeConversao(auth.token, c.developerToken, conta.customerId, conta.loginCustomerId);
    if (!acao.acaoId) {
      detalhes.push({ customerId: conta.customerId, nome: conta.nome, ok: false, erro: acao.erro });
    } else if (acao.status && acao.status !== "ENABLED") {
      detalhes.push({
        customerId: conta.customerId,
        nome: conta.nome,
        ok: false,
        erro: `Ação existe, mas está com status ${acao.status} — reative em Ferramentas > Conversões.`,
      });
    } else {
      detalhes.push({ customerId: conta.customerId, nome: conta.nome, ok: true });
    }
  }
  return { ok: detalhes.every((d) => d.ok), nome: NOME_CONVERSAO, detalhes };
}

/**
 * Envia uma conversão offline (venda) pelo clique (gclid) pra TODAS as
 * contas monitoradas da empresa. Como o app não sabe de antemão em qual
 * conta o clique original aconteceu, manda o mesmo evento pra cada uma —
 * a Data Manager API só atribui de verdade na conta onde o gclid realmente
 * existe (é assim que a importação de conversões offline sempre funcionou:
 * validação/atribuição acontece depois, de forma assíncrona, então mandar
 * pra conta errada não cria conversão nem gasto fantasma em lugar nenhum,
 * só é ignorado). Considera sucesso se pelo menos uma conta aceitar.
 */
export async function enviarConversaoGoogle(empresaId, { gclid, valor, moeda = "BRL", quando }) {
  const c = lerCredenciaisApp();
  if (c.erro) return { ok: false, erro: c.erro };
  const { refreshToken } = conexaoSalva(empresaId);
  if (!refreshToken) return { ok: false, erro: "Conecte a conta do Google primeiro." };
  const contas = contasSelecionadasDe(empresaId);
  if (contas.length === 0) return { ok: false, erro: "Selecione ao menos uma conta do Google Ads primeiro." };

  const auth = await obterAccessToken(refreshToken);
  if (!auth.token) return { ok: false, erro: auth.erro };

  const data = quando ?? new Date();
  let algumSucesso = false;
  const erros = [];

  for (const conta of contas) {
    const acao = await acaoDeConversao(auth.token, c.developerToken, conta.customerId, conta.loginCustomerId);
    if (!acao.acaoId) {
      erros.push(`${conta.nome || conta.customerId}: ${acao.erro}`);
      continue;
    }

    const destino = {
      reference: "leadconvertido",
      operatingAccount: { accountType: "GOOGLE_ADS", accountId: conta.customerId },
      productDestinationId: acao.acaoId,
    };
    if (conta.loginCustomerId) {
      destino.loginAccount = { accountType: "GOOGLE_ADS", accountId: conta.loginCustomerId };
    }
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
      erros.push(`${conta.nome || conta.customerId}: ${mensagemAmigavel(err?.message ?? err?.status, res.status)}`);
      continue;
    }
    algumSucesso = true;
  }

  if (!algumSucesso) {
    return { ok: false, erro: erros.join("; ") || "Não foi possível enviar em nenhuma conta monitorada." };
  }
  return { ok: true };
}
