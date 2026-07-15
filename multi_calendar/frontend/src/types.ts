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

export interface IntegrationStatusRow {
  source: string
  status: 'pending_exchange' | 'connected' | 'error' | string
  error: string
  updated_at: string
}

export interface SyncRequestRow {
  source: string
  status: 'pending' | 'running' | 'ok' | 'failed' | string
  error: string
}

export interface SkardiBatchResponse<T> {
  success: boolean
  data: T[]
  error?: string
}
