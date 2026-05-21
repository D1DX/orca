export function shouldSendSyntheticTitleFrame(args: {
  force: boolean
  windowVisible: boolean
  windowFocused: boolean
}): boolean {
  void args.windowFocused
  return args.force || args.windowVisible
}
