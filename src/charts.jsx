import { GOALS } from "./indicators";

// Gráficos em SVG puro (sem biblioteca): leves, imprimíveis e com as cores do padrão ElevaLife.
const W = 640;
const H = 200;
const M = { l: 42, r: 16, t: 16, b: 32 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const fmt = (value) => `${Math.round(value)}%`;

const xAt = (index, count) => (count <= 1 ? M.l + PW / 2 : M.l + (PW * index) / (count - 1));
const yPct = (value) => M.t + PH - (Math.min(100, Math.max(0, value)) / 100) * PH;
const everyNth = (count) => Math.max(1, Math.ceil(count / 10));

function Empty({ text }) {
  return (
    <text className="ax-empty" x={W / 2} y={M.t + PH / 2} textAnchor="middle">
      {text}
    </text>
  );
}

// Presença e adesão ao longo do período, com a meta de adesão tracejada.
export function TrendChart({ series }) {
  const hasAny = series.some((point) => point.hasSlots);
  const n = series.length;
  const path = (field) => {
    let d = "";
    let open = false;
    series.forEach((point, index) => {
      if (!point.hasSlots) {
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${xAt(index, n).toFixed(1)},${yPct(point[field]).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };
  return (
    <svg className="dv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução da presença e da adesão no período">
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line className="ax-grid" x1={M.l} x2={W - M.r} y1={yPct(tick)} y2={yPct(tick)} />
          <text className="ax-text" x={M.l - 8} y={yPct(tick) + 4} textAnchor="end">{tick}%</text>
        </g>
      ))}
      <line className="ax-goal" x1={M.l} x2={W - M.r} y1={yPct(GOALS.adherence)} y2={yPct(GOALS.adherence)} />
      {series.map((point, index) => (index % everyNth(n) === 0 ? <text key={point.key} className="ax-text" x={xAt(index, n)} y={H - 10} textAnchor="middle">{point.label}</text> : null))}
      {hasAny ? (
        <>
          <path className="ln-a" d={path("adherenceRate")} />
          <path className="ln-p" d={path("presentRate")} />
          {series.map((point, index) =>
            point.hasSlots ? (
              <g key={point.key}>
                <circle className="pt-a" cx={xAt(index, n)} cy={yPct(point.adherenceRate)} r="4" />
                <circle className="pt-p" cx={xAt(index, n)} cy={yPct(point.presentRate)} r="4">
                  <title>{`${point.fullLabel}: presença ${fmt(point.presentRate)} (${point.present} de ${point.slots} vagas), adesão ${fmt(point.adherenceRate)}`}</title>
                </circle>
              </g>
            ) : null,
          )}
        </>
      ) : (
        <Empty text="Sem aulas aplicadas no período" />
      )}
    </svg>
  );
}

const niceMax = (value) => (value <= 40 ? Math.max(4, Math.ceil(value / 4) * 4) : Math.ceil(value / 10) * 10);

// Aulas previstas × aplicadas por coluna do período.
export function ClassesChart({ series }) {
  const n = series.length;
  const max = niceMax(Math.max(0, ...series.map((point) => Math.max(point.planned, point.applied))));
  const y = (value) => M.t + PH - (value / max) * PH;
  const slot = n ? PW / n : PW;
  const bar = Math.min(26, slot * 0.34);
  const hasAny = series.some((point) => point.planned > 0 || point.applied > 0);
  const ticks = [0, max / 2, max];
  return (
    <svg className="dv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aulas previstas e aplicadas no período">
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="ax-grid" x1={M.l} x2={W - M.r} y1={y(tick)} y2={y(tick)} />
          <text className="ax-text" x={M.l - 8} y={y(tick) + 4} textAnchor="end">{Math.round(tick)}</text>
        </g>
      ))}
      {series.map((point, index) => {
        const center = M.l + slot * index + slot / 2;
        return (
          <g key={point.key}>
            <rect className="bar-plan" x={center - bar - 1} width={bar} y={y(point.planned)} height={Math.max(0, M.t + PH - y(point.planned))} rx="3">
              <title>{`${point.fullLabel}: ${point.planned} previstas, ${point.applied} aplicadas, ${point.cancelled} canceladas`}</title>
            </rect>
            <rect className="bar-done" x={center + 1} width={bar} y={y(point.applied)} height={Math.max(0, M.t + PH - y(point.applied))} rx="3">
              <title>{`${point.fullLabel}: ${point.planned} previstas, ${point.applied} aplicadas, ${point.cancelled} canceladas`}</title>
            </rect>
            {n <= 12 && point.applied > 0 && (
              <text className="ax-val" x={center + 1 + bar / 2} y={y(point.applied) - 4} textAnchor="middle">{point.applied}</text>
            )}
            {index % everyNth(n) === 0 && <text className="ax-text" x={center} y={H - 10} textAnchor="middle">{point.label}</text>}
          </g>
        );
      })}
      {!hasAny && <Empty text="Sem aulas previstas ou aplicadas no período" />}
    </svg>
  );
}

// Ranking de presença por recorte (setor, turno, unidade ou empresa).
export function RankingBars({ rows, empty = "Sem aulas aplicadas no período." }) {
  const ranked = rows.filter((row) => row.slots > 0).slice(0, 8);
  if (!ranked.length) return <p className="dv-rank-empty">{empty}</p>;
  return (
    <ol className="dv-rank">
      {ranked.map((row) => (
        <li key={row.key}>
          <span className="dv-rank-name" title={row.label}>{row.label}</span>
          <span className="dv-rank-track" role="img" aria-label={`${row.label}: presença ${fmt(row.presentRate)}`}>
            <i style={{ width: `${row.presentRate}%` }} />
          </span>
          <b>{fmt(row.presentRate)}</b>
        </li>
      ))}
    </ol>
  );
}
