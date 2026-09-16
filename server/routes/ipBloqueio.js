import { Router } from "express";
import {
  listarVisitasPorIp,
  listarIpsBloqueados,
  bloquearIp,
  desbloquearIp,
  atualizarConfigBloqueioAuto,
} from "../db.js";

export const ipBloqueioRouter = Router({ mergeParams: true });

const IP_VALIDO = /^[0-9a-fA-F.:]{3,45}$/;

ipBloqueioRouter.get("/", (req, res) => {
  const bloqueados = new Map(listarIpsBloqueados(req.empresaId).map((b) => [b.ip, b.motivo]));
  const visitas = listarVisitasPorIp(req.empresaId).map((v) => ({
    ...v,
    veioDeAnuncio: Boolean(v.veioDeAnuncio),
    bloqueado: bloqueados.has(v.ip),
    motivoBloqueio: bloqueados.get(v.ip) ?? null,
  }));
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

ipBloqueioRouter.post("/bloquear", (req, res) => {
  const ip = String(req.body?.ip ?? "").trim();
  if (!ip || !IP_VALIDO.test(ip)) return res.status(400).json({ erro: "IP inválido." });
  bloquearIp(req.empresaId, ip);
  res.json({ ok: true });
});

ipBloqueioRouter.post("/desbloquear", (req, res) => {
  const ip = String(req.body?.ip ?? "").trim();
  if (!ip) return res.status(400).json({ erro: "IP inválido." });
  desbloquearIp(req.empresaId, ip);
  res.json({ ok: true });
});
