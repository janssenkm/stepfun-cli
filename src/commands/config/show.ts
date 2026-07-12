import { defineCommand } from '../../command';
import { readConfigFile } from '../../config/loader';
import { REGIONS, DEFAULT_REGION, type Region } from '../../config/regions';
import { getConfigPath } from '../../config/paths';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { maskKey } from '../../utils/redact';

export default defineCommand({
  name: 'config show',
  description: 'Show resolved CLI configuration',
  usage: 'stepfun config show',
  async run(_config, flags) {
    const file = readConfigFile();
    const region = (file.region || DEFAULT_REGION) as Region;
    const profile = REGIONS[region];
    const format = detectOutputFormat(flags.output as string | undefined);

    const data = {
      configPath: getConfigPath(),
      apiKey: maskKey(file.apiKey),
      region,
      genBaseUrl: file.genBaseUrl ?? profile.genBase,
      apiBaseUrl: file.apiBaseUrl ?? profile.apiBase,
      output: file.output ?? 'text',
      timeout: file.timeout ?? 120,
      defaults: {
        text: file.defaultTextModel ?? 'step-3.7-flash',
        speechTts: file.defaultSpeechTtsModel ?? 'stepaudio-2.5-tts',
        speechAsr: file.defaultSpeechAsrModel ?? 'stepaudio-2.5-asr',
        image: file.defaultImageModel ?? 'step-image-edit-2',
      },
    };

    if (format === 'json') {
      process.stdout.write(formatOutput(data, format) + '\n');
    } else {
      process.stdout.write(formatOutput(data, 'text') + '\n');
    }
  },
});
