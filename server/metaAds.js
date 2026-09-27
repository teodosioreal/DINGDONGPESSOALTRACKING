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
 * Confirma que o Pixel ID e o token salvos são válidos, sem mandar nenhum
 * evento fake pro Meta — só consulta os dados do próprio pixel.
 */
export async function testarConexaoMeta(empresaId) {
  const conexao = conexaoMetaSalva(empresaId);
  if (!conexao.pixelId || !conexao.accessToken) {
    return { ok: false, erro: "Conecte o Meta Ads primeiro (Pixel ID e token de acesso)." };
  }
  const url = `https://graph.facebook.com/${VERSAO_GRAPH}/${conexao.pixelId}?fields=id,name&access_token=${encodeURIComponent(conexao.accessToken)}`;
  const res = await fetch(url);
  const resposta = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, erro: resposta?.error?.message ?? `Erro ${res.status} ao validar o pixel.` };
  }
  return { ok: true, nome: resposta.name, id: resposta.id };
}

/**
 * Envia uma conversão (venda) pra Conversions API do Meta, pelo fbclid do
 * clique original. Como não guardamos o instante exato em que o fbclid foi
 * capturado (só o valor), o `fbc` é montado com o horário da própria venda —
 * é uma aproximação aceitável: o que a Meta usa pra atribuição é o fbclid
 * embutido no parâmetro, não a precisão do timestamp.
 */
export async function enviarConversaoMeta(empresaId, { fbclid, valor, moeda = "BRL", quando, telefone }) {
  const conexao = conexaoMetaSalva(empresaId);
  if (!conexao.pixelId || !conexao.accessToken) {
    return { ok: false, erro: "Conecte o Meta Ads primeiro (Pixel ID e token de acesso)." };
  }
  if (!fbclid) return { ok: false, erro: "Essa venda não tem fbclid." };

  const data = quando ?? new Date();
  const segundos = Math.floor(data.getTime() / 1000);

  const userData = { fbc: `fb.1.${data.getTime()}.${fbclid}` };
  const digitosTelefone = String(telefone ?? "").replace(/\D/g, "");
  if (digitosTelefone) {
    userData.ph = [createHash("sha256").update(digitosTelefone).digest("hex")];
  }

  const payload = {
    data: [
      {
        event_name: "Lead",
        event_time: segundos,
        action_source: "chat",
        event_id: `leadconvertido-${empresaId}-${fbclid}-${segundos}`,
        user_data: userData,
        custom_data: { value: Number(valor) || 0, currency: moeda },
      },
    ],
    access_token: conexao.accessToken,
  };

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
