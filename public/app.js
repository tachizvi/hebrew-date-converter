// Front end for the converter. It only talks to our own API
// (/api/convert, /api/convert-hebrew, /api/calendar, /api/workday), never to Hebcal directly.

import { getJson, longGregorian, withLang, workdayLabel } from './api.js';
import { getLang, locale, onLangChange, t } from './i18n.js';

const form = document.getElementById('convert-form');
const dateInput = document.getElementById('date');
const afterSunsetInput = document.getElementById('afterSunset');
const button = document.getElementById('submit');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');

const hebrewForm = document.getElementById('hebrew-form');
const hDay = document.getElementById('h-day');
const hMonth = document.getElementById('h-month');
const hYear = document.getElementById('h-year');
const hLeap = document.getElementById('h-leap');
const hButton = document.getElementById('h-submit');
const tabG2h = document.getElementById('tab-g2h');
const tabH2g = document.getElementById('tab-h2g');

const calGrid = document.getElementById('cal-grid');
const calTitle = document.getElementById('cal-title');
const calHebrewMonths = document.getElementById('cal-hebrew-months');
const calError = document.getElementById('cal-error');
const calMeta = document.getElementById('cal-meta');
const workdayEl = document.getElementById('workday');

/**
 * Hebrew months: `code` is what /api/convert-hebrew accepts, `hebcalName` is how
 * the API spells it in responses (mirrors src/lib/hebrewCalendar.ts).
 */
const HEBREW_MONTHS = [
  { code: 'Tishrei', hebcalName: 'Tishrei', hebrew: 'תשרי' },
  { code: 'Cheshvan', hebcalName: 'Cheshvan', hebrew: 'חשון' },
  { code: 'Kislev', hebcalName: 'Kislev', hebrew: 'כסלו' },
  { code: 'Tevet', hebcalName: 'Tevet', hebrew: 'טבת' },
  { code: 'Shvat', hebcalName: "Sh'vat", hebrew: 'שבט' },
  { code: 'Adar', hebcalName: 'Adar', hebrew: 'אדר', regularYearOnly: true },
  { code: 'Adar1', hebcalName: 'Adar I', hebrew: 'אדר א׳', leapYearOnly: true },
  { code: 'Adar2', hebcalName: 'Adar II', hebrew: 'אדר ב׳', leapYearOnly: true },
  { code: 'Nisan', hebcalName: 'Nisan', hebrew: 'ניסן' },
  { code: 'Iyyar', hebcalName: 'Iyyar', hebrew: 'אייר' },
  { code: 'Sivan', hebcalName: 'Sivan', hebrew: 'סיון' },
  { code: 'Tamuz', hebcalName: 'Tamuz', hebrew: 'תמוז' },
  { code: 'Av', hebcalName: 'Av', hebrew: 'אב' },
  { code: 'Elul', hebcalName: 'Elul', hebrew: 'אלול' },
];

/** Hebrew numerals for days 1-30. */
const HEBREW_DAYS = (
  'א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ז׳ ח׳ ט׳ י׳ י״א י״ב י״ג י״ד ט״ו ט״ז י״ז י״ח י״ט כ׳ ' +
  'כ״א כ״ב כ״ג כ״ד כ״ה כ״ו כ״ז כ״ח כ״ט ל׳'
).split(' ');

/** Same 19-year-cycle rule as the server (src/lib/hebrewCalendar.ts). */
const isHebrewLeapYear = (year) => (7 * year + 1) % 19 < 7;

const state = {
  /** 'g2h' (Gregorian -> Hebrew) or 'h2g' (Hebrew -> Gregorian) */
  mode: 'g2h',
  /** Hebrew date of the last result, used to prefill the Hebrew form. */
  lastHebrew: null,
  /** The last successful result and its mode, re-rendered when the language changes. */
  lastResult: null,
  /** YYYY-MM of the calendar currently shown */
  shownMonth: null,
  /**
   * Incremented on every request. A response is only rendered if it belongs to
   * the latest request, so fast clicking can't show an older, slower answer.
   */
  convertSeq: 0,
  calendarSeq: 0,
};

// ---------- helpers ----------

const pad = (n) => String(n).padStart(2, '0');

/**
 * Today's date as YYYY-MM-DD in the *user's* time zone.
 * (new Date().toISOString() would use UTC and can be off by a day.)
 */
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11" -> "2026-12" (delta = +1) or "2026-10" (delta = -1). */
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${pad((index % 12) + 1)}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(0);
  d.setUTCFullYear(y, m - 1, 1);
  return new Intl.DateTimeFormat(locale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** Weekday headers (Sunday first) in the UI language. 2023-01-01 was a Sunday. */
function renderWeekdays() {
  const fmt = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' });
  document.getElementById('cal-weekdays').replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => {
      const span = document.createElement('span');
      span.textContent = fmt.format(new Date(Date.UTC(2023, 0, 1 + i)));
      return span;
    }),
  );
}

