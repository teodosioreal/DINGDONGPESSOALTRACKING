import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

const NOME_ORIGEM = { google: "Google Ads", meta: "Meta Ads", sem_rastreio: "Sem rastreio" };
const COR_ORIGEM = {
  google: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  meta: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  sem_rastreio: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

function BadgeOrigem({ origem }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        COR_ORIGEM[origem] ?? COR_ORIGEM.sem_rastreio
      }`}
    >
      {NOME_ORIGEM[origem] ?? origem}
    </span>
  );
}

export default function Conversas() {
  const { empresaId } = useParams();
  const [conversas, setConversas] = useState([]);
  const [selecionada, setSelecionada] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [aviso, setAviso] = useState("");
  const [limpandoTudo, setLimpandoTudo] = useState(false);

  useEffect(() => {
    setConversas([]);
    setSelecionada(null);
    carregarLista();
    const t = setInterval(carregarLista, 15000);
    return () => clearInterval(t);
  }, [empresaId]);

  async function carregarLista() {
    const r = await api.conversas(empresaId);
    setConversas(r.conversas);
  }

  async function abrir(conversa) {
    setSelecionada(conversa);
    setAviso("");
    setValorVenda(conversa.valor_sugerido ? String(conversa.valor_sugerido) : "");
    const r = await api.conversa(empresaId, conversa.id);
    setMensagens(r.mensagens);
    if (conversa.nao_lida) {
      setConversas((atual) => atual.map((c) => (c.id === conversa.id ? { ...c, nao_lida: 0 } : c)));
    }
  }

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim() || !selecionada) return;
    await api.enviarMensagem(empresaId, selecionada.id, texto);
    setTexto("");
    abrir(selecionada);
  }

  async function marcarVenda(e) {
    e.preventDefault();
    if (!selecionada) return;
    try {
      const r = await api.marcarVenda(empresaId, selecionada.id, valorVenda);
      setAviso(r.respostaConversao);
      setValorVenda("");
      carregarLista();
    } catch (e) {
      setAviso(e.message);
    }
  }

  async function descartarVendaProvavel() {
    if (!selecionada) return;
    await api.descartarVenda(empresaId, selecionada.id);
    setAviso("Venda provável descartada — voltou a ser lead.");
    setSelecionada((s) => ({ ...s, status: "lead", valor_sugerido: null }));
    carregarLista();
  }

  async function apagar() {
    if (!selecionada) return;
    if (!confirm(`Apagar a conversa com ${selecionada.nome || selecionada.telefone}? Isso não pode ser desfeito.`)) {
      return;
    }
    await api.apagarConversa(empresaId, selecionada.id);
    setSelecionada(null);
    setMensagens([]);
    carregarLista();
  }

  async function limparTudo() {
    if (
      !confirm(
        "Apagar TODAS as conversas dessa empresa aqui no DingDong? As vendas já confirmadas são mantidas. Isso não mexe no WhatsApp de verdade, só no que o DingDong guardou — não pode ser desfeito.",
      )
    ) {
      return;
    }
    setLimpandoTudo(true);
    try {
      await api.apagarTodasConversas(empresaId);
      setSelecionada(null);
      setMensagens([]);
      await carregarLista();
    } finally {
      setLimpandoTudo(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {conversas.length} conversa{conversas.length === 1 ? "" : "s"}
          </span>
          {conversas.length > 0 && (
            <button
              onClick={limparTudo}
              disabled={limpandoTudo}
              title="Apaga todas as conversas aqui no app (mantém as vendas) — não mexe no WhatsApp"
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              {limpandoTudo ? "Limpando…" : "Limpar tudo"}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
        {conversas.map((c) => (
          <button
            key={c.id}
            onClick={() => abrir(c)}
            className={`block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
              selecionada?.id === c.id ? "bg-slate-100 dark:bg-slate-800" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                {Boolean(c.nao_lida) && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                {c.nome || c.telefone}
              </span>
              {c.status === "vendido" && (
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">VENDIDO</span>
              )}
              {c.status === "venda_provavel" && (
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">VENDA PROVÁVEL</span>
              )}
            </div>
            <div className="mt-1">
              <BadgeOrigem origem={c.origem} />
            </div>
          </button>
        ))}
        {conversas.length === 0 && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Nenhuma conversa ainda.</p>
        )}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {!selecionada ? (
          <div className="grid flex-1 place-items-center text-sm text-slate-400 dark:text-slate-500">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="font-medium">{selecionada.nome || selecionada.telefone}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selecionada.telefone}</p>
                  <BadgeOrigem origem={selecionada.origem} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selecionada.status !== "vendido" && (
                  <form onSubmit={marcarVenda} className="flex items-center gap-2">
                    <input
                      value={valorVenda}
                      onChange={(e) => setValorVenda(e.target.value)}
                      placeholder="Valor da venda"
                      className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <button type="submit" className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white">
                      {selecionada.status === "venda_provavel" ? "Confirmar venda" : "Marcar venda"}
                    </button>
                    {selecionada.status === "venda_provavel" && (
                      <button
                        type="button"
                        onClick={descartarVendaProvavel}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        Não é venda
                      </button>
                    )}
                  </form>
                )}
                <button
                  type="button"
                  onClick={apagar}
                  title="Apagar conversa"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  Apagar
                </button>
              </div>
            </div>

            {selecionada.status === "venda_provavel" && (
              <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                Detectamos uma possível venda nessa conversa pela regra de palavra-chave. Confirme o valor e clique em
                "Confirmar venda", ou descarte se estiver errado.
              </p>
            )}
            {aviso && (
              <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                {aviso}
              </p>
            )}

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {mensagens.map((m) => (
                <div key={m.id} className={`flex ${m.de_mim ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                      m.de_mim
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {m.texto}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={enviar} className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva uma mensagem…"
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
              >
                Enviar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
