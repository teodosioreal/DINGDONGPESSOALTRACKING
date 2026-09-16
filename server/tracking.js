import { randomBytes } from "node:crypto";
import { db } from "./db.js";

/** Código curto embutido na mensagem pré-preenchida do link do WhatsApp. */
export function gerarCodigo() {
  return randomBytes(4).toString("hex").toUpperCase(); // ex: A1B2C3D4
}

export function registrarClique({ empresaId, codigo, gclid, fbclid, urlOrigem }) {
  const origem = gclid ? "google" : fbclid ? "meta" : "sem_rastreio";
  db.prepare(
    `INSERT INTO clicks (empresa_id, codigo, gclid, fbclid, origem, url_origem)
     VALUES (@empresaId, @codigo, @gclid, @fbclid, @origem, @urlOrigem)
     ON CONFLICT(codigo) DO UPDATE SET gclid = excluded.gclid, fbclid = excluded.fbclid, origem = excluded.origem`,
  ).run({ empresaId, codigo, gclid: gclid ?? null, fbclid: fbclid ?? null, origem, urlOrigem: urlOrigem ?? null });
}

export function buscarCliquePorCodigo(codigo) {
  return db.prepare("SELECT * FROM clicks WHERE codigo = ?").get(codigo) ?? null;
}

/** Extrai o código de rastreio "(ref: XXXXXXXX)" de dentro do texto da mensagem. */
export function extrairCodigoDoTexto(texto) {
  const m = /\(ref:\s*([A-Z0-9]{6,10})\)/i.exec(texto ?? "");
  return m ? m[1].toUpperCase() : null;
}