/**
 * Wraps Latin text (dates, "1 Kislev 5787") in a left-to-right <bdi>, so it keeps
 * its order inside a right-to-left (Hebrew) page.
 */
function ltr(text) {
  const el = document.createElement('bdi');
  el.dir = 'ltr';
  el.textContent = text;
  return el;
}

// ---------- single date ----------

function setLoading(isLoading) {
  for (const b of [button, hButton]) {
    b.disabled = isLoading;
    b.setAttribute('aria-busy', String(isLoading));
    b.querySelector('.label').textContent = isLoading ? t('converting') : t('convert');
  }
}

function showError(message) {
  resultEl.hidden = true;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function showResult(data, mode) {
  errorEl.hidden = true;
  state.lastHebrew = data.hebrew;
  state.lastResult = { data, mode };

  // textContent (not innerHTML) so nothing from the API can inject markup.
  const primary = document.getElementById('primary');
  const secondary = document.getElementById('secondary');
  const transliteration = `${data.hebrew.day} ${data.hebrew.month} ${data.hebrew.year}`;

  if (mode === 'h2g') {
    primary.lang = getLang();
    primary.dir = getLang() === 'he' ? 'rtl' : 'ltr';
    primary.textContent = longGregorian(data.gregorian.date);
    // <bdi> keeps the Hebrew text's direction from scrambling the English around it.
    const heb = document.createElement('bdi');
    heb.lang = 'he';
    heb.textContent = data.hebrew.hebrewText;
    secondary.replaceChildren(heb, ' · ', ltr(transliteration));
  } else {
    primary.lang = 'he';
    primary.dir = 'rtl';
    primary.textContent = data.hebrew.hebrewText;
    secondary.replaceChildren(ltr(transliteration));
  }

  const list = document.getElementById('events');
  list.replaceChildren();
  if (data.events.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = t('noEvents');
    list.append(li);
  } else {
    for (const event of data.events) {
      const li = document.createElement('li');
      li.textContent = event;
      list.append(li);
    }
  }

  document
    .getElementById('meta')
    .replaceChildren(
      ...(mode === 'h2g'
        ? [ltr(`${transliteration} → ${data.gregorian.date}`)]
        : [ltr(data.gregorian.date), data.gregorian.afterSunset ? t('afterSunsetNote') : '']),
      ' · ',
      data.cached ? t('servedFromCache') : t('fetchedFromHebcal'),
    );

  resultEl.hidden = false;
}

async function convert() {
  const date = dateInput.value;
  if (!date) {
    showError(t('INVALID_DATE'));
    return;
  }

  // Show the month of the selected date (only fetches if the month changed).
  const month = date.slice(0, 7);
  if (month !== state.shownMonth) loadCalendar(month);
  else highlightSelected();

  const params = new URLSearchParams({ date });
  if (afterSunsetInput.checked) params.set('afterSunset', 'true');

  const seq = ++state.convertSeq;
  setLoading(true);
  try {
    const data = await getJson(withLang(`/api/convert?${params}`));
    if (seq === state.convertSeq) {
      showResult(data, 'g2h');
      showWorkday(data.gregorian.date, seq);
    }
  } catch (err) {
    if (seq === state.convertSeq) showError(err.message);
  } finally {
    if (seq === state.convertSeq) setLoading(false);
  }
}

/**
 * Adds the Israeli workday status under a result. It's extra information, so
 * if it fails (or the year is outside the supported range) the badge is just hidden.
 */
async function showWorkday(date, seq) {
  workdayEl.hidden = true;
  try {
    const w = await getJson(`/api/workday?date=${date}`);
    if (seq !== state.convertSeq) return;
    workdayEl.textContent = workdayLabel(w);
    workdayEl.className = `workday-badge day-${w.dayType}`;
    workdayEl.hidden = false;
  } catch {
    // Not critical: leave the badge hidden.
  }
}

// ---------- Hebrew -> Gregorian ----------

/** Rebuilds the month list for the chosen year: Adar, or Adar I + Adar II in a leap year. */
function fillHebrewMonths() {
  const year = Number(hYear.value);
  const leap = isHebrewLeapYear(year);
  let selected = hMonth.value;
  // Keep a sensible selection when switching between leap and regular years.
  if (leap && selected === 'Adar') selected = 'Adar2';
  if (!leap && (selected === 'Adar1' || selected === 'Adar2')) selected = 'Adar';

  hMonth.replaceChildren(
    ...HEBREW_MONTHS.filter((m) => (leap ? !m.regularYearOnly : !m.leapYearOnly)).map((m) => {
      if (getLang() === 'he') return new Option(m.hebrew, m.code);
      const label = m.hebcalName === 'Adar I' || m.hebcalName === 'Adar II' ? m.hebcalName : m.code;
      return new Option(`${label} · ${m.hebrew}`, m.code);
    }),
  );
  if (selected) hMonth.value = selected;
  hLeap.textContent = Number.isInteger(year) ? t(leap ? 'leapYear' : 'regularYear', { year }) : '';
}

/**
 * Day options. In English: "1 · א׳" - the left-to-right mark (\u200E) stops the
 * browser's bidi algorithm from reordering it to "א׳ · 1". In Hebrew: "א׳ (1)".
 */
function fillHebrewDays() {
  const selected = hDay.value;
  hDay.replaceChildren(
    ...HEBREW_DAYS.map((letters, i) =>
      getLang() === 'he'
        ? new Option(`${letters} (${i + 1})`, String(i + 1))
        : new Option(`\u200E${i + 1} · ${letters}`, String(i + 1)),
    ),
  );
  if (selected) hDay.value = selected;
}

function prefillHebrewForm() {
  const h = state.lastHebrew;
  if (!h) return;
  hYear.value = h.year;
  fillHebrewMonths();
  const month = HEBREW_MONTHS.find((m) => m.hebcalName === h.month);
  if (month) hMonth.value = month.code;
  hDay.value = String(h.day);
}

async function convertFromHebrew() {
  const params = new URLSearchParams({ year: hYear.value, month: hMonth.value, day: hDay.value });

  const seq = ++state.convertSeq;
  setLoading(true);
  try {
    const data = await getJson(withLang(`/api/convert-hebrew?${params}`));
    if (seq !== state.convertSeq) return;
    showResult(data, 'h2g');
    showWorkday(data.gregorian.date, seq);
    // Keep the rest of the page in sync: Gregorian input + calendar on that day.
    dateInput.value = data.gregorian.date;
    const month = data.gregorian.date.slice(0, 7);
    if (month !== state.shownMonth) loadCalendar(month);
    else highlightSelected();
  } catch (err) {
    if (seq === state.convertSeq) showError(err.message);
  } finally {
    if (seq === state.convertSeq) setLoading(false);
  }
}

function setMode(mode) {
  state.mode = mode;
  tabG2h.setAttribute('aria-selected', String(mode === 'g2h'));
  tabH2g.setAttribute('aria-selected', String(mode === 'h2g'));
  form.hidden = mode !== 'g2h';
  hebrewForm.hidden = mode !== 'h2g';
  if (mode === 'h2g') prefillHebrewForm();
}

// ---------- month calendar ----------

/**
 * Which event to print inside a day cell. Hebcal lists the week's Torah portion
 * on every day, which would clutter the grid, so it is shown on Shabbat only.
 */
function cellEvent(day) {
  const special = day.events.filter((e) => !isParasha(e));
  if (special.length > 0) return special[0];
  if (day.weekday === 6) return day.events.find(isParasha) ?? '';
  return '';
}

/** "Parashat Toldot" or, with lang=he, "פָּרָשַׁת תּוֹלְדוֹת" (nikud stripped before comparing). */
function isParasha(event) {
  return event.startsWith('Parashat ') || event.replace(/[\u0591-\u05C7]/g, '').startsWith('פרשת');
}

/** e.g. "חשון – כסלו תשפ״ז", or "אלול תשפ״ו – תשרי תשפ״ז" across a Hebrew new year. */
function hebrewMonthsLabel(days) {
  const spans = [];
  for (const d of days) {
    const { month, year } = d.hebrew.parts;
    const last = spans.at(-1);
    if (!last || last.month !== month) spans.push({ month, year });
  }
  const sameYear = spans.every((s) => s.year === spans[0].year);
  return sameYear
    ? `${spans.map((s) => s.month).join(' – ')} ${spans[0].year}`
    : spans.map((s) => `${s.month} ${s.year}`).join(' – ');
}

function renderCalendar(data, workdays) {
  const today = todayLocal();
  calTitle.textContent = monthLabel(data.month);
  calHebrewMonths.textContent = hebrewMonthsLabel(data.days);

  const cells = [];
  // Empty cells before day 1 so it lands under the right weekday (Sunday first).
  for (let i = 0; i < data.days[0].weekday; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    cells.push(blank);
  }

  for (const day of data.days) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    cell.dataset.date = day.date;
    if (day.date === today) cell.classList.add('today');
    const work = workdays?.get(day.date);
    if (work) cell.classList.add(`day-${work.dayType}`);

    const event = cellEvent(day);

    const nums = document.createElement('span');
    nums.className = 'cal-nums';
    const greg = document.createElement('span');
    greg.className = 'cal-greg';
    greg.textContent = String(Number(day.date.slice(8)));
    const heb = document.createElement('span');
    heb.className = 'cal-heb';
    heb.lang = 'he';
    heb.dir = 'rtl';
    heb.textContent = day.hebrew.parts.day;
    nums.append(greg, heb);

    const ev = document.createElement('span');
    ev.className = 'cal-event';
    ev.textContent = event;

    cell.append(nums, ev);
    cell.title = [day.hebrew.hebrewText, ...day.events, work ? workdayLabel(work) : '']
      .filter(Boolean)
      .join('\n');
    cell.setAttribute(
      'aria-label',
      `${day.date}, ${day.hebrew.day} ${day.hebrew.month} ${day.hebrew.year}` +
        (day.events.length ? `, ${day.events.join(', ')}` : '') +
        (work ? `, ${workdayLabel(work)}` : ''),
    );
    cells.push(cell);
  }

  calGrid.replaceChildren(...cells);
  calMeta.textContent = t('calMeta', {
    n: data.days.length,
    source: data.cached ? t('servedFromCache') : t('fetchedFromHebcal'),
  });
  highlightSelected();
}

