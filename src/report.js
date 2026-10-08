import { jsPDF } from 'jspdf';

const wine = [139, 58, 66];
const deep = [94, 42, 48];
const tint = [245, 239, 234];
const muted = [138, 122, 120];
const line = [234, 221, 224];
const rate = (value, total) => (total ? `${Math.round((value / total) * 100)}%` : '0%');
const nameOf = (list, id) => list.find((item) => item.id === id)?.name || '—';
const statusLabel = { present: 'Presente', absent: 'Ausente', missing: 'Faltante' };

export function generateDashboardReport({ data, people, classes, attendance, filter, planned }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = 210;
  const left = 16;
  const right = 194;
  const present = people.filter((person) => attendance[person.id]?.status === 'present').length;
  const absent = people.filter((person) => attendance[person.id]?.status === 'absent').length;
  const missing = people.length - present;
  const applied = classes.filter((item) => item.status === 'applied').length;
  const cancelled = classes.filter((item) => item.status === 'cancelled').length;
  const filterText = [
    filter.clientId && nameOf(data.clients, filter.clientId),
    filter.unitId && nameOf(data.units, filter.unitId),
    filter.sectorId && nameOf(data.sectors, filter.sectorId),
    filter.shift,
    filter.locationId && nameOf(data.locations, filter.locationId),
  ].filter(Boolean).join(' · ') || 'Visão geral';
  const sectorRows = Object.values(people.reduce((rows, person) => {
    const client = nameOf(data.clients, person.clientId);
    const sector = nameOf(data.sectors, person.sectorId);
    const key = `${client}|${sector}`;
    rows[key] ||= { client, sector, total: 0, present: 0, absent: 0 };
    rows[key].total += 1;
    if (attendance[person.id]?.status === 'present') rows[key].present += 1;
    if (attendance[person.id]?.status === 'absent') rows[key].absent += 1;
    return rows;
  }, {}));

  const footer = () => {
    pdf.setDrawColor(...line); pdf.line(left, 285, right, 285);
    pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.text('ElevaLife Saúde e Educação · SIGE GL', left, 290);
    pdf.text(`Página ${pdf.getNumberOfPages()}`, right, 290, { align: 'right' });
  };
  const top = (title, subtitle) => {
    pdf.setFillColor(...deep); pdf.rect(0, 0, width, 32, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.text('ElevaLife', left, 15);
    pdf.setFontSize(9); pdf.text(title.toUpperCase(), left, 23);
    pdf.setTextColor(...deep); pdf.setFontSize(15); pdf.text(title, left, 45);
    pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
    pdf.text(subtitle, left, 52);
    return 63;
  };
  const tableHead = (y, columns) => {
    pdf.setFillColor(...wine); pdf.rect(left, y, right - left, 8, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
    columns.forEach((column) => pdf.text(column.label.toUpperCase(), column.x, y + 5.2));
    return y + 8;
  };
  const newPage = (title, subtitle, columns) => {
    footer(); pdf.addPage(); const y = top(title, subtitle);
    return columns ? tableHead(y, columns) : y;
  };

  pdf.setFillColor(...deep); pdf.rect(0, 0, width, 43, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('ElevaLife', left, 18);
  pdf.setFontSize(11); pdf.text('RELATÓRIO DE INDICADORES — GINÁSTICA LABORAL', left, 27);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, left, 35);
  pdf.setTextColor(...deep); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.text('Resumo executivo', left, 58);
  pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.text(`Recorte analisado: ${filterText}`, left, 65);

  const cards = [
    ['Participantes', people.length], ['Presentes', present], ['Taxa de adesão', rate(present, people.length)],
    ['Aulas aplicadas', rate(applied, planned)], ['Cancelamentos', cancelled], ['Ausências registradas', absent],
  ];
  cards.forEach(([label, value], index) => {
    const x = left + (index % 3) * 60; const y = 74 + Math.floor(index / 3) * 30;
    pdf.setFillColor(...tint); pdf.roundedRect(x, y, 54, 23, 3, 3, 'F');
    pdf.setTextColor(...muted); pdf.setFontSize(7.5); pdf.text(label.toUpperCase(), x + 5, y + 7);
    pdf.setTextColor(...wine); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(String(value), x + 5, y + 17);
  });

  let y = 145;
  pdf.setTextColor(...deep); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text('Leitura dos indicadores', left, y); y += 8;
  pdf.setTextColor(...muted); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  [
    `Taxa de adesão: ${rate(present, people.length)} — meta de referência: 75%.`,
    `Taxa de aulas aplicadas: ${rate(applied, planned)} (${applied} de ${planned} previstas) — meta de referência: 90%.`,
    `Cancelamentos: ${cancelled} ocorrência(s), equivalentes a ${rate(cancelled, planned)} das aulas previstas.`,
    `Participantes sem presença confirmada: ${missing}, incluindo ${absent} ausência(s) lançada(s) manualmente.`,
  ].forEach((text) => { pdf.text(`• ${text}`, left + 2, y); y += 7; });

  y += 8; pdf.setTextColor(...deep); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text('Adesão por empresa e setor', left, y); y += 8;
  const sectorColumns = [{ label: 'Empresa / setor', x: 20 }, { label: 'Lista', x: 108 }, { label: 'Presentes', x: 132 }, { label: 'Adesão', x: 169 }];
  y = tableHead(y, sectorColumns);
  sectorRows.forEach((row, index) => {
    if (y > 273) y = newPage('Detalhamento por setor', filterText, sectorColumns);
    if (index % 2 === 0) { pdf.setFillColor(...tint); pdf.rect(left, y, right - left, 8, 'F'); }
    pdf.setTextColor(...deep); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    pdf.text(`${row.client} · ${row.sector}`, 20, y + 5.2);
    pdf.text(String(row.total), 112, y + 5.2); pdf.text(String(row.present), 141, y + 5.2); pdf.text(rate(row.present, row.total), 171, y + 5.2); y += 8;
  });

  const classColumns = [{ label: 'Data / situação', x: 20 }, { label: 'Empresa e aula', x: 61 }, { label: 'Validação', x: 143 }];
  y = newPage('Detalhamento das aulas', `${filterText} · ${classes.length} registro(s)`, classColumns);
  const classesSorted = [...classes].sort((a, b) => new Date(b.at) - new Date(a.at));
  classesSorted.forEach((item, index) => {
    if (y > 268) y = newPage('Detalhamento das aulas', filterText, classColumns);
    const date = item.at ? new Date(item.at).toLocaleDateString('pt-BR') : '—';
    const situation = item.status === 'applied' ? 'Aplicada' : `Cancelada: ${item.reason || '—'}`;
    if (index % 2 === 0) { pdf.setFillColor(...tint); pdf.rect(left, y, right - left, 13, 'F'); }
    pdf.setTextColor(...deep); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.text(date, 20, y + 4.8);
    pdf.setFont('helvetica', 'normal'); pdf.text(situation, 20, y + 9.6);
    pdf.text(pdf.splitTextToSize(`${nameOf(data.clients, item.clientId)} · ${nameOf(data.sectors, item.sectorId)} · ${item.shift}`, 72), 61, y + 4.8);
    pdf.setTextColor(...muted); pdf.setFontSize(6.5);
    pdf.text(item.certificate || (item.status === 'applied' ? 'Sem certificado' : 'Não aplicável'), 143, y + 4.8, { maxWidth: 47 });
    y += 13;
  });
  if (!classesSorted.length) { pdf.setTextColor(...muted); pdf.setFontSize(9); pdf.text('Não há aulas no recorte selecionado.', left, y + 5); }

  const participantColumns = [{ label: 'Participante', x: 20 }, { label: 'Empresa / setor', x: 74 }, { label: 'Turno', x: 136 }, { label: 'Status', x: 166 }];
  y = newPage('Detalhamento de participantes', `${filterText} · ${people.length} pessoa(s)`, participantColumns);
  people.forEach((person, index) => {
    if (y > 273) y = newPage('Detalhamento de participantes', filterText, participantColumns);
    const registration = attendance[person.id];
    if (index % 2 === 0) { pdf.setFillColor(...tint); pdf.rect(left, y, right - left, 8, 'F'); }
    pdf.setTextColor(...deep); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.6);
    pdf.text(pdf.splitTextToSize(person.name, 48), 20, y + 5.1);
    pdf.setTextColor(...muted); pdf.setFontSize(6.7); pdf.text(person.registration || person.document || '—', 20, y + 7.4);
    pdf.setTextColor(...deep); pdf.setFontSize(7.2);
    pdf.text(pdf.splitTextToSize(`${nameOf(data.clients, person.clientId)} · ${nameOf(data.sectors, person.sectorId)}`, 58), 74, y + 5.1);
    pdf.text(person.shift || '—', 136, y + 5.1);
    pdf.setTextColor(registration?.status === 'present' ? [46, 125, 91] : registration?.status === 'absent' ? [201, 130, 43] : wine);
    pdf.setFont('helvetica', 'bold'); pdf.text(statusLabel[registration?.status] || 'Faltante', 166, y + 5.1);
    y += 8;
  });
  footer();
  pdf.save(`relatorio-indicadores-gl-${new Date().toISOString().slice(0, 10)}.pdf`);
}
