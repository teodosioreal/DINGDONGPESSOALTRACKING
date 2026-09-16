import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { tocarSomDeCaixaRegistradora } from "../lib/sons.js";

const ICONE = { venda_provavel: "🔔", venda_enviada: "💰" };
const FORMATADOR_VALOR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function titulo(evento) {
  const valor = evento.valor ? ` — ${FORMATADOR_VALOR.format(Number(evento.valor))}` : "";
  if (evento.tipo === "venda_enviada") return `Venda enviada ao Google Ads: ${evento.nome}${valor}`;
  return `Palavra-chave detectada: ${evento.nome}${valor}`;
}

function tempoRelativo(quando) {
  const iso = quando.includes("T") ? quando : `${quando.replace(" ", "T")}Z`;
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas}h`;
  return `há ${Math.round(horas / 24)} dia(s)`;
}

export default function NotificationCenter({ empresaId }) {
  const [notificacoes, setNotificacoes] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [chamativo, setChamativo] = useState(false);
  const desdeRef = useRef(null);
  const idRef = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    desdeRef.current = null;
    setNotificacoes([]);
    setNaoLidas(0);
    setAberto(false);
    if (!empresaId) return;

    let cancelado = false;

    async function poll() {
      try {
        const r = await api.eventosRecentes(empresaId, desdeRef.current);
        if (cancelado) return;
        if (desdeRef.current !== null && r.eventos.length > 0) {
          const novas = r.eventos.map((e) => ({ id: ++idRef.current, ...e })).reverse();
          setNotificacoes((atual) => [...novas, ...atual].slice(0, 30));
          setNaoLidas((atual) => atual + r.eventos.length);
          r.eventos.forEach(tocarSomDeCaixaRegistradora);
          setChamativo(true);
          setTimeout(() => setChamativo(false), 1600);
        }
        desdeRef.current = r.agora;
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    }

    poll();
    const t = setInterval(poll, 8000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [empresaId]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  if (!empresaId) return null;

  function alternar() {
    setAberto((v) => {
      const abrir = !v;
      if (abrir) setNaoLidas(0);
      return abrir;
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={alternar}
        title="Notificações"
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${
          chamativo
            ? "animate-bounce border-amber-400 bg-amber-100 dark:border-amber-500 dark:bg-amber-900/60"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
        }`}
      >
        🔔
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-10 max-h-96 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Notificações
          </div>
          {notificacoes.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400 dark:text-slate-500">Nenhuma notificação ainda.</p>
          ) : (
            notificacoes.map((n) => (
              <div
                key={n.id}
                className="border-b border-slate-50 px-3 py-2 text-sm last:border-0 dark:border-slate-800/60"
              >
                <p className="text-slate-700 dark:text-slate-200">
                  {ICONE[n.tipo]} {titulo(n)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{tempoRelativo(n.quando)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
