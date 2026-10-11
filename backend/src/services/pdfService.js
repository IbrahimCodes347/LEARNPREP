import PDFDocument from 'pdfkit';
import { ATTEMPT_STATUS } from '../utils/constants.js';

const MARGIN = 50;
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN') : '-');
const fmtPct = (n) => `${Number(n ?? 0).toFixed(2)}%`;

/** "09 Oct 2026, 11:21 PM" - deterministic, independent of server locale. */
function fmtReportDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  const hours24 = d.getHours();
  const hours = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  return (
    `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ` +
    `${String(hours).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
  );
}

/** Selected option as "B. Preemption" (falls back to the letter alone). */
function answerText(index, options) {
  if (index === null || index === undefined) return '-';
  const label = OPTION_LABELS[index] ?? String(index + 1);
  const text = options?.[index];
  return text ? `${label}. ${text}` : label;
}

function fmtDuration(sec) {
  const total = Math.max(0, Math.round(sec ?? 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Minimal bordered table. Measures each cell so wrapped option text stays
 * inside its column, and starts a new page when a row would overflow.
 */
function drawTable(doc, { x, width, columns, rows, showHeader = true }) {
  const padding = 4;
  const fontSize = 8;
  const bottom = doc.page.height - MARGIN;
  let y = doc.y;

  const measure = (text, colWidth) => {
    doc.font('Helvetica').fontSize(fontSize);
    return doc.heightOfString(String(text ?? ''), { width: colWidth - padding * 2 }) + padding * 2;
  };

  const drawRow = (cells, { bold = false, fill = null } = {}) => {
    const rowHeight = Math.max(14, ...cells.map((c, i) => measure(c, columns[i].width)));
    if (y + rowHeight > bottom) {
      doc.addPage();
      y = MARGIN;
    }
    if (fill) doc.rect(x, y, width, rowHeight).fill(fill);
    let cx = x;
    cells.forEach((cell, i) => {
      const col = columns[i];
      doc
        .fillColor('#0F172A')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .text(String(cell ?? ''), cx + padding, y + padding, {
          width: col.width - padding * 2,
          align: col.align ?? 'left'
        });
      cx += col.width;
    });
    doc.rect(x, y, width, rowHeight).stroke('#CBD5E1');
    y += rowHeight;
    doc.y = y;
  };

  if (showHeader) {
    drawRow(
      columns.map((c) => c.label),
      { bold: true, fill: '#E2E8F0' }
    );
  }
  rows.forEach((row, idx) => {
    drawRow(
      columns.map((c) => row[c.key]),
      { fill: idx % 2 ? '#F8FAFC' : null }
    );
  });

  doc.y = y;
  doc.fillColor('#0F172A').font('Helvetica').fontSize(10);
}

/**
 * Streams a result report card. Writes nothing to disk and never throws into
 * the request path - the caller pipes errors to the log.
 */
export function buildResultPdf({ attempt, user, test, result }) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  const chunks = [];

  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const x = MARGIN;
  const contentWidth = doc.page.width - MARGIN * 2;

  doc.fontSize(20).fillColor('#4F46E5').font('Helvetica-Bold').text('LearnPrep - Result Report', { align: 'center' });
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .fillColor('#0F172A')
    .font('Helvetica')
    .text(`${test.title ?? 'Test'}`, { align: 'center' })
    .text(
      `${test.subject ?? ''}${test.subject && test.durationMinutes ? ' - ' : ''}${test.durationMinutes ? `${test.durationMinutes} min` : ''}`,
      {
        align: 'center'
      }
    );
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(10).text('Details', x);
  doc.moveDown(0.2);
  drawTable(doc, {
    x,
    width: contentWidth,
    showHeader: false,
    columns: [
      { key: 'k', label: '', width: 130 },
      { key: 'v', label: '', width: contentWidth - 130 }
    ],
    rows: [
      { k: 'Student', v: user?.name ?? '-' },
      { k: 'Username', v: user?.username ?? user?.rollno ?? '-' },
      { k: 'Class', v: user?.grade ?? '-' },
      { k: 'Submitted at', v: fmtReportDate(attempt.submittedAt) },
      { k: 'Time taken', v: fmtDuration((new Date(attempt.submittedAt) - new Date(attempt.startedAt)) / 1000) }
    ]
  });

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10).text('Score', x);
  doc.moveDown(0.2);

  {
    const y0 = doc.y;
    const boxHeight = 54;
    const accent = result.passed === null ? '#0F172A' : result.passed ? '#16A34A' : '#DC2626';
    const background = result.passed === null ? '#F1F5F9' : result.passed ? '#DCFCE7' : '#FEE2E2';
    doc.rect(x, y0, contentWidth, boxHeight).fill(background);
    doc.rect(x, y0, contentWidth, boxHeight).stroke(accent);
    doc
      .fillColor(accent)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(`${result.score ?? 0} / ${result.totalMarks ?? 0}`, x + 12, y0 + 9, { width: contentWidth - 24 });
    doc
      .fontSize(11)
      .text(
        `${fmtPct(result.percentage)}${result.passed === null ? '' : result.passed ? '   Passed' : '   Failed'}`,
        x + 12,
        y0 + 33,
        { width: contentWidth - 24 }
      );
    doc.y = y0 + boxHeight;
  }

  doc.moveDown(0.4);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#0F172A')
    .text(
      `Correct: ${result.correct ?? 0}    Wrong: ${result.wrong ?? 0}    Unattempted: ${result.unattempted ?? 0}` +
        (test.passMarks !== null && test.passMarks !== undefined ? `    Pass marks: ${test.passMarks}` : '') +
        (test.negativeMarks ? `    Negative: ${test.negativeMarks}` : ''),
      x
    );

  if ((result.weakTopics ?? []).length) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text(`Weak topics: ${result.weakTopics.join(', ')}`, x);
    doc.font('Helvetica');
  }
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(12).text('Per-question review', x);
  doc.moveDown(0.3);

  const detail = result.detail ?? [];
  const marksWidth = contentWidth - 24 - 78 - 150 - 150 - 55;
  drawTable(doc, {
    x,
    width: contentWidth,
    columns: [
      { key: 'num', label: '#', width: 24 },
      { key: 'topic', label: 'Topic', width: 78 },
      { key: 'your', label: 'Your answer', width: 150 },
      { key: 'correct', label: 'Correct answer', width: 150 },
      { key: 'result', label: 'Result', width: 55 },
      { key: 'marks', label: 'Marks', width: marksWidth }
    ],
    rows: detail.map((row, i) => ({
      num: String(i + 1),
      topic: row.topic ?? '',
      your: answerText(row.selectedIndex, row.options),
      correct: answerText(row.correctIndex, row.options),
      result: row.isCorrect ? 'Correct' : row.selectedIndex === null ? 'Skipped' : 'Wrong',
      marks: `${row.awarded ?? 0}/${row.marks ?? 1}`
    }))
  });

  doc.moveDown(0.6);
  if (doc.y > doc.page.height - 90) doc.addPage();
  doc.fontSize(8).fillColor('#64748B').font('Helvetica').text('Generated by LearnPrep', x, doc.y, {
    align: 'center',
    width: contentWidth
  });

  doc.end();
  return { doc, done };
}

export function buildAttemptStatusPdf(attempt, user, test) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(20).fillColor('#4F46E5').text('LearnPrep - Attempt Summary', { align: 'center' });
  doc.moveDown(0.6);
  doc.fontSize(10).fillColor('#0F172A');
  [
    ['Student', user?.name ?? '-'],
    ['Test', test?.title ?? '-'],
    ['Status', attempt.status === ATTEMPT_STATUS.SUBMITTED ? 'Submitted' : 'In progress'],
    ['Started', fmtDate(attempt.startedAt)],
    ['Deadline', fmtDate(attempt.deadlineAt)],
    ['Submitted', fmtDate(attempt.submittedAt)]
  ].forEach(([k, v]) => doc.text(`${k}: ${v}`, MARGIN));

  doc.end();
  return { doc, done };
}

export default { buildResultPdf, buildAttemptStatusPdf };
