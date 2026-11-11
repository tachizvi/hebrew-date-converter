import { describe, expect, it } from 'vitest';
import { TtlCache } from '../../src/lib/cache.js';
import { createHebcalHolidaysClient } from '../../src/services/hebcalHolidaysClient.js';
import { WorkdayService } from '../../src/services/workdayService.js';
import type { WorkdayDto } from '../../src/types/dto.js';
import { fakeHebcal, silentLogger } from '../helpers.js';

function service(fetchFn = fakeHebcal()) {
  const client = createHebcalHolidaysClient({
    holidaysUrl: 'https://hebcal.test/hebcal',
    timeoutMs: 1_000,
    retries: 0,
    logger: silentLogger,
    fetchFn,
  });
  return {
    fetchFn,
    svc: new WorkdayService(
      client,
      new TtlCache<Map<string, WorkdayDto>>(60_000, 10),
      silentLogger,
    ),
  };
}

describe('WorkdayService.getDay', () => {
  it.each([
    ['2026-11-11', 'workday', true, null], // regular Wednesday
    ['2026-11-13', 'weekend', false, 'Friday'],
    ['2026-11-14', 'weekend', false, 'Shabbat'],
    ['2026-09-21', 'holiday', false, 'Yom Kippur'],
    ['2026-09-12', 'holiday', false, 'Rosh Hashana 5787'], // a Saturday: reported as the holiday
    ['2026-09-20', 'holiday_eve', true, 'Eve of Yom Kippur'],
    ['2026-09-28', 'chol_hamoed', true, 'Sukkot III (CH’’M)'],
    ['2026-04-22', 'holiday', false, 'Yom HaAtzma’ut'], // statutory day off, not Yom Tov
    ['2026-04-21', 'holiday_eve', true, 'Eve of Yom HaAtzma’ut'],
  ])('%s is %s', async (date, dayType, isWorkday, reason) => {
    const day = await service().svc.getDay(date);
    expect(day).toMatchObject({ date, dayType, isWorkday, reason });
  });

  it('asks Hebcal for the Israeli schedule once per year, including Jan 1 of the next year', async () => {
    const { svc, fetchFn } = service();
    await svc.getDay('2026-03-01');
    await svc.getDay('2026-12-31');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(url.searchParams.get('i')).toBe('on');
    expect(url.searchParams.get('start')).toBe('2026-01-01');
    expect(url.searchParams.get('end')).toBe('2027-01-01');
  });

  it('returns a whole month', async () => {
    const month = await service().svc.getMonth(2026, 9);
    expect(month.days).toHaveLength(30);
    expect(month.days.filter((d) => d.dayType === 'holiday').map((d) => d.date)).toEqual([
      '2026-09-12',
      '2026-09-13',
      '2026-09-21',
      '2026-09-26',
    ]);
  });
});

describe('WorkdayService.addWorkdays', () => {
  it('skips weekends and holidays', async () => {
    // Thu 10 Sep + 3 workdays: Fri, Sat (Rosh Hashana), Sun (Rosh Hashana II) are skipped.
    const result = await service().svc.addWorkdays('2026-09-10', 3);
    expect(result.result.date).toBe('2026-09-16');
    expect(result.skipped.map((d) => d.date)).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
  });

  it('counts holiday eves and Chol HaMoed as workdays', async () => {
    const result = await service().svc.addWorkdays('2026-09-17', 2);
    // Fri 18, Sat 19 skipped; Sun 20 (eve of Yom Kippur) = 1; Mon 21 Yom Kippur skipped; Tue 22 = 2
    expect(result.result.date).toBe('2026-09-22');
  });

  it('crosses into the next year', async () => {
    const { svc, fetchFn } = service();
    const result = await svc.addWorkdays('2026-12-30', 3);
    // Thu 31 = 1, Fri/Sat skipped, Sun 3 Jan = 2, Mon 4 Jan = 3
    expect(result.result.date).toBe('2027-01-04');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
