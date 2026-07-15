import { useEffect, useState } from 'react'
import { listMeetings, syncStatus } from './api'
import { pickAdoptedSyncId } from './syncMachine'
import { weekDays } from './time'
import type { Meeting } from './types'
import EventPopover from './components/EventPopover'
import WeekGrid from './components/WeekGrid'

// Temporary shell: fetches the adopted generation and renders the grid.
// Task 5 replaces this with full header/resync/connections orchestration.
export default function App() {
  const [week, setWeek] = useState<0 | 1>(0)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selected, setSelected] = useState<{ m: Meeting; anchor: DOMRect } | null>(null)

  useEffect(() => {
    ;(async () => {
      const rows = await syncStatus()
      const adopted = pickAdoptedSyncId(rows)
      if (adopted) setMeetings(await listMeetings(adopted))
    })().catch(console.error)
  }, [])

  return (
    <>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 12 }}>
        <button onClick={() => setWeek(0)}>This week</button>
        <button onClick={() => setWeek(1)}>Next week</button>
      </div>
      <WeekGrid
        days={weekDays(new Date(), week)}
        meetings={meetings}
        onSelect={(m, anchor) => setSelected({ m, anchor })}
        onSwipe={(dir) => setWeek(dir > 0 ? 1 : 0)}
      />
      {selected && (
        <EventPopover m={selected.m} anchor={selected.anchor} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
