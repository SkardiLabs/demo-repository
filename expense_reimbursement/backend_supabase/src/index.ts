import express from 'express'
import cors from 'cors'

import { ClaimsService } from './services/claims-service'
import { ScoringService } from './services/scoring-service'
import { SimilarityService } from './services/similarity-service'
import { QueueEnrichmentService } from './services/queue-enrichment-service'

import { claimsRouter } from './routes/claims-routes'
import { approvalsRouter } from './routes/approvals-routes'
import { scoringRouter } from './routes/scoring-routes'
import { similarityRouter } from './routes/similarity-routes'
import { queueRouter } from './routes/queue-routes'

// ── Instantiate services ──────────────────────────────────────────────────
// Unlike the traditional backend, all services share one Supabase client —
// no separate MySQL pool and MongoDB client. PolicyService and VendorService
// are not instantiated here because ScoringService calls PostgreSQL functions
// (score_claim, get_claim_context) that JOIN claims + vendors + policies
// internally, eliminating the need for separate service orchestration.

const claimsService           = new ClaimsService()
const scoringService          = new ScoringService()
const similarityService       = new SimilarityService()
const queueEnrichmentService  = new QueueEnrichmentService()

// ── Express app ───────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json())

app.use('/claims', claimsRouter(claimsService, scoringService))
app.use('/claims/:id/score', scoringRouter(scoringService))
app.use('/claims/:id/similar', similarityRouter(similarityService))
app.use('/approvals', approvalsRouter(claimsService))
app.use('/queue', queueRouter(queueEnrichmentService))

app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'expense-backend-supabase',
    timestamp: new Date().toISOString(),
  })
})

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8083)
app.listen(PORT, () => {
  console.log(`Supabase expense backend listening on http://localhost:${PORT}`)
  console.log(`  Supabase → ${process.env.SUPABASE_URL ?? 'http://localhost:54321'}`)
})
