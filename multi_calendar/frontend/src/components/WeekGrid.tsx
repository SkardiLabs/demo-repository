import { useEffect, useMemo, useRef } from 'react'
import { layoutDay } from '../layout'
import { isSameLocalDay, minutesIntoDay } from '../time'
import type { Meeting } from '../types'
import EventCard from './EventCard'

const HOUR_PX = 48
const SCROLL_TO_HOUR = 7

interface Props {
  days: Date[]
  meetings: Meeting[]
  onSelect: (m: Meeting, anchor: DOMRect) => void
  onSwipe: (dir: 1 | -1) => void
}

export default function WeekGrid({ days, meetings, onSelect, onSwipe }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const wheelAccum = useRef(0)
  const today = new Date()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: SCROLL_TO_HOUR * HOUR_PX })
  }, [])

  const byDay = useMemo(
    () =>
      days.map((day) => {
        const dayMeetings = meetings.filter((m) => isSameLocalDay(m.start_at, day))
        return {
          allDay: dayMeetings.filter((m) => m.is_all_day),
          timed: layoutDay(dayMeetings.filter((m) => !m.is_all_day)),
        }
      }),
    [days, meetings],
  )

  // Horizontal wheel / trackpad swipe toggles the week.
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    wheelAccum.current += e.deltaX
    if (Math.abs(wheelAccum.current) > 120) {
      onSwipe(wheelAccum.current > 0 ? 1 : -1)
      wheelAccum.current = 0
    }
  }
  const touchStartX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => (touchStartX.current = e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) onSwipe(dx < 0 ? 1 : -1)
    touchStartX.current = null
  }

  const nowMinutes = minutesIntoDay(today.toISOString())

  return (
    <div className="weekgrid" onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Sticky day header + all-day band */}
      <div className="weekgrid-header">
        <div className="gutter-spacer" />
        {days.map((day, i) => {
          const isToday = isSameLocalDay(today.toISOString(), day)
          return (
            <div key={i} className={`day-head ${isToday ? 'day-today' : ''}`}>
              <span className="day-name">
                {day.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span className="day-num">{day.getDate()}</span>
              <div className="allday-band">
                {byDay[i].allDay.map((m) => (
                  <button
                    key={m.event_id}
                    className={`allday-chip event-${m.source}`}
                    onClick={(e) => onSelect(m, e.currentTarget.getBoundingClientRect())}
                  >
                    {m.title ?? '(no title)'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable time grid */}
      <div className="weekgrid-scroll" ref={scrollRef}>
        <div className="weekgrid-body" style={{ height: 24 * HOUR_PX }}>
          <div className="time-gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}
              </div>
            ))}
          </div>
          {days.map((day, i) => {
            const isToday = isSameLocalDay(today.toISOString(), day)
            return (
              <div key={i} className={`day-col ${isToday ? 'day-col-today' : ''}`}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="hour-line" style={{ top: h * HOUR_PX }} />
                ))}
                {isToday && (
                  <div className="now-line" style={{ top: (nowMinutes / 60) * HOUR_PX }} />
                )}
                {byDay[i].timed.map((p) => (
                  <EventCard key={p.m.event_id} p={p} onSelect={(r) => onSelect(p.m, r)} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
