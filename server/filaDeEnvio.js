/**
 * Fila de envio de conversões — em vez de mandar pro Google Ads na hora que
 * a venda é confirmada, a conversão fica "pendente" e é enviada automaticamente
 * duas vezes por dia (08h e 20h, horário de Brasília). O usuário também pode
 * forçar o envio antes da hora ou cancelar, na tela "Vendas para Envio".
 */
import { listarFilaDeEnvioDevida, marcarEnvioResultado, buscarEmpresa } from "./db.js";
import { enviarConversaoGoogle } from "./googleAds.js";

// Brasil não tem mais horário de verão desde 2019 — BRT = UTC-3 o ano todo.
const OFFSET_BRASILIA_HORAS = 3;
const INTERVALO_PROCESSAMENTO_MS = 5 * 60 * 1000;

/**
 * Calcula o próximo horário de envio (08h ou 20h de Brasília) a partir de
 * agora, devolvendo um Date em UTC. Faz a conta num "relógio deslocado":
 * subtrai o offset de agora, mexe nos campos UTC desse Date deslocado como
 * se fossem hora local de Brasília, e soma o offset de volta — assim a
 * virada de dia (ex: 22h de Brasília já é outro dia em UTC) fica correta.
 */
export function proximoHorarioEnvio(agora = new Date()) {
  const offsetMs = OFFSET_BRASILIA_HORAS * 60 * 60 * 1000;
  const brasilia = new Date(agora.getTime() - offsetMs);
  const alvo = new Date(brasilia);
  alvo.setUTCHours(0, 0, 0, 0);
  const horaBrasilia = brasilia.getUTCHours();
  if (horaBrasilia < 8) {
    alvo.setUTCHours(8);
  } else if (horaBrasilia < 20) {
    alvo.setUTCHours(20);
  } else {
    alvo.setUTCDate(alvo.getUTCDate() + 1);
    alvo.setUTCHours(8);
  }
  return new Date(alvo.getTime() + offsetMs);
}

/** "08h" / "20h" — hora local de Brasília de um horário agendado (ISO em UTC). */
export function formatarHorarioBrasilia(isoOuData) {
  const d = isoOuData instanceof Date ? isoOuData : new Date(isoOuData);
  const horaBrasilia = (d.getUTCHours() - OFFSET_BRASILIA_HORAS + 24) % 24;
  return `${String(horaBrasilia).padStart(2, "0")}h`;
}

/**
 * Envia uma venda da fila pro Google Ads e registra o resultado — usado
 * tanto pelo agendador (08h/20h) quanto pelo botão "Enviar agora".
 */
export async function enviarVendaParaGoogleAds(conversa) {
  const empresa = buscarEmpresa(conversa.empresa_id);
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  // Usa o horário real da venda (vendido_em), não o horário do envio — a
  // conversão pode ficar horas na fila até 08h/20h, e o Google Ads espera o
  // momento em que a conversão de fato aconteceu, não o do envio.
  const quando = conversa.vendido_em ? new Date(conversa.vendido_em + "Z") : undefined;
  const r = await enviarConversaoGoogle(empresa.id, {
    gclid: conversa.gclid,
    valor: conversa.valor,
    moeda: empresa.moeda,
    quando,
  });
  marcarEnvioResultado(conversa.id, {
    enviada: r.ok,
    resposta: r.ok ? "Conversão enviada ao Google Ads." : r.erro,
  });
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/** Processa tudo que já está no horário de ser enviado, de qualquer empresa. */
export async function processarFilaDeEnvio() {
  const pendentes = listarFilaDeEnvioDevida();
  for (const conversa of pendentes) {
    try {
      await enviarVendaParaGoogleAds(conversa);
    } catch (e) {
      console.error(`[fila-envio] Falha ao processar conversa ${conversa.id}`, e);
    }
  }
}

let intervalo = null;

/** Liga o agendador: roda uma vez ao subir (pega atrasados) e depois a cada 5 minutos. */
export function iniciarAgendadorDeEnvio() {
  if (intervalo) return;
  processarFilaDeEnvio().catch((e) => console.error("[fila-envio] falha no processamento inicial", e));
  intervalo = setInterval(() => {
    processarFilaDeEnvio().catch((e) => console.error("[fila-envio] falha no processamento agendado", e));
  }, INTERVALO_PROCESSAMENTO_MS);
}
