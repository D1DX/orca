import { describe, expect, it } from 'vitest'
import { resolveVisibleCreatePrHeaderAction } from './source-control-create-pr-intent-state'
import type { PrimaryAction } from './source-control-primary-action-types'

const createPrIntentAction: PrimaryAction = {
  kind: 'create_pr_intent',
  label: 'Create PR',
  title: 'Preparing branch for review…',
  disabled: true
}

const createPrAction: PrimaryAction = {
  kind: 'create_pr',
  label: 'Create PR',
  title: 'Create a pull request for this branch',
  disabled: false
}

describe('resolveVisibleCreatePrHeaderAction', () => {
  it('hides the header when the hosted-review composer owns direct Create PR', () => {
    expect(
      resolveVisibleCreatePrHeaderAction({
        createPrHeaderAction: createPrAction,
        directCreatePrAction: createPrAction,
        isCreatePrIntentInFlight: false,
        primaryActionKind: 'create_pr',
        hasBranchChanges: true
      })
    ).toBeNull()
  })

  it('shows a disabled header when direct Create PR is available but the branch has no changes', () => {
    expect(
      resolveVisibleCreatePrHeaderAction({
        createPrHeaderAction: createPrAction,
        directCreatePrAction: createPrAction,
        isCreatePrIntentInFlight: false,
        primaryActionKind: 'create_pr',
        hasBranchChanges: false,
        hostedReviewCreation: {
          provider: 'github',
          review: null,
          canCreate: true,
          blockedReason: null,
          nextAction: null
        }
      })
    ).toEqual({
      kind: 'create_pr',
      label: 'Create PR',
      title: 'No changes on this branch to include in a pull request.',
      disabled: true
    })
  })

  it('hides the header while Create PR intent is in flight on the commit-area primary', () => {
    expect(
      resolveVisibleCreatePrHeaderAction({
        createPrHeaderAction: createPrIntentAction,
        directCreatePrAction: null,
        isCreatePrIntentInFlight: true,
        primaryActionKind: 'create_pr_intent'
      })
    ).toBeNull()
  })

  it('keeps the header visible when intent is in flight but the primary is a prerequisite action', () => {
    expect(
      resolveVisibleCreatePrHeaderAction({
        createPrHeaderAction: createPrIntentAction,
        directCreatePrAction: null,
        isCreatePrIntentInFlight: true,
        primaryActionKind: 'publish'
      })
    ).toEqual(createPrIntentAction)
  })
})
