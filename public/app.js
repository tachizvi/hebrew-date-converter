// Front end for the converter. It only talks to our own API
// (/api/convert, /api/convert-hebrew and /api/calendar), never to Hebcal directly.

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

/** Friendly messages per API error code. */
const ERROR_MESSAGES = {
  INVALID_DATE: 'Please enter a valid date.',
  UPSTREAM_UNAVAILABLE:
    'The Hebrew calendar service is unavailable right now. Please try again shortly.',
  UPSTREAM_TIMEOUT: 'The Hebrew calendar service took too long to respond. Please try again.',
  UPSTREAM_BAD_RESPONSE: 'We received an unexpected answer from the calendar service.',
};

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
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    d,
  );
}

/** Calls our API and returns the JSON body, or throws an Error with a friendly message. */
async function getJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.error?.code;
    if (code === 'INVALID_DATE' && body.error.message) throw new Error(body.error.message);
    throw new Error(ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.');
  }
  return body;
}

// ---------- single date ----------

function setLoading(isLoading) {
  for (const b of [button, hButton]) {
    b.disabled = isLoading;
    b.setAttribute('aria-busy', String(isLoading));
    b.querySelector('.label').textContent = isLoading ? 'Converting…' : 'Convert';
  }
}

/** "2026-11-11" -> "Wednesday, November 11, 2026" (formatted in UTC so the day never shifts). */
function longGregorian(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function showError(message) {
  resultEl.hidden = true;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function showResult(data, mode) {
  errorEl.hidden = true;
  state.lastHebrew = data.hebrew;

  // textContent (not innerHTML) so nothing from the API can inject markup.
  const primary = document.getElementById('primary');
  const secondary = document.getElementById('secondary');
  const transliteration = `${data.hebrew.day} ${data.hebrew.month} ${data.hebrew.year}`;

  if (mode === 'h2g') {
    primary.lang = 'en';
    primary.dir = 'ltr';
    primary.textContent = longGregorian(data.gregorian.date);
    // <bdi> keeps the Hebrew text's direction from scrambling the English around it.
    const heb = document.createElement('bdi');
    heb.lang = 'he';
    heb.textContent = data.hebrew.hebrewText;
    secondary.replaceChildren(heb, ` · ${transliteration}`);
  } else {
    primary.lang = 'he';
    primary.dir = 'rtl';
    primary.textContent = data.hebrew.hebrewText;
    secondary.textContent = transliteration;
  }

  const list = document.getElementById('events');
  list.replaceChildren();
  if (data.events.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No special events on this day.';
    list.append(li);
  } else {
    for (const event of data.events) {
      const li = document.createElement('li');
      li.textContent = event;
      list.append(li);
    }
  }

  document.getElementById('meta').textContent =
    (mode === 'h2g'
      ? `${transliteration} → ${data.gregorian.date} · `
      : `${data.gregorian.date}${data.gregorian.afterSunset ? ' (after sunset)' : ''} · `) +
    (data.cached ? 'served from cache' : 'fetched from Hebcal');

  resultEl.hidden = false;
}

async function convert() {
  const date = dateInput.value;
  if (!date) {
    showError(ERROR_MESSAGES.INVALID_DATE);
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
    const data = await getJson(`/api/convert?${params}`);
    if (seq === state.convertSeq) showResult(data, 'g2h');
  } catch (err) {
    if (seq === state.convertSeq) showError(err.message);
  } finally {
    if (seq === state.convertSeq) setLoading(false);
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
      const label = m.hebcalName === 'Adar I' || m.hebcalName === 'Adar II' ? m.hebcalName : m.code;
      return new Option(`${label} · ${m.hebrew}`, m.code);
    }),
  );
  if (selected) hMonth.value = selected;
  hLeap.textContent = Number.isInteger(year)
    ? `${year} is ${leap ? 'a leap year (13 months)' : 'a regular year (12 months)'}`
    : '';
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
    const data = await getJson(`/api/convert-hebrew?${params}`);
    if (seq !== state.convertSeq) return;
    showResult(data, 'h2g');
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
  const special = day.events.filter((e) => !e.startsWith('Parashat '));
  if (special.length > 0) return special[0];
  if (day.weekday === 6) return day.events.find((e) => e.startsWith('Parashat ')) ?? '';
  return '';
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

function renderCalendar(data) {
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
    if (day.weekday === 6) cell.classList.add('shabbat');
    if (day.date === today) cell.classList.add('today');

    const event = cellEvent(day);
    if (event && !event.startsWith('Parashat ')) cell.classList.add('has-event');

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
    cell.title = [day.hebrew.hebrewText, ...day.events].join('\n');
    cell.setAttribute(
      'aria-label',
      `${day.date}, ${day.hebrew.day} ${day.hebrew.month} ${day.hebrew.year}` +
        (day.events.length ? `, ${day.events.join(', ')}` : ''),
    );
    cells.push(cell);
  }

  calGrid.replaceChildren(...cells);
  calMeta.textContent = `${data.days.length} days in one Hebcal range request · ${
    data.cached ? 'served from cache' : 'fetched from Hebcal'
  }`;
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
    const data = await getJson(`/api/calendar?month=${month}`);
    if (seq === state.calendarSeq) renderCalendar(data);
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

// The left-to-right mark (\u200E) keeps "1 · א׳" from being reordered by the
// browser's bidi algorithm, which would show it as "א׳ · 1".
hDay.replaceChildren(
  ...HEBREW_DAYS.map((letters, i) => new Option(`\u200E${i + 1} · ${letters}`, String(i + 1))),
);

document
  .getElementById('cal-prev')
  .addEventListener('click', () => loadCalendar(shiftMonth(state.shownMonth, -1)));
document
  .getElementById('cal-next')
  .addEventListener('click', () => loadCalendar(shiftMonth(state.shownMonth, 1)));

dateInput.value = todayLocal();
convert();
