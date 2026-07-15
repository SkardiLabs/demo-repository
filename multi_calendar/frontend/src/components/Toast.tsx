export interface ToastMsg {
  id: number
  kind: 'error' | 'success' | 'info'
  text: string
}

interface Props {
  toasts: ToastMsg[]
  onDismiss: (id: number) => void
}

export default function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => onDismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
