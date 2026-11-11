// UI language (English / Hebrew). Static text is marked with data-i18n attributes
// in index.html; dynamic text calls t(). Switching language also flips the page
// to right-to-left and asks the API for Hebrew holiday names (lang=he).

const STRINGS = {
  en: {
    pageTitle: 'Hebrew Date Converter',
    title: 'Hebrew Date Converter',
    subtitle: 'Convert between the Gregorian and the Hebrew calendar.',
    tabG2h: 'Gregorian → Hebrew',
    tabH2g: 'Hebrew → Gregorian',
    directionLabel: 'Conversion direction',
    gregorianDate: 'Gregorian date',
    afterSunset: 'After sunset',
    afterSunsetHint: '(the Hebrew day starts at nightfall)',
    convert: 'Convert',
    converting: 'Converting…',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    leapYear: '{year} is a leap year (13 months)',
    regularYear: '{year} is a regular year (12 months)',
    events: 'Events',
    noEvents: 'No special events on this day.',
    servedFromCache: 'served from cache',
    fetchedFromHebcal: 'fetched from Hebcal',
    afterSunsetNote: ' (after sunset)',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    legend: 'Legend',
    legendHoliday: 'Holiday (day off)',
    legendEve: 'Holiday eve',
    legendChol: 'Chol HaMoed',
    legendWeekend: 'Weekend (Fri–Sat)',
    calMeta: '{n} days in one Hebcal range request · {source}',
    tools: 'Tools',
    toolsLabel: 'Tools',
    businessDays: 'Business days',
    batchConvert: 'Batch convert',
    wdHint:
      'When is a date N Israeli business days from now? Weekends (Fri–Sat) and holidays are skipped; holiday eves and Chol HaMoed count as workdays.',
    from: 'From',
    businessDaysCount: 'Business days',
    calculate: 'Calculate',
    working: 'Working…',
    wdSummary: '{n} business days after {date}',
    wdSkipped: ' · {n} non-working days skipped:',
    batchHint:
      'Paste up to 100 dates (YYYY-MM-DD), one per line or comma-separated, or load a CSV file. Invalid lines are reported without failing the rest.',
    datesToConvert: 'Dates to convert',
    loadCsv: 'Load CSV…',
    convertAll: 'Convert all',
    batchSummary: '{ok} of {total} converted',
    batchFailed: ', {n} failed',
    batchDistinct: ' · {n} distinct dates',
    downloadCsv: 'Download CSV',
    thInput: 'Input',
    thHebrew: 'Hebrew date',
    thDetails: 'Details',
    enterAtLeastOne: 'Enter at least one date.',
    tooManyDates: 'At most {max} dates per batch (you entered {n}).',
    footerData: 'Data from the',
    footerVia: "through this service's own API",
    workday: 'Workday in Israel',
    holidayEve: 'Workday, usually shortened · {reason}',
    cholHamoed: 'Chol HaMoed · workday, reduced hours common',
    notWorkday: 'Not a workday in Israel · {reason}',
    networkError: 'Could not reach the server. Check your connection and try again.',
    genericError: 'Something went wrong. Please try again.',
    INVALID_DATE: 'Please enter a valid date.',
    INVALID_REQUEST: 'The request was not valid.',
    PAYLOAD_TOO_LARGE: 'Too much data in one request.',
    UPSTREAM_UNAVAILABLE:
      'The Hebrew calendar service is unavailable right now. Please try again shortly.',
    UPSTREAM_TIMEOUT: 'The Hebrew calendar service took too long to respond. Please try again.',
    UPSTREAM_BAD_RESPONSE: 'We received an unexpected answer from the calendar service.',
  },
  he: {
    pageTitle: 'ממיר תאריכים עברי',
    title: 'ממיר תאריכים עברי',
    subtitle: 'המרה בין הלוח הלועזי ללוח העברי.',
    tabG2h: 'מלועזי לעברי',
    tabH2g: 'מעברי ללועזי',
    directionLabel: 'כיוון ההמרה',
    gregorianDate: 'תאריך לועזי',
    afterSunset: 'אחרי השקיעה',
    afterSunsetHint: '(היום העברי מתחיל בצאת הכוכבים)',
    convert: 'המרה',
    converting: 'ממיר…',
    day: 'יום',
    month: 'חודש',
    year: 'שנה',
    leapYear: '{year} היא שנה מעוברת (13 חודשים)',
    regularYear: '{year} היא שנה פשוטה (12 חודשים)',
    events: 'אירועים',
    noEvents: 'אין אירועים מיוחדים ביום זה.',
    servedFromCache: 'נשלף מהמטמון',
    fetchedFromHebcal: 'התקבל מ-Hebcal',
    afterSunsetNote: ' (אחרי השקיעה)',
    prevMonth: 'החודש הקודם',
    nextMonth: 'החודש הבא',
    legend: 'מקרא',
    legendHoliday: 'חג (יום חופש)',
    legendEve: 'ערב חג',
    legendChol: 'חול המועד',
    legendWeekend: 'סוף שבוע (שישי–שבת)',
    calMeta: '{n} ימים בבקשת טווח אחת ל-Hebcal · {source}',
    tools: 'כלים',
    toolsLabel: 'כלים',
    businessDays: 'ימי עסקים',
    batchConvert: 'המרה מרובה',
    wdHint:
      'מתי יחול התאריך בעוד N ימי עסקים בישראל? סופי שבוע (שישי–שבת) וחגים מדולגים; ערבי חג וחול המועד נספרים כימי עבודה.',
    from: 'מתאריך',
    businessDaysCount: 'ימי עסקים',
    calculate: 'חישוב',
    working: 'מחשב…',
    wdSummary: '{n} ימי עסקים אחרי {date}',
    wdSkipped: ' · דולגו {n} ימים שאינם ימי עבודה:',
    batchHint:
      'הדביקו עד 100 תאריכים (YYYY-MM-DD), אחד בכל שורה או מופרדים בפסיקים, או טענו קובץ CSV. שורות שגויות מדווחות בלי להכשיל את השאר.',
    datesToConvert: 'תאריכים להמרה',
    loadCsv: 'טעינת CSV…',
    convertAll: 'המרת הכול',
    batchSummary: '{ok} מתוך {total} הומרו',
    batchFailed: ', {n} נכשלו',
    batchDistinct: ' · {n} תאריכים שונים',
    downloadCsv: 'הורדת CSV',
    thInput: 'קלט',
    thHebrew: 'תאריך עברי',
    thDetails: 'פרטים',
    enterAtLeastOne: 'יש להזין לפחות תאריך אחד.',
    tooManyDates: 'עד {max} תאריכים בכל פעם (הוזנו {n}).',
    footerData: 'הנתונים מ-',
    footerVia: 'דרך ה-API של השירות עצמו',
    workday: 'יום עבודה בישראל',
    holidayEve: 'יום עבודה, בדרך כלל מקוצר · {reason}',
    cholHamoed: 'חול המועד · יום עבודה, לרוב בשעות מקוצרות',
    notWorkday: 'לא יום עבודה בישראל · {reason}',
    networkError: 'אין חיבור לשרת. בדקו את החיבור ונסו שוב.',
    genericError: 'משהו השתבש. נסו שוב.',
    INVALID_DATE: 'נא להזין תאריך תקין.',
    INVALID_REQUEST: 'הבקשה אינה תקינה.',
    PAYLOAD_TOO_LARGE: 'יותר מדי נתונים בבקשה אחת.',
    UPSTREAM_UNAVAILABLE: 'שירות הלוח העברי אינו זמין כרגע. נסו שוב בעוד רגע.',
    UPSTREAM_TIMEOUT: 'שירות הלוח העברי לא ענה בזמן. נסו שוב.',
    UPSTREAM_BAD_RESPONSE: 'התקבלה תשובה לא צפויה משירות הלוח.',
  },
};

const STORAGE_KEY = 'hdc-lang';
const listeners = new Set();

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'he') return saved;
  } catch {
    // Storage can be blocked (private mode); fall through to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('he') ? 'he' : 'en';
}

let current = initialLang();

export const getLang = () => current;

/** Locale for Intl date formatting. */
export const locale = () => (current === 'he' ? 'he-IL' : 'en');

/** Translated text; `{name}` placeholders are filled from `vars`. */
export function t(key, vars = {}) {
  const text = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

/** Translates every element marked with data-i18n / data-i18n-aria, and sets lang + dir. */
function applyStatic() {
  document.documentElement.lang = current;
  document.documentElement.dir = current === 'he' ? 'rtl' : 'ltr';
  document.title = t('pageTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
  for (const btn of document.querySelectorAll('[data-lang]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === current));
  }
}

export function setLang(lang) {
  if (lang === current || !STRINGS[lang]) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not critical: the choice just won't be remembered.
  }
  applyStatic();
  for (const fn of listeners) fn(lang);
}

/** Called after the language changes, so dynamic content can re-render. */
export function onLangChange(fn) {
  listeners.add(fn);
}

for (const btn of document.querySelectorAll('[data-lang]')) {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
}
applyStatic();
