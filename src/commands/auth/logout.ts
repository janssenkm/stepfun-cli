import { defineCommand } from '../../command';
import { readConfigFile, writeConfigFile } from '../../config/loader';
import { isInteractive } from '../../utils/env';
import { confirm } from '../../utils/prompt';

export default defineCommand({
  name: 'auth logout',
  description: 'Remove the saved StepFun API key',
  usage: 'stepfun auth logout',
  async run(_config, flags) {
    const cur = readConfigFile();
    if (!cur.apiKey) {
      process.stderr.write('Not logged in.\n');
      return;
    }
    if (isInteractive({ nonInteractive: flags.nonInteractive as boolean }) && !flags.yes) {
      const ok = await confirm({ message: 'Remove the saved API key?', defaultYes: false });
      if (!ok) {
        process.stderr.write('Cancelled.\n');
        return;
      }
    }
    delete cur.apiKey;
    await writeConfigFile(cur as Record<string, unknown>);
    process.stderr.write('Logged out. API key removed.\n');
  },
});
