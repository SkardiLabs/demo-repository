import type { Response } from 'express'

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json(data)
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json(data)
}

export function noContent(res: Response): void {
  res.status(204).send()
}

export function notFound(res: Response, message: string): void {
  res.status(404).json({ error: message })
}

export function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message })
}

export function serverError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  res.status(500).json({ error: message })
}
