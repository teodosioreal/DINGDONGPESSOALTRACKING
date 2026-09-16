import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

function formatarDuracao(segundos) {
  if (segundos == null) return "—";
  const s = Number(segundos);
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return min > 0 ? `${min}min ${seg}s` : `${seg}s`;
}

function formatarData(dataIso) {
  if (!dataIso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(dataIso + "Z"),
    );
  } catch {
    return dataIso;
  }
}

const RECOMENDADO = { cliques: 5, minutos: 5 };

export default function BloqueioIp() {
  const { empresaId } = useParams();
  const [visitas, setVisitas] = useState([]);
  const [config, setConfig] = useState(null);
  const [erro, setErro] = useState("");
  const [avisoConfig, setAvisoConfig] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState("");
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  async function carregar() {
    try {
      const r = await api.visitasIp(empresaId);
      setVisitas(r.visitas);
      setConfig(r.config);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [empresaId]);

  async function alternarBloqueio(ip, bloqueadoAtualmente) {
    setProcessando(ip);
    setErro("");
    try {
      if (bloqueadoAtualmente) {
        await api.desbloquearIp(empresaId, ip);
      } else {
        await api.bloquearIp(empresaId, ip);
      }
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setProcessando("");
    }
  }

  async function salvarConfig(e) {
    e.preventDefault();
    setSalvandoConfig(true);
    setErro("");
    setAvisoConfig("");
    try {
      await api.configurarBloqueioAuto(empresaId, config.ativo, Number(config.cliques), Number(config.minutos));
      setAvisoConfig("Critério salvo.");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoConfig(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bloqueio de IP</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Todo visitante que passa pelo script de rastreio aparece aqui com o IP, se veio de um anúncio e quanto
          tempo ficou no site. Bloquear um IP não mexe na sua campanha do Google Ads — é só interno: a partir daí,
          se esse IP fechar uma "venda" numa conversa, a conversão não é mais enviada. Você decide o critério (ex:
          muitas visitas rápidas do mesmo IP, tempo no site muito baixo, etc).
        </p>
      </div>

      {erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {erro}
        </p>
      )}

      {config && (
        <form
          onSubmit={salvarConfig}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Bloqueio automático</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={config.ativo}
                onChange={(e) => setConfig({ ...config, ativo: e.target.checked })}
                className="size-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              Ativado
            </label>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Se o mesmo IP fizer mais de <strong>X cliques vindos de anúncio</strong> em <strong>Y minutos</strong>,
            ele é bloqueado sozinho — sem precisar você olhar e clicar. O recomendado é{" "}
            <strong>
              {RECOMENDADO.cliques} cliques em {RECOMENDADO.minutos} minutos
            </strong>
            , mas o critério é todo seu.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Cliques</label>
              <input
                type="number"
                min={2}
                max={100}
                value={config.cliques}
                onChange={(e) => setConfig({ ...config, cliques: e.target.value })}
                className="w-24 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <span className="pb-2 text-sm text-slate-400 dark:text-slate-500">em</span>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Minutos</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={config.minutos}
                onChange={(e) => setConfig({ ...config, minutos: e.target.value })}
                className="w-24 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={salvandoConfig}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              Salvar critério
            </button>
            {(Number(config.cliques) === RECOMENDADO.cliques && Number(config.minutos) === RECOMENDADO.minutos) && (
              <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                Recomendado
              </span>
            )}
          </div>
          {avisoConfig && <p className="text-sm text-green-700 dark:text-green-400">{avisoConfig}</p>}
        </form>
      )}

      {carregando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : visitas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Ainda não há visitas registradas com IP. Confira se o script (t.js) está instalado no seu site.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Visitas</th>
                <th className="px-4 py-3">Tempo no site</th>
                <th className="px-4 py-3">Última visita</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visitas.map((v) => (
                <tr key={v.ip} className={v.bloqueado ? "bg-red-50/40 dark:bg-red-950/20" : ""}>
                  <td className="px-4 py-3 font-mono text-xs">{v.ip}</td>
                  <td className="px-4 py-3">
                    {v.veioDeAnuncio ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                        Veio de anúncio
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Direto/outro
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{v.visitas}</td>
                  <td className="px-4 py-3">{formatarDuracao(v.duracao_segundos)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatarData(v.ultima_visita)}</td>
                  <td className="px-4 py-3">
                    {v.bloqueado ? (
                      <div>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                          Bloqueado
                        </span>
                        {v.motivoBloqueio && (
                          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{v.motivoBloqueio}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Liberado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => alternarBloqueio(v.ip, v.bloqueado)}
                      disabled={processando === v.ip}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        v.bloqueado
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          : "bg-red-600 text-white hover:bg-red-700"
                      }`}
                    >
                      {v.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