function highlightSelected() {
  for (const cell of calGrid.querySelectorAll('.cal-day.selected')) {
    cell.classList.remove('selected');
    cell.removeAttribute('aria-selected');
  }
  const selected = calGrid.querySelector(`[data-date="${dateInput.value}"]`);
  if (selected) {
    selected.classList.add('selected');
    selected.setAttribute('aria-selected', 'true');
  }
}

async function loadCalendar(month) {
  state.shownMonth = month;
  const seq = ++state.calendarSeq;
  calGrid.setAttribute('aria-busy', 'true');
  calError.hidden = true;
  calTitle.textContent = monthLabel(month);

  try {
    // Both requests in parallel. The workday colouring is optional: if it fails,
    // the calendar still renders without it.
    const [calendar, workdays] = await Promise.allSettled([
      getJson(withLang(`/api/calendar?month=${month}`)),
      getJson(`/api/workday/month?month=${month}`),
    ]);
    if (seq !== state.calendarSeq) return;
    if (calendar.status === 'rejected') throw calendar.reason;
    const workdayMap =
      workdays.status === 'fulfilled' ? new Map(workdays.value.days.map((d) => [d.date, d])) : null;
    renderCalendar(calendar.value, workdayMap);
  } catch (err) {
    if (seq !== state.calendarSeq) return;
    calGrid.replaceChildren();
    calHebrewMonths.textContent = ' ';
    calMeta.textContent = '';
    calError.textContent = err.message;
    calError.hidden = false;
  } finally {
    if (seq === state.calendarSeq) calGrid.setAttribute('aria-busy', 'false');
  }
}

