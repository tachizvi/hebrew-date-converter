// Front end for the converter. It only talks to our own API
// (/api/convert and /api/calendar), never to Hebcal directly.

const form = document.getElementById('convert-form');
const dateInput = document.getElementById('date');
const afterSunsetInput = document.getElementById('afterSunset');
const button = document.getElementById('submit');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');

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

const state = {
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
  button.disabled = isLoading;
  button.setAttribute('aria-busy', String(isLoading));
  button.querySelector('.label').textContent = isLoading ? 'Converting…' : 'Convert';
}

function showError(message) {
  resultEl.hidden = true;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function showResult(data) {
  errorEl.hidden = true;

  // textContent (not innerHTML) so nothing from the API can inject markup.
  document.getElementById('hebrew-text').textContent = data.hebrew.hebrewText;
  document.getElementById('transliteration').textContent =
    `${data.hebrew.day} ${data.hebrew.month} ${data.hebrew.year}`;

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
    `${data.gregorian.date}${data.gregorian.afterSunset ? ' (after sunset)' : ''} · ` +
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
    if (seq === state.convertSeq) showResult(data);
  } catch (err) {
    if (seq === state.convertSeq) showError(err.message);
  } finally {
    if (seq === state.convertSeq) setLoading(false);
  }
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

// Clicking a day in the calendar selects and converts it.
calGrid.addEventListener('click', (event) => {
  const cell = event.target.closest('.cal-day[data-date]');
  if (!cell) return;
  dateInput.value = cell.dataset.date;
  convert();
});

document
  .getElementById('cal-prev')
  .addEventListener('click', () => loadCalendar(shiftMonth(state.shownMonth, -1)));
document
  .getElementById('cal-next')
  .addEventListener('click', () => loadCalendar(shiftMonth(state.shownMonth, 1)));

dateInput.value = todayLocal();
convert();
