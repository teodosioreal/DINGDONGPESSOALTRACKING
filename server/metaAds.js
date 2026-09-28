import { createHash } from "node:crypto";
import { db } from "./db.js";

const VERSAO_GRAPH = "v21.0";

/**
 * Diferente do Google Ads, aqui não tem OAuth: o usuário gera um Pixel ID e
 * um token de acesso de longa duração direto no Events Manager (Configurações
 * do evento > Conversions API > Gerar token de acesso) e cola os dois aqui.
 */
export function conexaoMetaSalva(empresaId) {
  const c = db.prepare("SELECT pixel_id, access_token FROM meta_conexoes WHERE empresa_id = ?").get(empresaId);
  return { pixelId: c?.pixel_id ?? null, accessToken: c?.access_token ?? null };
}

export function salvarConexaoMeta(empresaId, { pixelId, accessToken }) {
  db.prepare(
    `INSERT INTO meta_conexoes (empresa_id, pixel_id, access_token) VALUES (?, ?, ?)
     ON CONFLICT(empresa_id) DO UPDATE SET pixel_id = excluded.pixel_id, access_token = excluded.access_token`,
  ).run(empresaId, pixelId, accessToken);
}

export function desconectarMeta(empresaId) {
  db.prepare("DELETE FROM meta_conexoes WHERE empresa_id = ?").run(empresaId);
}

/**
 * Confirma que o Pixel ID e o token salvos são válidos — SEM contar como
 * dado real, usando o `test_event_code` do Meta (Gerenciador de Eventos >
 * aba "Testar eventos" do dataset). Não dá pra validar com uma consulta
 * (GET) simples: o token gerado especificamente pra Conversions API só tem
 * permissão pra ENVIAR eventos, não pra ler dados do pixel — por isso o
 * teste é, na prática, um envio real (marcado como teste).
 */
export async function testarConexaoMeta(empresaId, testEventCode) {
  const conexao = conexaoMetaSalva(empresaId);
  if (!conexao.pixelId || !conexao.accessToken) {
    return { ok: false, erro: "Conecte o Meta Ads primeiro (Pixel ID e token de acesso)." };
  }
  if (!testEventCode) {
    return {
      ok: false,
      erro: 'Cole o "código de teste de eventos" — pega em Gerenciador de Eventos > seu dataset > aba "Testar eventos".',
    };
  }

  const agora = new Date();
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(agora.getTime() / 1000),
        action_source: "chat",
        event_id: `teste-conexao-${empresaId}-${agora.getTime()}`,
        user_data: { fbc: `fb.1.${agora.getTime()}.teste` },
        custom_data: { value: 0, currency: "BRL" },
      },
    ],
    test_event_code: testEventCode,
    access_token: conexao.accessToken,
  };

  const res = await fetch(`https://graph.facebook.com/${VERSAO_GRAPH}/${conexao.pixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, erro: resposta?.error?.message ?? `Erro ${res.status} ao testar a conexão.` };
  }
  return { ok: true, recebidos: resposta.events_received ?? 0 };
}

/**
 * Envia uma conversão (venda) pra Conversions API do Meta. Usa o evento
 * padrão "Purchase" (não "Lead") de propósito — é isso que faz a venda
 * aparecer na otimização/relatório de Compras das campanhas do Meta Ads, e
 * exige `value`/`currency`, que já mandamos.
 *
 * Duas origens possíveis, com formatos diferentes de evento:
 *  - fbclid (clicou num anúncio, foi pro site, depois pro WhatsApp): manda
 *    `fbc` com action_source "chat". Como não guardamos o instante exato em
 *    que o fbclid foi capturado, o `fbc` é montado com o horário da própria
 *    venda — aproximação aceitável, o que atribui é o fbclid embutido, não a
 *    precisão do timestamp.
 *  - ctwaClid (anúncio "clique para o WhatsApp" — nunca passou pelo site):
 *    formato específico que a própria Meta documenta pra esse tipo de
 *    anúncio — action_source "business_messaging" + messaging_channel
 *    "whatsapp", com ctwa_clid dentro de user_data em vez de fbc.
 */
export async function enviarConversaoMeta(empresaId, { fbclid, ctwaClid, valor, moeda = "BRL", quando, telefone }) {
  const conexao = conexaoMetaSalva(empresaId);
  if (!conexao.pixelId || !conexao.accessToken) {
    return { ok: false, erro: "Conecte o Meta Ads primeiro (Pixel ID e token de acesso)." };
  }
  if (!fbclid && !ctwaClid) return { ok: false, erro: "Essa venda não tem fbclid nem ctwa_clid." };

  const data = quando ?? new Date();
  const segundos = Math.floor(data.getTime() / 1000);

  const userData = fbclid ? { fbc: `fb.1.${data.getTime()}.${fbclid}` } : { ctwa_clid: ctwaClid };
  const digitosTelefone = String(telefone ?? "").replace(/\D/g, "");
  if (digitosTelefone) {
    userData.ph = [createHash("sha256").update(digitosTelefone).digest("hex")];
  }

  const evento = {
    event_name: "Purchase",
    event_time: segundos,
    event_id: `compra-${empresaId}-${fbclid ?? ctwaClid}-${segundos}`,
    user_data: userData,
    custom_data: { value: Number(valor) || 0, currency: moeda },
  };
  if (fbclid) {
    evento.action_source = "chat";
  } else {
    evento.action_source = "business_messaging";
    evento.messaging_channel = "whatsapp";
  }

  const payload = { data: [evento], access_token: conexao.accessToken };

  const res = await fetch(`https://graph.facebook.com/${VERSAO_GRAPH}/${conexao.pixelId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, erro: resposta?.error?.message ?? `Erro ${res.status} ao enviar pro Meta Ads.` };
  }
  return { ok: true };
}
