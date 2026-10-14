import { describe, expect, it } from 'vitest'
import { computeWorkspaceSignature, ensureStableOrg } from './supabase-sync'
import { createEmptyRoster, LOCAL_ORG_ID } from '../modules/roster/seed'
import { emptySchedulingState } from '../modules/scheduling/session-lifecycle'

describe('computeWorkspaceSignature & sync optimization', () => {
  it('generates consistent signature for identical states', () => {
    const roster = createEmptyRoster()
    const scheduling = emptySchedulingState()

    const sig1 = computeWorkspaceSignature({ roster, scheduling })
    const sig2 = computeWorkspaceSignature({ roster, scheduling })
    expect(sig1).toBe(sig2)
    expect(sig1.length).toBeGreaterThan(0)
  })

  it('normalizes org-local to LOCAL_ORG_ID in signature', () => {
    const rosterLocal = {
      ...createEmptyRoster(),
      organization: { id: 'org-local', name: 'Test Org' },
    }
    const rosterStable = {
      ...createEmptyRoster(),
      organization: { id: LOCAL_ORG_ID, name: 'Test Org' },
    }
    const scheduling = emptySchedulingState()

    const sigLocal = computeWorkspaceSignature({ roster: rosterLocal, scheduling })
    const sigStable = computeWorkspaceSignature({ roster: rosterStable, scheduling })
    expect(sigLocal).toBe(sigStable)
  })

  it('changes signature when user is added to roster', () => {
    const roster = createEmptyRoster()
    const scheduling = emptySchedulingState()
    const initialSig = computeWorkspaceSignature({ roster, scheduling })

    const updatedRoster = {
      ...roster,
      users: [
        ...roster.users,
        {
          id: 'u-1',
          displayName: 'Test Learner',
          email: 'learner@example.com',
          avatarUrl: null,
          roles: ['learner' as const],
          accountStatus: 'active' as const,
        },
      ],
    }

    const updatedSig = computeWorkspaceSignature({ roster: updatedRoster, scheduling })
    expect(updatedSig).not.toBe(initialSig)
  })

  it('changes signature when learningSession is added or mutated', () => {
    const roster = createEmptyRoster()
    const scheduling = emptySchedulingState()
    const initialSig = computeWorkspaceSignature({ roster, scheduling })

    const updatedScheduling = {
      ...scheduling,
      learningSessions: [
        ...scheduling.learningSessions,
        {
          id: 'ls-1',
          classId: 'c-1',
          sessionNumber: 1,
          status: 'open' as const,
          scheduledSessionId: null,
          ownerUserId: 't-1',
          lockExpiresAt: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
        },
      ],
    }

    const updatedSig = computeWorkspaceSignature({ roster, scheduling: updatedScheduling })
    expect(updatedSig).not.toBe(initialSig)
  })
})
