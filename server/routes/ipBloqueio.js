import { Router } from "express";
import { listarVisitasPorIp, listarIpsBloqueados, bloquearIp, desbloquearIp } from "../db.js";

export const ipBloqueioRouter = Router({ mergeParams: true });

const IP_VALIDO = /^[0-9a-fA-F.:]{3,45}$/;

ipBloqueioRouter.get("/", (req, res) => {
  const bloqueados = new Set(listarIpsBloqueados(req.empresaId).map((b) => b.ip));
  const visitas = listarVisitasPorIp(req.empresaId).map((v) => ({
    ...v,
    veioDeAnuncio: Boolean(v.veioDeAnuncio),
    bloqueado: bloqueados.has(v.ip),
  }));
  res.json({ visitas, bloqueados: [...bloqueados] });
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
