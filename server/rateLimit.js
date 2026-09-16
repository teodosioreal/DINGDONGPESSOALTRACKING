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

export function ipDe(req) {
  return (req.headers["x-forwarded-for"]?.split(",")[0]?.trim()) || req.socket?.remoteAddress || "desconhecido";
}
