// Shared helpers for talking to our own API.

/** Friendly messages per API error code. */
export const ERROR_MESSAGES = {
  INVALID_DATE: 'Please enter a valid date.',
  INVALID_REQUEST: 'The request was not valid.',
  PAYLOAD_TOO_LARGE: 'Too much data in one request.',
  UPSTREAM_UNAVAILABLE:
    'The Hebrew calendar service is unavailable right now. Please try again shortly.',
  UPSTREAM_TIMEOUT: 'The Hebrew calendar service took too long to respond. Please try again.',
  UPSTREAM_BAD_RESPONSE: 'We received an unexpected answer from the calendar service.',
};

/**
 * Calls our API and returns the JSON body, or throws an Error with a friendly
 * message. Validation messages (400) are shown as the API wrote them.
 */
export async function getJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.error?.code;
    if ((code === 'INVALID_DATE' || code === 'INVALID_REQUEST') && body.error.message) {
      throw new Error(body.error.message);
    }
    throw new Error(ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.');
  }
  return body;
}

export function postJson(url, data) {
  return getJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/** "2026-11-11" -> "Wednesday, November 11, 2026" (formatted in UTC so the day never shifts). */
export function longGregorian(iso, options = {}) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(date);
}

/** Short label for a workday result, e.g. "Not a workday in Israel · Yom Kippur". */
export function workdayLabel(w) {
  switch (w.dayType) {
    case 'workday':
      return 'Workday in Israel';
    case 'holiday_eve':
      return `Workday, usually shortened · ${w.reason}`;
    case 'chol_hamoed':
      return `Chol HaMoed · workday, reduced hours common`;
    case 'weekend':
      return `Not a workday in Israel · ${w.reason}`;
    case 'holiday':
      return `Not a workday in Israel · ${w.reason}`;
    default:
      return '';
  }
}
