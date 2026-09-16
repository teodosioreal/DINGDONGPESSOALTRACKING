import { buscarEmpresa } from "../db.js";

/** Resolve :empresaId da URL, valida que existe, e anexa req.empresaId/req.empresa. */
export function carregarEmpresa(req, res, next) {
  const id = Number(req.params.empresaId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: "Empresa inválida." });
  const empresa = buscarEmpresa(id);
  if (!empresa) return res.status(404).json({ erro: "Empresa não encontrada." });
  req.empresaId = id;
  req.empresa = empresa;
  next();
}
