// "Tools" card: Israeli business-day calculator and batch conversion.

import { getJson, longGregorian, postJson } from './api.js';

const MAX_BATCH = 100;

// ---------- tabs ----------

const tabs = [
  {
    tab: document.getElementById('tab-workdays'),
    panel: document.getElementById('workdays-panel'),
  },
  { tab: document.getElementById('tab-batch'), panel: document.getElementById('batch-panel') },
];
for (const { tab } of tabs) {
  tab.addEventListener('click', () => {
    for (const t of tabs) {
      t.tab.setAttribute('aria-selected', String(t.tab === tab));
      t.panel.hidden = t.tab !== tab;
    }
  });
}

function setBusy(button, busy, idleLabel) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.querySelector('.label').textContent = busy ? 'Working…' : idleLabel;
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

// ---------- business days ----------

const wdForm = document.getElementById('workdays-form');
const wdFrom = document.getElementById('wd-from');
const wdDays = document.getElementById('wd-days');
const wdButton = document.getElementById('wd-submit');
const wdResult = document.getElementById('wd-result');
const wdError = document.getElementById('wd-error');

// Start from the date selected in the converter above (app.js fills it with today, local time).
wdFrom.value = document.getElementById('date').value;

wdForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(wdError, '');
  wdResult.hidden = true;
  const params = new URLSearchParams({ date: wdFrom.value, days: wdDays.value });

  setBusy(wdButton, true, 'Calculate');
  try {
    const data = await getJson(`/api/workday/add?${params}`);

    const title = document.createElement('p');
    title.className = 'primary';
    title.textContent = longGregorian(data.result.date);

    const summary = document.createElement('p');
    summary.className = 'secondary';
    summary.textContent =
      `${data.workdays} business day${data.workdays === 1 ? '' : 's'} after ` +
      `${longGregorian(data.from, { weekday: 'short' })}` +
      (data.skipped.length ? ` · ${data.skipped.length} non-working days skipped:` : '');

    const list = document.createElement('ul');
    list.className = 'skipped';
    for (const day of data.skipped) {
      const li = document.createElement('li');
      li.textContent = `${longGregorian(day.date, { year: undefined, weekday: 'short' })} — ${day.reason}`;
      list.append(li);
    }

    wdResult.replaceChildren(title, summary, ...(data.skipped.length ? [list] : []));
    wdResult.hidden = false;
  } catch (err) {
    showError(wdError, err.message);
  } finally {
    setBusy(wdButton, false, 'Calculate');
  }
});

// ---------- batch convert ----------

const batchInput = document.getElementById('batch-input');
const batchFile = document.getElementById('batch-file');
const batchButton = document.getElementById('batch-submit');
const batchError = document.getElementById('batch-error');
const batchResult = document.getElementById('batch-result');
const batchSummary = document.getElementById('batch-summary');
const batchRows = document.getElementById('batch-rows');
const batchDownload = document.getElementById('batch-download');

let lastBatch = null;

/** Splits pasted text or a simple CSV into date strings (first column if there are several). */
function parseDates(text) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => (line.includes(',') && !/;|\t/.test(line) ? line.split(',') : [line]))
    .map((v) => v.trim().replace(/^"|"$/g, ''))
    .filter((v) => v && !/^date$/i.test(v)); // skip blanks and a "date" header
}

batchFile.addEventListener('change', async () => {
  const file = batchFile.files?.[0];
  if (!file) return;
  batchInput.value = parseDates(await file.text()).join('\n');
  batchFile.value = '';
});

batchButton.addEventListener('click', async () => {
  showError(batchError, '');
  const dates = parseDates(batchInput.value);
  if (dates.length === 0) return showError(batchError, 'Enter at least one date.');
  if (dates.length > MAX_BATCH) {
    return showError(
      batchError,
      `At most ${MAX_BATCH} dates per batch (you entered ${dates.length}).`,
    );
  }

  setBusy(batchButton, true, 'Convert all');
  try {
    lastBatch = await postJson('/api/convert/batch', { dates });
    renderBatch(lastBatch);
  } catch (err) {
    batchResult.hidden = true;
    showError(batchError, err.message);
  } finally {
    setBusy(batchButton, false, 'Convert all');
  }
});

function cell(text, attrs = {}) {
  const td = document.createElement('td');
  td.textContent = text;
  Object.assign(td, attrs);
  return td;
}

function renderBatch(data) {
  const { total, succeeded, failed, uniqueConverted } = data.summary;
  batchSummary.textContent =
    `${succeeded} of ${total} converted` +
    (failed ? `, ${failed} failed` : '') +
    ` · ${uniqueConverted} distinct date${uniqueConverted === 1 ? '' : 's'}`;

  batchRows.replaceChildren(
    ...data.results.map((r) => {
      const tr = document.createElement('tr');
      if (r.ok) {
        const h = r.result.hebrew;
        tr.append(
          cell(r.input),
          cell(h.hebrewText, { lang: 'he', dir: 'rtl' }),
          cell(
            `${h.day} ${h.month} ${h.year}` +
              (r.result.events.length ? ` · ${r.result.events.join(', ')}` : ''),
          ),
        );
      } else {
        tr.className = 'failed';
        tr.append(cell(r.input), cell('—'), cell(r.error.message));
      }
      return tr;
    }),
  );
  batchResult.hidden = false;
}

/** Quotes a CSV field when needed (RFC 4180). */
function csvField(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

batchDownload.addEventListener('click', () => {
  if (!lastBatch) return;
  const header = [
    'input',
    'status',
    'hebrew_date',
    'hebrew_year',
    'hebrew_month',
    'hebrew_day',
    'events',
    'error',
  ];
  const lines = lastBatch.results.map((r) =>
    r.ok
      ? [
          r.input,
          'ok',
          r.result.hebrew.hebrewText,
          r.result.hebrew.year,
          r.result.hebrew.month,
          r.result.hebrew.day,
          r.result.events.join('; '),
          '',
        ]
      : [r.input, 'error', '', '', '', '', '', r.error.message],
  );
  // BOM so Excel opens the Hebrew text as UTF-8.
  const csv = '﻿' + [header, ...lines].map((row) => row.map(csvField).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hebrew-dates.csv';
  a.click();
  URL.revokeObjectURL(url);
});
