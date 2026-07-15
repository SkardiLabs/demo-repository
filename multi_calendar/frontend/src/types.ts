export type Source = 'google' | 'feishu'

export interface Meeting {
  source: Source
  event_id: string
  title: string | null
  description: string | null
  start_at: string // UTC ISO-8601
  end_at: string // UTC ISO-8601
  is_all_day: number
  status: string | null
  organizer: string | null
  attendees_json: string | null
  meeting_url: string | null
  html_link: string | null
}

export interface Attendee {
  name?: string
  email?: string
  response?: 'accepted' | 'declined' | 'pending' | string
}

export interface SyncStatusRow {
  sync_id: string
  source: string
  cnt: number
}

export interface JobRun {
  run_id: string
  status: string // pending | running | succeeded | failed | ...
  error?: string | null
}

export interface SkardiBatchResponse<T> {
  success: boolean
  data: T[]
  error?: string
}
