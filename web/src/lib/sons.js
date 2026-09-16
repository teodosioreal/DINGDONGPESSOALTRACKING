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

/** Sininho "ding-dong" — toca quando o sistema detecta a palavra-chave de venda. */
export function tocarSinoDingDong() {
  const ctx = contexto();
  if (!ctx) return;
  try {
    tocarNota(ctx, { freq: 880, inicio: 0, duracao: 0.45, tipo: "sine", volume: 0.22 });
    tocarNota(ctx, { freq: 659.25, inicio: 0.32, duracao: 0.65, tipo: "sine", volume: 0.22 });
  } catch {
    /* Web Audio indisponível (ex: aba em background em alguns navegadores) — segue sem som */
  }
}

/** Som de "venda" — toca quando a conversão é enviada pro Google Ads. */
export function tocarSomDeVenda() {
  const ctx = contexto();
  if (!ctx) return;
  try {
    const notas = [523.25, 659.25, 783.99, 1046.5];
    notas.forEach((freq, i) => tocarNota(ctx, { freq, inicio: i * 0.09, duracao: 0.22, tipo: "triangle", volume: 0.25 }));
  } catch {
    /* Web Audio indisponível — segue sem som */
  }
}
