import { ExitCode } from './codes';

// Domain error carrying an exit code and an optional actionable hint. Thrown
// throughout the CLI and rendered (text or JSON) by errors/handler.ts.
export class CLIError extends Error {
  readonly exitCode: ExitCode;
  readonly hint?: string;

  constructor(message: string, exitCode: ExitCode = ExitCode.GENERAL, hint?: string) {
    super(message);
    this.name = 'CLIError';
    this.exitCode = exitCode;
    this.hint = hint;
  }

  toJSON() {
    return {
      error: {
        code: this.exitCode,
        message: this.message,
        ...(this.hint ? { hint: this.hint } : {}),
      },
    };
  }
}
