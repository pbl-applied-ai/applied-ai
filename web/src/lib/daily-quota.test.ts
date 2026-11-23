import { describe, expect, it } from 'vitest';
import { browserUsedToday, countBrowserJob, seoulDay } from './daily-quota';

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('하루 변환 한도 (브라우저)', () => {
  it('한국 시간 0시에 날짜가 바뀐다', () => {
    expect(seoulDay(Date.parse('2026-11-21T14:59:00Z'))).toBe('2026-11-21');
    expect(seoulDay(Date.parse('2026-11-21T15:00:00Z'))).toBe('2026-11-22');
  });

  it('오늘 만든 수를 세고, 다음 날이면 0부터', () => {
    const s = memoryStorage();
    const t = Date.parse('2026-11-21T03:00:00Z');
    countBrowserJob(t, s);
    countBrowserJob(t + 1000, s);
    expect(browserUsedToday(t + 2000, s)).toBe(2);
    expect(browserUsedToday(t + 24 * 60 * 60 * 1000, s)).toBe(0);
    countBrowserJob(t + 24 * 60 * 60 * 1000, s);
    expect(browserUsedToday(t + 24 * 60 * 60 * 1000, s)).toBe(1);
  });

  it('저장소가 깨졌거나 없으면 0', () => {
    const s = memoryStorage();
    s.setItem('daily-jobs-v1', '{oops');
    expect(browserUsedToday(0, s)).toBe(0);
    expect(browserUsedToday(0, null)).toBe(0);
    expect(() => countBrowserJob(0, null)).not.toThrow();
  });
});
