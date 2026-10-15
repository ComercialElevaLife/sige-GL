// Períodos do dashboard: ano, mês, trimestre, semestre ou intervalo personalizado.
// Um período é { type, year, month (0-11), quarter (1-4), semester (1-2), start, end } com start/end em "AAAA-MM-DD".
// periodRange devolve o intervalo [from, to) em datas locais, o rótulo e uma chave para nome de arquivo.
export const PERIOD_TYPES = [
  ["year", "Ano"],
  ["month", "Mês"],
  ["quarter", "Trimestre"],
  ["semester", "Semestre"],
  ["custom", "Personalizado"],
];

// Limite do servidor: 370 dias. Aqui usamos 366 (um ano) para a mensagem ser a mesma nos dois lados.
export const MAX_CUSTOM_DAYS = 366;
export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAY = 24 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, "0");

export const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export function parseIso(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}
const brDate = (date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// Monta um período do tipo informado que contém a data de referência.
function periodAt(type, reference, custom) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    type,
    year,
    month,
    quarter: Math.floor(month / 3) + 1,
    semester: month < 6 ? 1 : 2,
    start: custom?.start ?? toIso(new Date(year, month, 1)),
    end: custom?.end ?? toIso(reference),
  };
}

export const defaultPeriod = (today = new Date()) => periodAt("month", startOfDay(today));

export function periodRange(period) {
  const { type, year, month, quarter, semester } = period;
  if (type === "year") return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1), label: `${year}`, fileKey: `${year}` };
  if (type === "quarter") {
    const first = (quarter - 1) * 3;
    return { from: new Date(year, first, 1), to: new Date(year, first + 3, 1), label: `${quarter}º trimestre de ${year}`, fileKey: `${year}-T${quarter}` };
  }
  if (type === "semester") {
    const first = (semester - 1) * 6;
    return { from: new Date(year, first, 1), to: new Date(year, first + 6, 1), label: `${semester}º semestre de ${year}`, fileKey: `${year}-S${semester}` };
  }
  if (type === "custom") {
    const start = parseIso(period.start);
    const end = parseIso(period.end);
    const base = { from: start || new Date(NaN), to: end ? addDays(end, 1) : new Date(NaN), label: "Período personalizado", fileKey: "personalizado" };
    if (!start || !end) return { ...base, error: "Informe a data inicial e a final." };
    if (end < start) return { ...base, error: "A data final precisa ser igual ou posterior à inicial." };
    if ((end - start) / DAY + 1 > MAX_CUSTOM_DAYS) return { ...base, error: "Período máximo de 12 meses." };
    return { ...base, label: `${brDate(start)} a ${brDate(end)}`, fileKey: `${toIso(start).replaceAll("-", "")}-${toIso(end).replaceAll("-", "")}` };
  }
  return { from: new Date(year, month, 1), to: new Date(year, month + 1, 1), label: `${MONTH_NAMES[month]} de ${year}`, fileKey: `${year}-${pad(month + 1)}` };
}

// Anterior/próximo. O personalizado não tem setas.
export function shiftPeriod(period, delta) {
  const { type, year, month, quarter, semester } = period;
  if (type === "year") return { ...period, year: year + delta };
  if (type === "month") {
    const next = new Date(year, month + delta, 1);
    return { ...period, year: next.getFullYear(), month: next.getMonth() };
  }
  if (type === "quarter") {
    const index = year * 4 + (quarter - 1) + delta;
    return { ...period, year: Math.floor(index / 4), quarter: (index % 4) + 1 };
  }
  if (type === "semester") {
    const index = year * 2 + (semester - 1) + delta;
    return { ...period, year: Math.floor(index / 2), semester: (index % 2) + 1 };
  }
  return period;
}

// Só avança para períodos que já começaram.
export function canShift(period, delta, today = new Date()) {
  if (period.type === "custom") return false;
  if (delta < 0) return true;
  return periodRange(shiftPeriod(period, 1)).from <= startOfDay(today);
}

// Troca o tipo mantendo o "onde estou": o período que contém hoje, se hoje está no atual; senão o último dia do atual.
export function changePeriodType(period, type, today = new Date()) {
  if (period.type === type) return period;
  const now = startOfDay(today);
  const range = periodRange(period);
  const valid = !range.error;
  let reference = now;
  if (valid && !(now >= range.from && now < range.to)) reference = addDays(range.to, -1);
  if (type !== "custom") return periodAt(type, reference);
  // Personalizado: começa no início do período atual e vai até hoje (ou até o fim dele, se já passou).
  const first = valid ? range.from : new Date(now.getFullYear(), now.getMonth(), 1);
  let last = valid ? addDays(range.to, -1) : now;
  if (last > now) last = now;
  if (last < first) last = first;
  if ((last - first) / DAY + 1 > MAX_CUSTOM_DAYS) last = addDays(first, MAX_CUSTOM_DAYS - 1);
  return periodAt("custom", first, { start: toIso(first), end: toIso(last) });
}
