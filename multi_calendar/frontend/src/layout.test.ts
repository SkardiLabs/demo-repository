import { describe, expect, it } from 'vitest'
import { layoutDay } from './layout'
import type { Meeting } from './types'

function m(id: string, startLocal: [number, number], endLocal: [number, number]): Meeting {
  const start = new Date(2026, 6, 15, startLocal[0], startLocal[1])
  const end = new Date(2026, 6, 15, endLocal[0], endLocal[1])
  return {
    source: 'google',
    event_id: id,
    title: id,
    description: null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    is_all_day: 0,
    status: 'confirmed',
    organizer: null,
    attendees_json: null,
    meeting_url: null,
    html_link: null,
  }
}

describe('layoutDay', () => {
  it('positions a lone event full-width with top/height in minutes', () => {
    const [p] = layoutDay([m('a', [10, 0], [10, 30])])
    expect(p.top).toBe(600)
    expect(p.height).toBe(30)
    expect(p.col).toBe(0)
    expect(p.cols).toBe(1)
  })

  it('splits two overlapping events into two columns', () => {
    const ps = layoutDay([m('a', [10, 0], [11, 0]), m('b', [10, 30], [11, 30])])
    expect(ps.map((p) => p.cols)).toEqual([2, 2])
    expect(new Set(ps.map((p) => p.col)).size).toBe(2)
  })

  it('keeps non-overlapping events full width', () => {
    const ps = layoutDay([m('a', [9, 0], [10, 0]), m('b', [10, 0], [11, 0])])
    expect(ps.map((p) => p.cols)).toEqual([1, 1])
  })

  it('gives a chain-overlap cluster a shared max width', () => {
    // a overlaps b, b overlaps c, but a does not overlap c: one cluster,
    // max concurrency 2 → everyone renders at half width.
    const ps = layoutDay([m('a', [9, 0], [10, 0]), m('b', [9, 30], [10, 30]), m('c', [10, 0], [11, 0])])
    expect(ps.map((p) => p.cols)).toEqual([2, 2, 2])
    // a and b must not share a column; b and c must not share a column.
    const byId = Object.fromEntries(ps.map((p) => [p.m.event_id, p]))
    expect(byId['a'].col).not.toBe(byId['b'].col)
    expect(byId['b'].col).not.toBe(byId['c'].col)
  })

  it('enforces a minimum visual height for very short events', () => {
    const [p] = layoutDay([m('a', [10, 0], [10, 5])])
    expect(p.height).toBeGreaterThanOrEqual(20)
  })
})
