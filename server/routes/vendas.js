import { Router } from "express";
import { listarTodasVendas } from "../conversas.js";
import { testarAcaoDeConversao } from "../googleAds.js";

export const vendasRouter = Router({ mergeParams: true });

/** Aba Vendas — todas as vendas confirmadas, com e sem rastreio. */
vendasRouter.get("/", (req, res) => {
  res.json({ vendas: listarTodasVendas(req.empresaId) });
});

/**
 * Confirma se a ação de conversão LEADCONVERTIDO existe e está pronta em
 * cada conta monitorada, sem mandar evento nenhum. Devolve 200 mesmo se
 * alguma conta falhar — isso é um resultado válido do teste (com detalhes
 * por conta), não um erro de requisição; só usa 400 quando nem dá pra
 * testar (sem conexão, sem conta selecionada etc).
 */
vendasRouter.get("/testar-conversao", async (req, res) => {
  const r = await testarAcaoDeConversao(req.empresaId);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json({ ok: r.ok, nome: r.nome, detalhes: r.detalhes });
});
