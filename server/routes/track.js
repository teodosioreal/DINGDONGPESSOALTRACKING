import { Router } from "express";
import { limitar, ipDe } from "../rateLimit.js";
import { registrarClique } from "../tracking.js";

export const trackPublicRouter = Router();

const CODIGO_VALIDO = /^[A-Z0-9]{6,10}$/i;

trackPublicRouter.post("/click", (req, res) => {
  if (!limitar(`click:${ipDe(req)}`, { max: 60, janelaMs: 60_000 })) {
    return res.status(429).json({ erro: "Muitas requisições." });
  }
  const { codigo, gclid, fbclid, url } = req.body ?? {};
  if (!codigo || !CODIGO_VALIDO.test(codigo)) return res.status(400).json({ erro: "código inválido" });
  registrarClique({
    codigo: String(codigo).toUpperCase(),
    gclid: gclid ? String(gclid).slice(0, 200) : null,
    fbclid: fbclid ? String(fbclid).slice(0, 200) : null,
    urlOrigem: url ? String(url).slice(0, 500) : null,
  });
  res.json({ ok: true });
});
