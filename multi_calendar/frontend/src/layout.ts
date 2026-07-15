// Google-Calendar-style overlap layout for one day column.
// Overlapping events form clusters; a cluster's max concurrency decides how
// many side-by-side columns its events share.

import { minutesIntoDay } from './time'
import type { Meeting } from './types'

export interface PositionedEvent {
  m: Meeting
  /** Minutes from local midnight. */
  top: number
  /** Duration in minutes (visual minimum applied). */
  height: number
  /** Column index within the cluster. */
  col: number
  /** Total columns in the cluster (width divisor). */
  cols: number
}

const MIN_HEIGHT_MIN = 20

interface Item {
  m: Meeting
  start: number
  end: number
  col: number
  cluster: number
}

export function layoutDay(events: Meeting[]): PositionedEvent[] {
  const items: Item[] = events
    .map((m) => {
      const start = minutesIntoDay(m.start_at)
      const rawEnd = minutesIntoDay(m.end_at)
      // Events ending on a later day fill through local midnight.
      const end = rawEnd > start ? rawEnd : 24 * 60
      return { m, start, end: Math.max(end, start + MIN_HEIGHT_MIN), col: -1, cluster: -1 }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  // Assign clusters (transitive overlap) and greedy columns within them.
  let clusterId = -1
  let clusterEnd = -1
  const colEnds: number[][] = [] // per cluster: end time of the last event in each column
  for (const it of items) {
    if (it.start >= clusterEnd) {
      clusterId += 1
      clusterEnd = it.end
      colEnds[clusterId] = []
    } else {
      clusterEnd = Math.max(clusterEnd, it.end)
    }
    it.cluster = clusterId
    const ends = colEnds[clusterId]
    let col = ends.findIndex((e) => e <= it.start)
    if (col === -1) {
      col = ends.length
      ends.push(it.end)
    } else {
      ends[col] = it.end
    }
    it.col = col
  }

  return items.map((it) => ({
    m: it.m,
    top: it.start,
    height: it.end - it.start,
    col: it.col,
    cols: colEnds[it.cluster].length,
  }))
}
