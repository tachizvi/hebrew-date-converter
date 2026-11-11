/**
 * The Hebrew months as our API accepts them (`code`), the name Hebcal returns
 * for that month (`hebcalName`), and the Hebrew name for display.
 * Codes are the same values Hebcal accepts in `hm=`.
 */
export const HEBREW_MONTHS = [
  { code: 'Tishrei', hebcalName: 'Tishrei', hebrew: 'תשרי' },
  { code: 'Cheshvan', hebcalName: 'Cheshvan', hebrew: 'חשון' },
  { code: 'Kislev', hebcalName: 'Kislev', hebrew: 'כסלו' },
  { code: 'Tevet', hebcalName: 'Tevet', hebrew: 'טבת' },
  { code: 'Shvat', hebcalName: "Sh'vat", hebrew: 'שבט' },
  { code: 'Adar', hebcalName: 'Adar', hebrew: 'אדר' },
  { code: 'Adar1', hebcalName: 'Adar I', hebrew: 'אדר א׳' },
  { code: 'Adar2', hebcalName: 'Adar II', hebrew: 'אדר ב׳' },
  { code: 'Nisan', hebcalName: 'Nisan', hebrew: 'ניסן' },
  { code: 'Iyyar', hebcalName: 'Iyyar', hebrew: 'אייר' },
  { code: 'Sivan', hebcalName: 'Sivan', hebrew: 'סיון' },
  { code: 'Tamuz', hebcalName: 'Tamuz', hebrew: 'תמוז' },
  { code: 'Av', hebcalName: 'Av', hebrew: 'אב' },
  { code: 'Elul', hebcalName: 'Elul', hebrew: 'אלול' },
] as const;

export type HebrewMonthCode = (typeof HEBREW_MONTHS)[number]['code'];

export const HEBREW_MONTH_CODES = HEBREW_MONTHS.map((m) => m.code) as [
  HebrewMonthCode,
  ...HebrewMonthCode[],
];

export function hebcalMonthName(code: HebrewMonthCode): string {
  return HEBREW_MONTHS.find((m) => m.code === code)!.hebcalName;
}

/**
 * Leap years have 13 months (Adar I + Adar II instead of Adar). 7 of every 19
 * years are leap years: years 3, 6, 8, 11, 14, 17 and 19 of the cycle.
 */
export function isHebrewLeapYear(year: number): boolean {
  return (7 * year + 1) % 19 < 7;
}
