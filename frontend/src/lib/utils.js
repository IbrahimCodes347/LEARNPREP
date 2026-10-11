export const formatTime = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

export const formatPercent = (value) => `${Number(value ?? 0).toFixed(2)}%`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "09 Oct 2026, 11:21 PM" - fixed layout, matching the PDF report. */
export const formatReportDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  const hours24 = d.getHours();
  const hours = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  return (
    `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ` +
    `${String(hours).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`
  );
};

/** Pulls the server's message out of the envelope, falling back to something safe. */
export const apiErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const data = error?.response?.data;
  if (data?.errors?.length) {
    return data.errors.map((e) => `${e.field}: ${e.message}`).join(' · ');
  }
  return data?.message || fallback;
};

/** fetch, not a plain link, so the httpOnly cookie is sent and the page stays put. */
export const downloadFile = async (url, filename) => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

/** Minimal RFC-4180 CSV builder for the analytics export. */
export const toCsv = (rows, columns) => {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}`;
};

export const downloadCsv = (rows, columns, filename) => {
  downloadFileOfText(toCsv(rows, columns), filename);
};

const downloadFileOfText = (text, filename) => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];