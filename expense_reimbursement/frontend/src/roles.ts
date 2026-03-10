import type { Role } from './types'

export const ROLES: Role[] = [
  {
    id: 'employee',
    label: 'Employee',
    description: 'Submit expense claims',
    color: '#93c5fd',
    queue: null,
    approverId: null,
    approvalTier: null,
    canSubmit: true,
  },
  {
    id: 'l1',
    label: 'L1 Supervisor',
    description: 'Review standard-risk claims',
    color: '#6ee7b7',
    queue: 'PENDING_L1',
    approverId: 'MGR001',
    approvalTier: 'L1',
    canSubmit: false,
  },
  {
    id: 'auditor',
    label: 'Senior Auditor',
    description: 'Review elevated-risk claims',
    color: '#fdba74',
    queue: 'PENDING_AUDITOR',
    approverId: 'AUD001',
    approvalTier: 'AUDITOR',
    canSubmit: false,
  },
  {
    id: 'finance',
    label: 'Finance Officer',
    description: 'Final approval & GL coding',
    color: '#c4b5fd',
    queue: 'PENDING_FINANCE',
    approverId: 'FIN001',
    approvalTier: 'FINANCE',
    canSubmit: false,
  },
]

export function getRole(id: string): Role {
  return ROLES.find(r => r.id === id) ?? ROLES[0]
}
