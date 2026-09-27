import { Router } from "express";
import { conexaoMetaSalva, salvarConexaoMeta, desconectarMeta, testarConexaoMeta } from "../metaAds.js";

export const metaRouter = Router({ mergeParams: true });

/** Não devolve o access_token de volta — uma vez salvo, só dá pra sobrescrever. */
metaRouter.get("/status", (req, res) => {
  const c = conexaoMetaSalva(req.empresaId);
  res.json({ conectado: Boolean(c.pixelId && c.accessToken), pixelId: c.pixelId });
});

metaRouter.post("/conexao", (req, res) => {
  const { pixelId, accessToken } = req.body ?? {};
  if (!pixelId || !accessToken) return res.status(400).json({ erro: "Pixel ID e token de acesso são obrigatórios." });
  salvarConexaoMeta(req.empresaId, { pixelId, accessToken });
  res.json({ ok: true });
});

metaRouter.post("/desconectar", (req, res) => {
  desconectarMeta(req.empresaId);
  res.json({ ok: true });
});

/**
 * Testa se o Pixel ID + token salvos são válidos — precisa do
 * "código de teste de eventos" (Gerenciador de Eventos > dataset > aba
 * "Testar eventos"), porque o token da Conversions API só tem permissão
 * pra enviar eventos, não pra consultar dados do pixel.
 */
metaRouter.get("/testar-conexao", async (req, res) => {
  const r = await testarConexaoMeta(req.empresaId, req.query.testEventCode);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json(r);
});
