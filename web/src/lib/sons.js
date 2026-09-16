let contextoAudio;

function contexto() {
  if (!contextoAudio) {
    const AudioContextClasse = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClasse) return null;
    contextoAudio = new AudioContextClasse();
  }
  if (contextoAudio.state === "suspended") {
    contextoAudio.resume().catch(() => {});
  }
  return contextoAudio;
}

function tocarNota(ctx, { freq, inicio, duracao, tipo = "sine", volume = 0.25 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime + inicio;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duracao);
  osc.start(t0);
  osc.stop(t0 + duracao + 0.05);
}

/**
 * Som de "caixa registradora" — bem chamativo, usado tanto pra venda provável
 * detectada quanto pra venda enviada ao Google Ads. Dois cliques metálicos
 * (a gaveta abrindo) seguidos de um "ching!" brilhante e alto.
 */
export function tocarSomDeCaixaRegistradora() {
  const ctx = contexto();
  if (!ctx) return;
  try {
    tocarNota(ctx, { freq: 1600, inicio: 0, duracao: 0.06, tipo: "square", volume: 0.22 });
    tocarNota(ctx, { freq: 2000, inicio: 0.07, duracao: 0.06, tipo: "square", volume: 0.22 });
    tocarNota(ctx, { freq: 1046.5, inicio: 0.16, duracao: 0.7, tipo: "sine", volume: 0.35 });
    tocarNota(ctx, { freq: 1318.5, inicio: 0.16, duracao: 0.7, tipo: "sine", volume: 0.3 });
    tocarNota(ctx, { freq: 1567.98, inicio: 0.16, duracao: 0.8, tipo: "sine", volume: 0.25 });
    tocarNota(ctx, { freq: 2093, inicio: 0.18, duracao: 0.6, tipo: "triangle", volume: 0.15 });
  } catch {
    /* Web Audio indisponível (ex: aba em background em alguns navegadores) — segue sem som */
  }
}
