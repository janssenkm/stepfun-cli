export interface InteractiveOpts {
  nonInteractive?: boolean;
}

export function isInteractive(opts: InteractiveOpts): boolean {
  return !opts.nonInteractive && !!process.stdin.isTTY;
}
