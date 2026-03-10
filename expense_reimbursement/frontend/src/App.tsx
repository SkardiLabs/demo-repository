import { useState } from 'react'
import type { View, RoleId } from './types'
import { ROLES, getRole } from './roles'
import { Dashboard } from './components/Dashboard'
import { ClaimDetail } from './components/ClaimDetail'
import { SubmitForm } from './components/SubmitForm'
import { MyClaims } from './components/MyClaims'

export function App() {
  const [view, setView] = useState<View>('dashboard')
  const [roleId, setRoleId] = useState<RoleId>('employee')
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null)
  const [dashKey, setDashKey] = useState(0)
  // Persists across submit so MyClaims refreshes after a new submission
  const [employeeId, setEmployeeId] = useState('E001')

  const role = getRole(roleId)

  function openClaim(id: string) {
    setSelectedClaim(id)
    setView('detail')
  }

  function backHome() {
    setView('dashboard')
    setSelectedClaim(null)
    setDashKey(k => k + 1)
  }

  function switchRole(id: RoleId) {
    setRoleId(id)
    setView('dashboard')
    setSelectedClaim(null)
    setDashKey(k => k + 1)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
          Expense Reimbursement
          <span className="header-badge">Skardi Demo</span>
          {import.meta.env.VITE_API_BACKEND === 'traditional' && (
            <span className="header-badge" style={{ background: '#7c3aed', marginLeft: 4 }}>
              Traditional Backend
            </span>
          )}
        </div>

        <div className="header-actions">
          <div className="role-switcher">
            {ROLES.map(r => (
              <button
                key={r.id}
                className={`role-btn ${r.id === roleId ? 'active' : ''}`}
                onClick={() => switchRole(r.id as RoleId)}
                title={r.description}
                style={{ '--role-color': r.color } as React.CSSProperties}
              >
                <span className="role-dot" />
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">
        {/* Role context banner */}
        <div className="role-banner" style={{ borderColor: role.color }}>
          <span className="role-banner-dot" style={{ background: role.color }} />
          <strong style={{ color: role.color }}>{role.label}</strong>
          <span className="role-banner-desc">{role.description}</span>
          {role.queue && (
            <span className="role-banner-queue">Monitoring: <code>{role.queue}</code></span>
          )}
          {role.approvalTier && (
            <span className="role-banner-queue">Approval tier: <code>{role.approvalTier}</code></span>
          )}

          {/* Employee ID input shown only for Employee role */}
          {role.canSubmit && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 0 }}>
                Employee ID
              </label>
              <input
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
                style={{ width: 90, padding: '3px 8px', fontSize: 12 }}
                placeholder="E001"
              />
            </div>
          )}
        </div>

        {/* Views */}
        {view === 'detail' && selectedClaim ? (
          <ClaimDetail
            claimId={selectedClaim}
            role={role}
            onBack={backHome}
            onSelectClaim={openClaim}
          />
        ) : role.canSubmit ? (
          /* Employee: two-column layout — submit form + my claims */
          <div className="employee-layout">
            <SubmitForm
              role={role}
              employeeId={employeeId}
              onEmployeeIdChange={setEmployeeId}
              onSubmitted={() => setDashKey(k => k + 1)}
              onViewClaim={openClaim}
            />
            <MyClaims
              employeeId={employeeId}
              refreshKey={dashKey}
              onSelectClaim={openClaim}
            />
          </div>
        ) : (
          /* Approver roles: single queue dashboard */
          <Dashboard key={dashKey} role={role} onSelectClaim={openClaim} />
        )}
      </main>
    </div>
  )
}
