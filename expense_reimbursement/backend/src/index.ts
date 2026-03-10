import express from 'express'
import cors from 'cors'

import { ClaimsService } from './services/claims-service'
import { VendorService } from './services/vendor-service'
import { PolicyService } from './services/policy-service'
import { ScoringService } from './services/scoring-service'
import { SimilarityService } from './services/similarity-service'
import { QueueEnrichmentService } from './services/queue-enrichment-service'

import { claimsRouter } from './routes/claims-routes'
import { approvalsRouter } from './routes/approvals-routes'
import { scoringRouter } from './routes/scoring-routes'
import { similarityRouter } from './routes/similarity-routes'
import { queueRouter } from './routes/queue-routes'

// ── Instantiate services ──────────────────────────────────────────────────
// In a real microservices deployment these would be separate processes
// communicating over HTTP/gRPC. For the demo they share a single process
// while maintaining clean service boundaries.

const claimsService = new ClaimsService()
const vendorService = new VendorService()
const policyService = new PolicyService()
const scoringService = new ScoringService(claimsService, vendorService, policyService)
const similarityService = new SimilarityService()
const queueEnrichmentService = new QueueEnrichmentService(claimsService, policyService, similarityService)

// ── Express app ───────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json())

// Nest scoring and similarity as sub-resources of /claims/:id
app.use('/claims', claimsRouter(claimsService, scoringService))
app.use('/claims/:id/score', scoringRouter(scoringService))
app.use('/claims/:id/similar', similarityRouter(similarityService))
app.use('/approvals', approvalsRouter(claimsService))
app.use('/queue', queueRouter(queueEnrichmentService))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'expense-backend', timestamp: new Date().toISOString() })
})

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8082)
app.listen(PORT, () => {
  console.log(`Traditional expense backend listening on http://localhost:${PORT}`)
  console.log(`  MySQL  → ${process.env.MYSQL_HOST ?? 'localhost'}:${process.env.MYSQL_PORT ?? 3306}`)
  console.log(`  MongoDB→ ${process.env.MONGO_HOST ?? 'localhost'}:${process.env.MONGO_PORT ?? 27017}`)
})
