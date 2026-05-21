import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeBox = vi.hoisted(() => ({
  state: {
    activeModal: null as string | null
  }
}))

const selectorMocks = vi.hoisted(() => ({
  getRepoMapFromState: vi.fn(() => new Map()),
  useAllWorktrees: vi.fn(() => [])
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof storeBox.state) => unknown) => selector(storeBox.state),
    {
      getState: () => storeBox.state
    }
  )
}))

vi.mock('@/store/selectors', () => ({
  getRepoMapFromState: selectorMocks.getRepoMapFromState,
  useAllWorktrees: selectorMocks.useAllWorktrees
}))

vi.mock('@/components/ui/command', () => ({
  CommandDialog: () => null,
  CommandEmpty: () => null,
  CommandInput: () => null,
  CommandItem: () => null,
  CommandList: () => null
}))

vi.mock('@/components/sidebar/StatusIndicator', () => ({
  default: () => null
}))

describe('WorktreeJumpPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeBox.state.activeModal = null
  })

  it('does not mount broad workspace selectors while the lazy palette is closed', async () => {
    const { default: WorktreeJumpPalette } = await import('./WorktreeJumpPalette')

    expect(WorktreeJumpPalette()).toBeNull()
    expect(selectorMocks.useAllWorktrees).not.toHaveBeenCalled()
  })
})
