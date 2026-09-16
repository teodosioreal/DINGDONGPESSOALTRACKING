/**
 * Orquestra o bloqueio de IP suspeito. São DOIS sistemas independentes:
 *
 * 1. Bloqueio local (banco) — sempre acontece primeiro e nunca falha por
 *    causa do Google Ads. É só um registro interno da empresa.
 * 2. Exclusão nas campanhas do Google Ads — best-effort, feita depois. Se a
 *    empresa ainda não conectou o Google Ads, ou a chamada falha, o bloqueio
 *    local continua valendo do mesmo jeito — só fica sem a exclusão aplicada
 *    lá, e o erro fica salvo pra mostrar na tela.
 *
 * Isso NÃO tem nenhuma relação com envio de conversão de venda — são coisas
 * completamente separadas (ver conversas.js: confirmarVenda não olha bloqueio
 * de IP de jeito nenhum).
 */
import { bloquearIp, desbloquearIp, buscarBloqueioIp, salvarResultadoGoogleDoBloqueio } from "./db.js";
import { excluirIpDasCampanhas, removerExclusaoIp } from "./googleAds.js";

export async function bloquearIpComGoogleAds(empresaId, ip, motivo = null) {
  bloquearIp(empresaId, ip, motivo);
  const r = await excluirIpDasCampanhas(empresaId, ip);
  salvarResultadoGoogleDoBloqueio(empresaId, ip, {
    resourceNames: r.ok ? r.resourceNames : null,
    erro: r.ok ? (r.aviso ?? null) : r.erro,
  });
  return r;
}

export async function desbloquearIpComGoogleAds(empresaId, ip) {
  const bloqueio = buscarBloqueioIp(empresaId, ip);
  desbloquearIp(empresaId, ip);
  const resourceNames = bloqueio?.google_criterios ? JSON.parse(bloqueio.google_criterios) : [];
  if (resourceNames.length === 0) return { ok: true };
  return removerExclusaoIp(empresaId, resourceNames);
}
