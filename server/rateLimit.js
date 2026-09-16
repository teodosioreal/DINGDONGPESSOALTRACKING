const contadores = new Map();

/** Limitador simples em memória (1 processo). Suficiente para uso pessoal. */
export function limitar(chave, { max, janelaMs }) {
  const agora = Date.now();
  const atual = contadores.get(chave);
  if (!atual || atual.ate < agora) {
    contadores.set(chave, { n: 1, ate: agora + janelaMs });
    if (contadores.size > 2000) {
      for (const [k, v] of contadores) if (v.ate < agora) contadores.delete(k);
    }
    return true;
  }
  atual.n += 1;
  return atual.n <= max;
}

/**
 * IP real do visitante. Pega o ÚLTIMO IP de X-Forwarded-For, não o
 * primeiro: nosso Nginx usa $proxy_add_x_forwarded_for, que ANEXA ao
 * header em vez de substituir — então um cliente mal-intencionado pode
 * mandar um X-Forwarded-For forjado, mas o Nginx sempre acrescenta o IP
 * real de quem conectou como o último item da lista.
 */
export function ipDe(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const partes = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (partes.length > 0) return partes[partes.length - 1];
  }
  return req.socket?.remoteAddress || "desconhecido";
}
