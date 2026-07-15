import type { PositionedEvent } from '../layout'
import { formatTimeRange } from '../time'

const HOUR_PX = 48 // must match the grid's hour row height
const MIN_TO_PX = HOUR_PX / 60

interface Props {
  p: PositionedEvent
  onSelect: (anchor: DOMRect) => void
}

export default function EventCard({ p, onSelect }: Props) {
  const widthPct = 100 / p.cols
  const style: React.CSSProperties = {
    top: p.top * MIN_TO_PX,
    height: p.height * MIN_TO_PX - 2,
    left: `calc(${p.col * widthPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
  }
  return (
    <button
      className={`event-card event-${p.m.source}`}
      style={style}
      onClick={(e) => onSelect(e.currentTarget.getBoundingClientRect())}
      title={p.m.title ?? undefined}
    >
      <span className="event-title">
        <span className="event-glyph">{p.m.source === 'google' ? 'G' : 'F'}</span>
        {p.m.title ?? '(no title)'}
        {p.m.meeting_url && <span className="event-cam" aria-label="video meeting">🎥</span>}
      </span>
      <span className="event-time">{formatTimeRange(p.m.start_at, p.m.end_at)}</span>
    </button>
  )
}
