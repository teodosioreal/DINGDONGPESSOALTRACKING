import { Router } from "express";
import { listarTodasVendas } from "../conversas.js";
import { testarAcaoDeConversao } from "../googleAds.js";

export const vendasRouter = Router({ mergeParams: true });

/** Aba Vendas — todas as vendas confirmadas, com e sem rastreio. */
vendasRouter.get("/", (req, res) => {
  res.json({ vendas: listarTodasVendas(req.empresaId) });
});

/** Confirma se a ação de conversão LEADCONVERTIDO existe e está pronta, sem mandar evento nenhum. */
vendasRouter.get("/testar-conversao", async (req, res) => {
  const r = await testarAcaoDeConversao(req.empresaId);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true, nome: r.nome, status: r.status });
});
