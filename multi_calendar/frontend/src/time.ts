// Time helpers for the rolling two-week window.
// Storage is UTC ISO-8601; all rendering math happens in the local timezone.

/** The sync window: today at local midnight through +14 days, as UTC ISO. */
export function windowRange(now: Date): { fromTs: string; toTs: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000)
  return { fromTs: from.toISOString(), toTs: to.toISOString() }
}

/** Seven local-midnight dates for week 0 (starts today) or week 1 (starts +7d). */
export function weekDays(now: Date, week: 0 | 1): Date[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + week * 7)
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

/** Minutes into the LOCAL day for a UTC instant (drives vertical position). */
export function minutesIntoDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Generation stamp: UTC ISO, so lexical order equals time order in SQL. */
export function newSyncId(now: Date): string {
  return now.toISOString()
}

/** True when the UTC instant falls on the given local calendar day. */
export function isSameLocalDay(iso: string, day: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate()
  )
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

export function relativeAgo(iso: string, now: Date = new Date()): string {
  const secs = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}
