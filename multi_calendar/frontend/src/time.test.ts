import { describe, expect, it } from 'vitest'
import { minutesIntoDay, newSyncId, weekDays, windowRange } from './time'

// A fixed local "now": 2026-07-15 14:23:45 local time.
const NOW = new Date(2026, 6, 15, 14, 23, 45)

describe('windowRange', () => {
  it('starts at local midnight today and spans exactly 14 days', () => {
    const { fromTs, toTs } = windowRange(NOW)
    const from = new Date(fromTs)
    const to = new Date(toTs)
    expect(from.getFullYear()).toBe(2026)
    expect(from.getMonth()).toBe(6)
    expect(from.getDate()).toBe(15)
    expect(from.getHours()).toBe(0)
    expect(from.getMinutes()).toBe(0)
    expect(to.getTime() - from.getTime()).toBe(14 * 24 * 60 * 60 * 1000)
  })

  it('produces UTC ISO strings', () => {
    const { fromTs, toTs } = windowRange(NOW)
    expect(fromTs.endsWith('Z')).toBe(true)
    expect(toTs.endsWith('Z')).toBe(true)
  })
})

describe('weekDays', () => {
  it('week 0 starts on today (rolling window, not Monday-aligned)', () => {
    const days = weekDays(NOW, 0)
    expect(days).toHaveLength(7)
    expect(days[0].getDate()).toBe(15)
    expect(days[6].getDate()).toBe(21)
  })

  it('week 1 starts 7 days after today', () => {
    const days = weekDays(NOW, 1)
    expect(days).toHaveLength(7)
    expect(days[0].getDate()).toBe(22)
    expect(days[6].getDate()).toBe(28)
  })

  it('all days are at local midnight', () => {
    for (const d of weekDays(NOW, 0)) {
      expect(d.getHours()).toBe(0)
      expect(d.getMinutes()).toBe(0)
    }
  })
})

describe('minutesIntoDay', () => {
  it('converts a UTC instant to minutes into the LOCAL day', () => {
    // 09:30 local on the fixed date, expressed as UTC ISO.
    const local = new Date(2026, 6, 15, 9, 30, 0)
    expect(minutesIntoDay(local.toISOString())).toBe(9 * 60 + 30)
  })
})

describe('newSyncId', () => {
  it('is a UTC ISO timestamp so lexical order == time order', () => {
    const id = newSyncId(NOW)
    expect(id).toBe(NOW.toISOString())
    expect(newSyncId(new Date(NOW.getTime() + 1000)) > id).toBe(true)
  })
})
