interface Props {
  score: number | null
  showNumber?: boolean
}

function scoreLevel(score: number | null): 'none' | 'low' | 'medium' | 'high' {
  if (score === null) return 'none'
  if (score < 0.3) return 'low'
  if (score < 0.5) return 'medium'
  return 'high'
}

export function AnomalyBadge({ score, showNumber = true }: Props) {
  const level = scoreLevel(score)
  return (
    <span className={`anomaly-badge ${level}`}>
      <span className="anomaly-dot" />
      {score === null ? 'unscored' : showNumber ? score.toFixed(2) : level}
    </span>
  )
}

export { scoreLevel }
