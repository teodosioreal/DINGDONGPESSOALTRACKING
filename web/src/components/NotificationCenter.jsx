import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { tocarSinoDingDong, tocarSomDeVenda } from "../lib/sons.js";

const ICONE = { mensagem: "💬", venda_provavel: "🔔", venda_enviada: "💰" };

function titulo(evento) {
  if (evento.tipo === "venda_provavel") {
    return `Palavra-chave detectada: ${evento.nome}${evento.valor ? ` — R$ ${Number(evento.valor).toFixed(2)}` : ""}`;
  }
  if (evento.tipo === "venda_enviada") {
    return `Venda enviada ao Google Ads: ${evento.nome}${evento.valor ? ` — R$ ${Number(evento.valor).toFixed(2)}` : ""}`;
  }
  return `Nova mensagem de ${evento.nome}`;
}

function corDoToast(tipo) {
  if (tipo === "venda_enviada") {
    return "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/90 dark:text-green-300";
  }
  if (tipo === "venda_provavel") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/90 dark:text-amber-300";
  }
  return "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export default function NotificationCenter({ empresaId }) {
  const [toasts, setToasts] = useState([]);
  const desdeRef = useRef(null);
  const idRef = useRef(0);

  useEffect(() => {
    desdeRef.current = null;
    setToasts([]);
    if (!empresaId) return;

    let cancelado = false;

    function adicionarToast(evento) {
      const id = ++idRef.current;
      setToasts((atual) => [...atual, { id, ...evento }]);
      setTimeout(() => {
        setToasts((atual) => atual.filter((t) => t.id !== id));
      }, 6000);
    }

    async function poll() {
      try {
        const r = await api.eventosRecentes(empresaId, desdeRef.current);
        if (cancelado) return;
        if (desdeRef.current !== null) {
          for (const evento of r.eventos) {
            adicionarToast(evento);
            if (evento.tipo === "venda_provavel") tocarSinoDingDong();
            if (evento.tipo === "venda_enviada") tocarSomDeVenda();
          }
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

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-16 z-50 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-lg border px-3 py-2 text-sm shadow-lg ${corDoToast(t.tipo)}`}>
          <p className="font-medium">
            {ICONE[t.tipo]} {titulo(t)}
          </p>
        </div>
      ))}
    </div>
  );
}
