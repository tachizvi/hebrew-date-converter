// Shared helpers for talking to our own API.

import { getLang, locale, t } from './i18n.js';

/**
 * Calls our API and returns the JSON body, or throws an Error with a friendly,
 * translated message. For input errors the API's own message is kept, because it
 * says exactly what is wrong (e.g. "Hebrew day 30 out of valid range 1-29 ...").
 */
export async function getJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(t('networkError'));
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body?.error?.code;
    const detail = body?.error?.message;
    if ((code === 'INVALID_DATE' || code === 'INVALID_REQUEST') && detail) {
      throw new Error(getLang() === 'en' ? detail : `${t(code)} (${detail})`);
    }
    throw new Error(code ? t(code) : t('genericError'));
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

/** Adds the UI language to an API URL, so holiday names come back in that language. */
export function withLang(url) {
  return getLang() === 'he' ? `${url}${url.includes('?') ? '&' : '?'}lang=he` : url;
}

/**
 * "2026-11-11" -> "Wednesday, November 11, 2026" / "יום רביעי, 11 בנובמבר 2026".
 * Formatted in UTC so the day never shifts with the browser's time zone.
 */
export function longGregorian(iso, options = {}) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return new Intl.DateTimeFormat(locale(), {
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
  const reason = getLang() === 'he' ? (w.hebrewReason ?? w.reason) : w.reason;
  switch (w.dayType) {
    case 'workday':
      return t('workday');
    case 'holiday_eve':
      return t('holidayEve', { reason });
    case 'chol_hamoed':
      return t('cholHamoed');
    case 'weekend':
    case 'holiday':
      return t('notWorkday', { reason });
    default:
      return '';
  }
}

/** The reason a day is not a regular workday, in the UI language. */
export function workdayReason(w) {
  return getLang() === 'he' ? (w.hebrewReason ?? w.reason) : w.reason;
}
