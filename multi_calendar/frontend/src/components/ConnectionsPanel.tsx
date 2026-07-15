import type { ConnectionStates } from './HeaderBar'

const OPEN_CONNECTOR_URL = 'http://localhost:3000'

interface Props {
  connections: ConnectionStates
}

function Row({ name, desc, state }: { name: string; desc: string; state: boolean | null }) {
  return (
    <div className="conn-row">
      <div>
        <div className="conn-name">{name}</div>
        <div className="conn-desc">{desc}</div>
      </div>
      {state ? (
        <span className="conn-status conn-ok">Connected</span>
      ) : (
        <a className="btn-connect" href={OPEN_CONNECTOR_URL} target="_blank" rel="noreferrer">
          {state === null ? 'Checking…' : `Connect ${name}`}
        </a>
      )}
    </div>
  )
}

export default function ConnectionsPanel({ connections }: Props) {
  return (
    <div className="connections-panel">
      <span className="skardi-mark big">◆</span>
      <h2>Connect your calendars</h2>
      <p className="panel-sub">
        Credentials live in the local <strong>Open Connector</strong> gateway — never in skardi, the
        frontend, or the meeting store. Grants persist across restarts; tokens refresh automatically
        on every resync.
      </p>
      <Row
        name="Google Calendar"
        desc="OAuth grant via the Open Connector dashboard"
        state={connections.google}
      />
      <Row
        name="Feishu Calendar"
        desc="Feishu app credential with calendar read scope"
        state={connections.feishu}
      />
      <p className="panel-hint">
        Running in fixture mode (no live connectors)? Seed demo data with{' '}
        <code>bash seed/seed.sh</code> and reload.
      </p>
    </div>
  )
}
