import { randomBytes } from "node:crypto";
import { db, buscarEmpresa, ipEstaBloqueado, contarCliquesRecentesDoIp } from "./db.js";
import { bloquearIpComGoogleAds } from "./ipBloqueio.js";

/** Código curto embutido na mensagem pré-preenchida do link do WhatsApp. */
export function gerarCodigo() {
  return randomBytes(4).toString("hex").toUpperCase(); // ex: A1B2C3D4
}

export function registrarClique({ empresaId, codigo, gclid, fbclid, urlOrigem, ip, campanha }) {
  const origem = gclid ? "google" : fbclid ? "meta" : "sem_rastreio";
  db.prepare(
    `INSERT INTO clicks (empresa_id, codigo, gclid, fbclid, origem, url_origem, ip, campanha)
     VALUES (@empresaId, @codigo, @gclid, @fbclid, @origem, @urlOrigem, @ip, @campanha)
     ON CONFLICT(codigo) DO UPDATE SET gclid = excluded.gclid, fbclid = excluded.fbclid, origem = excluded.origem, ip = excluded.ip, campanha = excluded.campanha`,
  ).run({
    empresaId,
    codigo,
    gclid: gclid ?? null,
    fbclid: fbclid ?? null,
    origem,
    urlOrigem: urlOrigem ?? null,
    ip: ip ?? null,
    campanha: campanha ?? null,
  });

  if (origem !== "sem_rastreio" && ip) {
    verificarCliqueSuspeito(empresaId, ip);
  }
}

/**
 * Bloqueio automático de IP: se um IP fizer mais cliques vindos de anúncio do
 * que o limite configurado, dentro da janela de tempo configurada, ele é
 * bloqueado sozinho — localmente (registro interno) e, em segundo plano,
 * excluído das campanhas ativas do Google Ads da empresa. Cada empresa
 * escolhe seu próprio limite em Bloqueio de IP; o padrão recomendado é 5
 * cliques em 5 minutos. Isso não tem nenhuma relação com envio de conversão
 * de venda — são mecanismos completamente separados.
 *
 * Não usa `await`: a chamada ao Google Ads não pode atrasar a resposta do
 * pixel de clique (endpoint público, chamado a cada visita do site).
 */
function verificarCliqueSuspeito(empresaId, ip) {
  const empresa = buscarEmpresa(empresaId);
  if (!empresa?.bloqueio_auto_ativo) return;
  if (ipEstaBloqueado(empresaId, ip)) return;

  const contagem = contarCliquesRecentesDoIp(empresaId, ip, empresa.bloqueio_auto_minutos);
  if (contagem >= empresa.bloqueio_auto_cliques) {
    const motivo = `${contagem} cliques em ${empresa.bloqueio_auto_minutos} min (automático)`;
    bloquearIpComGoogleAds(empresaId, ip, motivo).catch((e) =>
      console.error(`[bloqueio-ip] falha ao processar bloqueio automático (empresa ${empresaId}, ip ${ip})`, e),
    );
  }
}

/** Atualiza o tempo de permanência (em segundos) do clique — enviado quando a pessoa sai da página. */
export function registrarDuracao({ empresaId, codigo, duracao }) {
  const segundos = Math.max(0, Math.min(86400, Math.round(Number(duracao) || 0)));
  db.prepare("UPDATE clicks SET duracao_segundos = ? WHERE empresa_id = ? AND codigo = ?").run(
    segundos,
    empresaId,
    codigo,
  );
}

export function buscarCliquePorCodigo(codigo) {
  return db.prepare("SELECT * FROM clicks WHERE codigo = ?").get(codigo) ?? null;
}

/** Extrai o código de rastreio "(ref: XXXXXXXX)" de dentro do texto da mensagem. */
export function extrairCodigoDoTexto(texto) {
  const m = /\(ref:\s*([A-Z0-9]{6,10})\)/i.exec(texto ?? "");
  return m ? m[1].toUpperCase() : null;
}