// ---------- events ----------

form.addEventListener('submit', (event) => {
  event.preventDefault();
  convert();
});

// Picking a date in the input converts it right away.
dateInput.addEventListener('change', () => {
  if (dateInput.value) convert();
});

// Clicking a day in the calendar selects and converts it (Gregorian -> Hebrew).
calGrid.addEventListener('click', (event) => {
  const cell = event.target.closest('.cal-day[data-date]');
  if (!cell) return;
  dateInput.value = cell.dataset.date;
  setMode('g2h');
  convert();
});

hebrewForm.addEventListener('submit', (event) => {
  event.preventDefault();
  convertFromHebrew();
});
hYear.addEventListener('input', fillHebrewMonths);
tabG2h.addEventListener('click', () => setMode('g2h'));
tabH2g.addEventListener('click', () => setMode('h2g'));

fillHebrewDays();

document
  .getElementById('cal-prev')
  .addEventListener('click', () => loadCalendar(shiftMonth(state.shownMonth, -1)));
document
  .getElementById('cal-next')
  .addEventListener('click', () => loadCalendar(shiftMonth(state.shownMonth, 1)));

/**
 * Language switch: re-render everything that holds translated text, and ask the
 * API again so holiday names come back in the new language (cached separately).
 */
onLangChange(() => {
  renderWeekdays();
  fillHebrewDays();
  fillHebrewMonths();
  if (state.shownMonth) loadCalendar(state.shownMonth);
  if (state.lastResult?.mode === 'h2g') convertFromHebrew();
  else if (dateInput.value) convert();
});

renderWeekdays();
dateInput.value = todayLocal();
convert();
