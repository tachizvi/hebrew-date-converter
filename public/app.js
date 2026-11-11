// Front end for the converter. It only talks to our own API (/api/convert),
// never to Hebcal directly.

const form = document.getElementById('convert-form');
const dateInput = document.getElementById('date');
const afterSunsetInput = document.getElementById('afterSunset');
const button = document.getElementById('submit');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');

/** Friendly messages per API error code. */
const ERROR_MESSAGES = {
  INVALID_DATE: 'Please enter a valid date.',
  UPSTREAM_UNAVAILABLE:
    'The Hebrew calendar service is unavailable right now. Please try again shortly.',
  UPSTREAM_TIMEOUT: 'The Hebrew calendar service took too long to respond. Please try again.',
  UPSTREAM_BAD_RESPONSE: 'We received an unexpected answer from the calendar service.',
};

/**
 * Today's date as YYYY-MM-DD in the *user's* time zone.
 * (new Date().toISOString() would use UTC and can be off by a day.)
 */
function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

  const params = new URLSearchParams({ date });
  if (afterSunsetInput.checked) params.set('afterSunset', 'true');

  setLoading(true);
  try {
    const res = await fetch(`/api/convert?${params}`);
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const code = body?.error?.code;
      const message = ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
      showError(code === 'INVALID_DATE' && body.error.message ? body.error.message : message);
      return;
    }
    showResult(body);
  } catch {
    showError('Could not reach the server. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  convert();
});

dateInput.value = todayLocal();
convert();
