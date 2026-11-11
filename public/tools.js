// "Tools" card: Israeli business-day calculator and batch conversion.

import { getJson, longGregorian, postJson, workdayReason } from './api.js';
import { getLang, onLangChange, t } from './i18n.js';

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
    for (const other of tabs) {
      other.tab.setAttribute('aria-selected', String(other.tab === tab));
      other.panel.hidden = other.tab !== tab;
    }
  });
}

function setBusy(button, busy, idleKey) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.querySelector('.label').textContent = busy ? t('working') : t(idleKey);
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

let lastWorkdays = null;

function renderWorkdays(data) {
  const title = document.createElement('p');
  title.className = 'primary';
  title.textContent = longGregorian(data.result.date);

  // Hebrew date of the result (the API adds it; null if it was unavailable).
  const hebrew = document.createElement('p');
  hebrew.className = 'tool-hebrew';
  hebrew.lang = 'he';
  hebrew.dir = 'rtl';
  hebrew.textContent = data.resultHebrew?.hebrewText ?? '';

  const summary = document.createElement('p');
  summary.className = 'secondary';
  summary.textContent =
    t('wdSummary', { n: data.workdays, date: longGregorian(data.from, { weekday: 'short' }) }) +
    (data.skipped.length ? t('wdSkipped', { n: data.skipped.length }) : '');

  const list = document.createElement('ul');
  list.className = 'skipped';
  for (const day of data.skipped) {
    const li = document.createElement('li');
    li.textContent = `${longGregorian(day.date, { year: undefined, weekday: 'short' })} — ${workdayReason(day)}`;
    list.append(li);
  }

  wdResult.replaceChildren(
    title,
    ...(data.resultHebrew ? [hebrew] : []),
    summary,
    ...(data.skipped.length ? [list] : []),
  );
  wdResult.hidden = false;
}

wdForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(wdError, '');
  wdResult.hidden = true;
  const params = new URLSearchParams({ date: wdFrom.value, days: wdDays.value });

  setBusy(wdButton, true, 'calculate');
  try {
    lastWorkdays = await getJson(`/api/workday/add?${params}`);
    renderWorkdays(lastWorkdays);
  } catch (err) {
    showError(wdError, err.message);
  } finally {
    setBusy(wdButton, false, 'calculate');
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
  if (dates.length === 0) return showError(batchError, t('enterAtLeastOne'));
  if (dates.length > MAX_BATCH) {
    return showError(batchError, t('tooManyDates', { max: MAX_BATCH, n: dates.length }));
  }

  setBusy(batchButton, true, 'convertAll');
  try {
    lastBatch = await postJson('/api/convert/batch', { dates, lang: getLang() });
    renderBatch(lastBatch);
  } catch (err) {
    batchResult.hidden = true;
    showError(batchError, err.message);
  } finally {
    setBusy(batchButton, false, 'convertAll');
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
    t('batchSummary', { ok: succeeded, total }) +
    (failed ? t('batchFailed', { n: failed }) : '') +
    t('batchDistinct', { n: uniqueConverted });

  batchRows.replaceChildren(
    ...data.results.map((r) => {
      const tr = document.createElement('tr');
      if (r.ok) {
        // The Hebrew date column already names the date, so details only list events.
        tr.append(
          cell(r.input),
          cell(r.result.hebrew.hebrewText, { lang: 'he', dir: 'rtl' }),
          cell(r.result.events.length ? r.result.events.join(', ') : '—'),
        );
      } else {
        tr.className = 'failed';
        // The API's message is English; in Hebrew, lead with the translated error type.
        const message =
          getLang() === 'he' ? `${t(r.error.code)} (${r.error.message})` : r.error.message;
        tr.append(cell(r.input), cell('—'), cell(message));
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

// On a language switch, redraw the business-day result (it carries reasons in both
// languages) and clear the batch table (its holiday names are in the old language).
onLangChange(() => {
  if (lastWorkdays && !wdResult.hidden) renderWorkdays(lastWorkdays);
  batchResult.hidden = true;
  lastBatch = null;
  for (const el of [wdError, batchError]) showError(el, '');
});
