import { Router } from "express";
import { listarVisitasPorIp, listarIpsBloqueados, atualizarConfigBloqueioAuto } from "../db.js";
import { bloquearIpComGoogleAds, desbloquearIpComGoogleAds } from "../ipBloqueio.js";

export const ipBloqueioRouter = Router({ mergeParams: true });

const IP_VALIDO = /^[0-9a-fA-F.:]{3,45}$/;

ipBloqueioRouter.get("/", (req, res) => {
  const bloqueados = new Map(listarIpsBloqueados(req.empresaId).map((b) => [b.ip, b]));
  const visitas = listarVisitasPorIp(req.empresaId).map((v) => {
    const b = bloqueados.get(v.ip);
    return {
      ...v,
      veioDeAnuncio: Boolean(v.veioDeAnuncio),
      bloqueado: Boolean(b),
      motivoBloqueio: b?.motivo ?? null,
      googleAplicado: Boolean(b?.google_criterios),
      googleErro: b?.google_erro ?? null,
    };
  });
  res.json({
    visitas,
    bloqueados: [...bloqueados.keys()],
    config: {
      ativo: Boolean(req.empresa.bloqueio_auto_ativo),
      cliques: req.empresa.bloqueio_auto_cliques,
      minutos: req.empresa.bloqueio_auto_minutos,
    },
  });
});

/** Configura o bloqueio automático de IP (limite de cliques vindos de anúncio numa janela de tempo). */
ipBloqueioRouter.put("/config", (req, res) => {
  const ativo = Boolean(req.body?.ativo);
  const cliques = Number(req.body?.cliques);
  const minutos = Number(req.body?.minutos);
  if (!Number.isInteger(cliques) || cliques < 2 || cliques > 100) {
    return res.status(400).json({ erro: "Número de cliques precisa ser um número inteiro entre 2 e 100." });
  }
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440) {
    return res.status(400).json({ erro: "Janela de tempo precisa ser um número inteiro entre 1 e 1440 minutos." });
  }
  atualizarConfigBloqueioAuto(req.empresaId, { ativo, cliques, minutos });
  res.json({ ok: true });
});

/** Bloqueia localmente (sempre funciona) e tenta excluir o IP das campanhas ativas do Google Ads (best-effort). */
ipBloqueioRouter.post("/bloquear", async (req, res) => {
  const ip = String(req.body?.ip ?? "").trim();
  if (!ip || !IP_VALIDO.test(ip)) return res.status(400).json({ erro: "IP inválido." });
  const r = await bloquearIpComGoogleAds(req.empresaId, ip);
  res.json({ ok: true, avisoGoogle: r.ok ? (r.aviso ?? null) : r.erro });
});

/** Desbloqueia localmente e remove a exclusão correspondente nas campanhas do Google Ads (se tinha sido aplicada). */
ipBloqueioRouter.post("/desbloquear", async (req, res) => {
  const ip = String(req.body?.ip ?? "").trim();
  if (!ip) return res.status(400).json({ erro: "IP inválido." });
  const r = await desbloquearIpComGoogleAds(req.empresaId, ip);
  res.json({ ok: true, avisoGoogle: r.ok ? null : r.erro });
});
