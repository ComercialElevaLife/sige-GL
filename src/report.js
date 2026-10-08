import { jsPDF } from 'jspdf';

const wine = [139, 58, 66];
const deep = [94, 42, 48];
const muted = [138, 122, 120];

const rate = (value, total) => (total ? `${Math.round((value / total) * 100)}%` : '0%');

export function generateDashboardReport({ data, people, classes, attendance, filter }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = 210;
  const present = people.filter((person) => attendance[person.id]?.status === 'present').length;
  const missing = people.length - present;
  const applied = classes.filter((item) => item.status === 'applied').length;
  const cancelled = classes.filter((item) => item.status === 'cancelled').length;
  const sectorRows = Object.values(people.reduce((rows, person) => {
    const sector = data.sectors.find((item) => item.id === person.sectorId)?.name || 'Sem setor';
    rows[sector] ||= { sector, total: 0, present: 0 };
    rows[sector].total += 1;
    if (attendance[person.id]?.status === 'present') rows[sector].present += 1;
    return rows;
  }, {}));

  pdf.setFillColor(...deep); pdf.rect(0, 0, width, 43, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.text('ElevaLife', 16, 18);
  pdf.setFontSize(11); pdf.text('RELATÓRIO DE INDICADORES — GINÁSTICA LABORAL', 16, 27);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 16, 35);
  pdf.setTextColor(...deep); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.text('Resumo executivo', 16, 58);
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...muted); pdf.setFontSize(9);
  const filterText = [filter.clientId && data.clients.find((item) => item.id === filter.clientId)?.name, filter.unitId && data.units.find((item) => item.id === filter.unitId)?.name, filter.sectorId && data.sectors.find((item) => item.id === filter.sectorId)?.name, filter.shift, filter.locationId && data.locations.find((item) => item.id === filter.locationId)?.name].filter(Boolean).join(' · ') || 'Visão geral';
  pdf.text(`Recorte analisado: ${filterText}`, 16, 65);

  const cards = [['Participantes', people.length], ['Presentes', present], ['Taxa de adesão', rate(present, people.length)], ['Aulas aplicadas', rate(applied, classes.length)], ['Cancelamentos', cancelled]];
  cards.forEach(([label, value], index) => { const x = 16 + (index % 3) * 60; const y = 74 + Math.floor(index / 3) * 30; pdf.setFillColor(245, 239, 234); pdf.roundedRect(x, y, 54, 23, 3, 3, 'F'); pdf.setTextColor(...muted); pdf.setFontSize(7.5); pdf.text(label.toUpperCase(), x + 5, y + 7); pdf.setTextColor(...wine); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(String(value), x + 5, y + 17); });

  let y = 145;
  pdf.setTextColor(...deep); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text('Adesão por setor', 16, y);
  y += 9;
  pdf.setFillColor(...wine); pdf.rect(16, y, 178, 8, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.text('SETOR', 20, y + 5.2); pdf.text('PARTICIPANTES', 91, y + 5.2); pdf.text('PRESENTES', 129, y + 5.2); pdf.text('ADESÃO', 166, y + 5.2);
  y += 8;
  sectorRows.forEach((row, index) => { if (index % 2 === 0) { pdf.setFillColor(245, 239, 234); pdf.rect(16, y, 178, 8, 'F'); } pdf.setTextColor(...deep); pdf.setFont('helvetica', 'normal'); pdf.text(row.sector, 20, y + 5.2); pdf.text(String(row.total), 101, y + 5.2); pdf.text(String(row.present), 140, y + 5.2); pdf.text(rate(row.present, row.total), 170, y + 5.2); y += 8; });
  y += 10; pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.text('Leitura dos indicadores', 16, y); y += 7; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
  pdf.text(`• Taxa de adesão: ${rate(present, people.length)} — meta de referência: 75%.`, 18, y); y += 6;
  pdf.text(`• Taxa de aulas aplicadas: ${rate(applied, classes.length)} — meta de referência: 90%.`, 18, y); y += 6;
  pdf.text(`• Há ${missing} participante(s) previsto(s) sem registro de presença no recorte selecionado.`, 18, y);
  pdf.setDrawColor(234, 221, 224); pdf.line(16, 285, 194, 285); pdf.setFontSize(7.5); pdf.text('ElevaLife Saúde e Educação · Relatório gerado pelo SIGE GL', 16, 290);
  pdf.save(`relatorio-indicadores-gl-${new Date().toISOString().slice(0, 10)}.pdf`);
}
