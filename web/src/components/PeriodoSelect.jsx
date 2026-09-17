export const PERIODOS = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7dias", rotulo: "Últimos 7 dias" },
  { valor: "30dias", rotulo: "Últimos 30 dias" },
  { valor: "este_mes", rotulo: "Este mês" },
  { valor: "mes_passado", rotulo: "Mês passado" },
  { valor: "todo_periodo", rotulo: "Todo período" },
];

export default function PeriodoSelect({ valor, onChange }) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    >
      {PERIODOS.map((p) => (
        <option key={p.valor} value={p.valor}>
          {p.rotulo}
        </option>
      ))}
    </select>
  );
}
