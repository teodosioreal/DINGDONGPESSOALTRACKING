import { Router } from "express";
import { listarTodasVendas } from "../conversas.js";
import { testarAcaoDeConversao, nomesDeCampanhas } from "../googleAds.js";

export const vendasRouter = Router({ mergeParams: true });

/**
 * Aba Vendas — todas as vendas confirmadas, com e sem rastreio. Vendas do
 * Google cuja `campanha` veio como só o ID numérico (ValueTrack
 * {campaignid}, sem nome) são resolvidas pro nome de verdade da campanha
 * antes de devolver — se não der (conta desconectada, campanha apagada
 * etc.), mantém o ID como veio.
 */
vendasRouter.get("/", async (req, res) => {
  const vendas = listarTodasVendas(req.empresaId);
  const idsParaResolver = vendas
    .filter((v) => v.plataforma === "google" && v.campanha && /^\d+$/.test(v.campanha))
    .map((v) => v.campanha);
  if (idsParaResolver.length > 0) {
    const nomes = await nomesDeCampanhas(req.empresaId, idsParaResolver);
    for (const v of vendas) {
      if (nomes.has(v.campanha)) v.campanha = nomes.get(v.campanha);
    }
  }
  res.json({ vendas });
});

/**
 * Confirma se a ação de conversão de compra existe (ou cria automaticamente)
 * e está pronta em cada conta monitorada, sem mandar evento nenhum. Devolve 200 mesmo se
 * alguma conta falhar — isso é um resultado válido do teste (com detalhes
 * por conta), não um erro de requisição; só usa 400 quando nem dá pra
 * testar (sem conexão, sem conta selecionada etc).
 */
vendasRouter.get("/testar-conversao", async (req, res) => {
  const r = await testarAcaoDeConversao(req.empresaId);
  if (r.erro) return res.status(400).json({ erro: r.erro });
  res.json({ ok: r.ok, nome: r.nome, detalhes: r.detalhes });
});
