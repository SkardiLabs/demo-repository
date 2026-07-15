import { useEffect, useRef } from 'react'
import { formatTimeRange } from '../time'
import type { Attendee, Meeting } from './../types'

interface Props {
  m: Meeting
  anchor: DOMRect
  onClose: () => void
}

function parseAttendees(json: string | null): Attendee[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const RESPONSE_CLASS: Record<string, string> = {
  accepted: 'dot-accepted',
  declined: 'dot-declined',
}

export default function EventPopover({ m, anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  const attendees = parseAttendees(m.attendees_json)
  // Clamp near viewport edges; prefer opening to the right of the card.
  const left = Math.min(anchor.right + 8, window.innerWidth - 340)
  const top = Math.min(Math.max(anchor.top, 12), window.innerHeight - 320)
  const day = new Date(m.start_at).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="popover" style={{ left, top }} ref={ref} role="dialog">
      <div className="popover-head">
        <span className={`source-badge badge-${m.source}`}>
          {m.source === 'google' ? 'Google Calendar' : 'Feishu Calendar'}
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <h3 className="popover-title">{m.title ?? '(no title)'}</h3>
      <div className="popover-time">
        {day}
        <br />
        {m.is_all_day ? 'All day' : formatTimeRange(m.start_at, m.end_at)}
      </div>
      {m.organizer && (
        <div className="popover-row">
          <span className="popover-label">Organizer</span> {m.organizer}
        </div>
      )}
      {attendees.length > 0 && (
        <div className="popover-row">
          <span className="popover-label">Invitees</span>
          <ul className="attendees">
            {attendees.map((a, i) => (
              <li key={i}>
                <span className={`dot ${RESPONSE_CLASS[a.response ?? ''] ?? 'dot-pending'}`} />
                {a.name ?? a.email ?? 'Unknown'}
                {a.email && a.name && <span className="attendee-email"> · {a.email}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.description && <p className="popover-desc">{m.description}</p>}
      <div className="popover-actions">
        {m.meeting_url && (
          <a className="btn-join" href={m.meeting_url} target="_blank" rel="noreferrer">
            Join meeting
          </a>
        )}
        {m.html_link && (
          <a className="btn-open" href={m.html_link} target="_blank" rel="noreferrer">
            Open in {m.source === 'google' ? 'Google Calendar' : 'Feishu'}
          </a>
        )}
      </div>
    </div>
  )
}
