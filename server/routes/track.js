import { Router } from "express";
import { limitar, ipDe } from "../rateLimit.js";
import { registrarClique, registrarDuracao } from "../tracking.js";
import { buscarEmpresa } from "../db.js";

export const trackPublicRouter = Router();

const CODIGO_VALIDO = /^[A-Z0-9]{6,10}$/i;

trackPublicRouter.post("/click", (req, res) => {
  if (!limitar(`click:${ipDe(req)}`, { max: 60, janelaMs: 60_000 })) {
    return res.status(429).json({ erro: "Muitas requisições." });
  }
  const { empresa, codigo, gclid, fbclid, url, campanha } = req.body ?? {};
  const empresaId = Number(empresa);
  if (!empresaId || !buscarEmpresa(empresaId)) return res.status(400).json({ erro: "empresa inválida" });
  if (!codigo || !CODIGO_VALIDO.test(codigo)) return res.status(400).json({ erro: "código inválido" });
  registrarClique({
    empresaId,
    codigo: String(codigo).toUpperCase(),
    gclid: gclid ? String(gclid).slice(0, 200) : null,
    fbclid: fbclid ? String(fbclid).slice(0, 200) : null,
    urlOrigem: url ? String(url).slice(0, 500) : null,
    ip: ipDe(req),
    campanha: campanha ? String(campanha).slice(0, 200) : null,
  });
  res.json({ ok: true });
});

/** Enviado via sendBeacon quando a pessoa sai da página — atualiza o tempo de permanência. */
trackPublicRouter.post("/click/duracao", (req, res) => {
  if (!limitar(`duracao:${ipDe(req)}`, { max: 60, janelaMs: 60_000 })) {
    return res.status(429).json({ erro: "Muitas requisições." });
  }
  const { empresa, codigo, duracao } = req.body ?? {};
  const empresaId = Number(empresa);
  if (!empresaId || !codigo || !CODIGO_VALIDO.test(codigo)) return res.status(400).json({ erro: "dados inválidos" });
  registrarDuracao({ empresaId, codigo: String(codigo).toUpperCase(), duracao });
  res.json({ ok: true });
});
