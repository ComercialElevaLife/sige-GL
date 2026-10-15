import { jsPDF } from "jspdf";
import { GOALS, monthLabel } from "./indicators";

// Relatório executivo: indicadores gerais, quadro por recorte e atenção por colaborador.
// Sem lista aula a aula nem pessoa a pessoa; cabe em 1 a 2 páginas.
const wine = [139, 58, 66];
const deep = [94, 42, 48];
const tint = [235, 217, 219];
const cream = [245, 239, 234];
const ink = [58, 42, 46];
const muted = [138, 122, 120];
const line = [234, 221, 224];
const ok = [46, 125, 91];
const warn = [201, 130, 43];
const bad = [178, 58, 72];

const W = 210;
const L = 16;
const R = 194;
const pct = (value) => `${Math.round(value)}%`;
const nameOf = (list, id) => list?.find((item) => item.id === id)?.name || "—";
const clip = (pdf, text, max) => {
  let out = String(text ?? "—");
  while (out.length > 1 && pdf.getTextWidth(out) > max) out = out.slice(0, -1);
  return out === String(text ?? "—") ? out : `${out.trimEnd()}…`;
};

export function generateExecutiveReport({ result, month, scopeText, labels = {}, generatedAt = new Date() }) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const t = result.totals;
  const c = result.classes;

  const footer = () => {
    pdf.setDrawColor(...line);
    pdf.line(L, 285, R, 285);
    pdf.setTextColor(...muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("ElevaLife · SIGE GL · Relatório executivo", L, 290);
    pdf.text(`Página ${pdf.getNumberOfPages()}`, R, 290, { align: "right" });
  };
  const header = (compact) => {
    pdf.setFillColor(...deep);
    pdf.rect(0, 0, W, compact ? 16 : 40, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    if (compact) {
      pdf.setFontSize(11);
      pdf.text(`ElevaLife · Ginástica Laboral · ${monthLabel(month)}`, L, 10);
      return 26;
    }
    pdf.setFontSize(20);
    pdf.text("ElevaLife", L, 16);
    pdf.setFontSize(10);
    pdf.text("RELATÓRIO EXECUTIVO · GINÁSTICA LABORAL", L, 25);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(`Emitido em ${generatedAt.toLocaleString("pt-BR")}`, L, 33);
    return 52;
  };
  const ensure = (y, need) => {
    if (y + need <= 278) return y;
    footer();
    pdf.addPage();
    return header(true);
  };
  const title = (text, y) => {
    pdf.setTextColor(...deep);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12.5);
    pdf.text(text, L, y);
    return y + 6;
  };
  const splitBar = (x, y, width, height, row) => {
    pdf.setFillColor(...tint);
    pdf.roundedRect(x, y, width, height, height / 2, height / 2, "F");
    if (!row.slots) return;
    const parts = [
      [row.presentRate, ok],
      [row.absentRate, warn],
      [row.missingRate, bad],
    ];
    let cursor = x;
    // Os extremos da barra ficam retos; o fundo arredondado já dá o acabamento.
    parts.forEach(([rate, color]) => {
      const w = (width * rate) / 100;
      if (w <= 0) return;
      pdf.setFillColor(...color);
      pdf.rect(cursor, y, w, height, "F");
      cursor += w;
    });
  };

  let y = header(false);
  pdf.setTextColor(...deep);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(monthLabel(month), L, y);
  y += 6;
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Recorte: ${scopeText || "Visão geral"}`, L, y);
  y += 10;

  // Indicadores gerais
  y = title("Indicadores gerais", y);
  const cards = [
    { label: "Adesão", value: pct(t.adherenceRate), note: `${t.adhered} de ${t.people} colaboradores`, goal: GOALS.adherence, reached: t.adherenceRate >= GOALS.adherence },
    { label: "Presença", value: pct(t.presentRate), note: `${t.present} de ${t.slots} vagas` },
    { label: "Aulas aplicadas", value: pct(c.appliedRate), note: `${c.applied} de ${c.planned} previstas`, goal: GOALS.applied, reached: c.appliedRate >= GOALS.applied },
    { label: "Cancelamentos", value: String(c.cancelled), note: `${pct(c.cancelledRate)} das previstas` },
  ];
  const cardW = (R - L - 3 * 4) / 4;
  cards.forEach((card, index) => {
    const x = L + index * (cardW + 4);
    pdf.setFillColor(...(index === 0 ? deep : cream));
    pdf.roundedRect(x, y, cardW, 30, 3, 3, "F");
    pdf.setTextColor(...(index === 0 ? [201, 154, 160] : muted));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(card.label.toUpperCase(), x + 4, y + 6.5);
    pdf.setTextColor(...(index === 0 ? [255, 255, 255] : wine));
    pdf.setFontSize(18);
    pdf.text(card.value, x + 4, y + 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...(index === 0 ? [233, 211, 214] : muted));
    pdf.text(clip(pdf, card.note, cardW - 8), x + 4, y + 21.5);
    if (card.goal != null) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...(card.reached ? (index === 0 ? [160, 230, 190] : ok) : index === 0 ? [255, 214, 150] : warn));
      pdf.text(`${card.reached ? "Meta atingida" : "Abaixo da meta"} · ${card.goal}%`, x + 4, y + 27);
    }
  });
  y += 38;

  // Vagas das aulas
  y = title("Como foram as vagas das aulas", y);
  splitBar(L, y, R - L, 6, t);
  y += 12;
  const legend = [
    ["Presença", t.presentRate, t.present, ok],
    ["Ausência", t.absentRate, t.absent, warn],
    ["Falta", t.missingRate, t.missing, bad],
  ];
  legend.forEach(([label, rate, count, color], index) => {
    const x = L + index * 60;
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y - 3, 3.5, 3.5, 0.8, 0.8, "F");
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(`${label} ${pct(rate)}`, x + 6, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...muted);
    pdf.text(`${count} de ${t.slots}`, x + 6, y + 4.2);
  });
  y += 14;

  // Quadro por recorte
  const COLS = { name: L, bar: 70, p: 117, a: 133, f: 149, adh: 165 };
  const tableHead = (label) => {
    pdf.setFillColor(...wine);
    pdf.rect(L, y, R - L, 7, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(label.toUpperCase(), COLS.name + 2, y + 4.7);
    pdf.text("DISTRIBUIÇÃO", COLS.bar, y + 4.7);
    pdf.text("PRESENÇA", COLS.p, y + 4.7);
    pdf.text("AUSÊNCIA", COLS.a, y + 4.7);
    pdf.text("FALTA", COLS.f, y + 4.7);
    pdf.text("ADESÃO", COLS.adh, y + 4.7);
    y += 7;
  };
  const breakdown = (heading, rows, label) => {
    if (!rows.length) return;
    y = ensure(y, 22);
    y = title(heading, y);
    tableHead(label);
    rows.forEach((row, index) => {
      if (y + 9 > 278) {
        y = ensure(y, 9);
        tableHead(label);
      }
      if (index % 2 === 0) {
        pdf.setFillColor(250, 246, 243);
        pdf.rect(L, y, R - L, 9, "F");
      }
      pdf.setTextColor(...ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.text(clip(pdf, row.label, COLS.bar - COLS.name - 6), COLS.name + 2, y + 5.8);
      splitBar(COLS.bar, y + 3, 40, 3, row);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...ink);
      const empty = !row.slots;
      pdf.text(empty ? "—" : `${pct(row.presentRate)} (${row.present})`, COLS.p, y + 5.8);
      pdf.text(empty ? "—" : `${pct(row.absentRate)} (${row.absent})`, COLS.a, y + 5.8);
      pdf.text(empty ? "—" : `${pct(row.missingRate)} (${row.missing})`, COLS.f, y + 5.8);
      pdf.text(row.people ? `${pct(row.adherenceRate)} (${row.adhered}/${row.people})` : "—", COLS.adh, y + 5.8);
      y += 9;
    });
    y += 7;
  };
  breakdown("Por setor", result.groups.sectorId, "Setor");
  breakdown("Por turno", result.groups.shift, "Turno");
  if (result.groups.unitId.length > 1) breakdown("Por unidade", result.groups.unitId, "Unidade");
  if (result.groups.clientId.length > 1) breakdown("Por empresa", result.groups.clientId, "Empresa");

  // Colaboradores: faixas de presença e quem pede atenção
  const people = result.collaborators;
  const withClass = people.filter((row) => row.slots);
  const bands = [
    ["Presença de 75% ou mais", withClass.filter((row) => row.presentRate >= 75).length, ok],
    ["Presença de 50% a 74%", withClass.filter((row) => row.presentRate >= 50 && row.presentRate < 75).length, warn],
    ["Presença abaixo de 50%", withClass.filter((row) => row.presentRate < 50).length, bad],
    ["Sem aulas aplicadas no período", people.length - withClass.length, muted],
  ];
  y = ensure(y, 40);
  y = title("Colaboradores", y);
  bands.forEach(([text, count, color]) => {
    pdf.setFillColor(...color);
    pdf.roundedRect(L, y - 3, 3.5, 3.5, 0.8, 0.8, "F");
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(text, L + 6, y);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${count} de ${people.length} · ${people.length ? pct((count / people.length) * 100) : "0%"}`, 110, y);
    y += 5.5;
  });
  y += 4;

  const attention = withClass.filter((row) => row.presentRate < GOALS.adherence).slice(0, 10);
  if (attention.length) {
    y = ensure(y, 30);
    pdf.setTextColor(...deep);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text(`Atenção: ${attention.length} ${attention.length === 1 ? "colaborador com menor presença" : "colaboradores com menor presença"}`, L, y);
    y += 4;
    pdf.setFillColor(...wine);
    pdf.rect(L, y, R - L, 7, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.text("COLABORADOR", L + 2, y + 4.7);
    pdf.text("SETOR", 82, y + 4.7);
    pdf.text("TURNO", 128, y + 4.7);
    pdf.text("PRESENÇA", 160, y + 4.7);
    y += 7;
    attention.forEach((row, index) => {
      y = ensure(y, 8);
      if (index % 2 === 0) {
        pdf.setFillColor(250, 246, 243);
        pdf.rect(L, y, R - L, 8, "F");
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...ink);
      pdf.text(clip(pdf, row.person.name || `Matrícula ${row.person.registration || "—"}`, 62), L + 2, y + 5.3);
      pdf.text(clip(pdf, nameOf(labels.sectors, row.person.sectorId), 42), 82, y + 5.3);
      pdf.text(clip(pdf, row.person.shift || "—", 28), 128, y + 5.3);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${pct(row.presentRate)} (${row.present}/${row.slots})`, 160, y + 5.3);
      y += 8;
    });
    if (withClass.filter((row) => row.presentRate < GOALS.adherence).length > attention.length) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...muted);
      pdf.text("Há mais colaboradores abaixo da meta; a lista completa está no dashboard.", L, y + 5);
      y += 7;
    }
  }

  // Notas de leitura
  y = ensure(y + 6, 28);
  pdf.setDrawColor(...line);
  pdf.line(L, y, R, y);
  y += 5;
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  [
    "Como ler: presença, ausência e falta são percentuais sobre as vagas das aulas aplicadas no mês (uma vaga = um colaborador da lista em uma aula).",
    "Ausência: marcado como ausente na aula. Falta: não marcado nem como presente nem como ausente. Adesão: colaboradores da lista com ao menos uma presença no mês.",
    `Aulas aplicadas: aulas fechadas ÷ aulas previstas na agenda do mês. Metas de referência: adesão ${GOALS.adherence}%, aulas aplicadas ${GOALS.applied}%.`,
  ].forEach((text) => {
    const lines = pdf.splitTextToSize(text, R - L);
    pdf.text(lines, L, y);
    y += lines.length * 3.6 + 1;
  });
  footer();
  return pdf;
}
