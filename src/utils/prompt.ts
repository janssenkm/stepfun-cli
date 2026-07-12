import * as readline from 'readline';

export async function promptText(opts: { message: string; defaultValue?: string }): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const suffix = opts.defaultValue ? ` [${opts.defaultValue}]` : '';
    return await new Promise<string>((resolve) => {
      rl.question(`${opts.message}${suffix}: `, (answer) => {
        resolve((answer.trim() || opts.defaultValue || '').trim());
      });
    });
  } finally {
    rl.close();
  }
}

export async function confirm(opts: { message: string; defaultYes?: boolean }): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const hint = opts.defaultYes ? 'Y/n' : 'y/N';
    return await new Promise<boolean>((resolve) => {
      rl.question(`${opts.message} (${hint}): `, (answer) => {
        const a = answer.trim().toLowerCase();
        if (!a) resolve(!!opts.defaultYes);
        else resolve(a === 'y' || a === 'yes');
      });
    });
  } finally {
    rl.close();
  }
}
