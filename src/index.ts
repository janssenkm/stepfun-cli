#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, saveConfig, REGION_URLS } from './config';
import { StepFunClient } from './api';
import { CLI_VERSION } from './version';
import fs from 'fs';
import prompts from 'prompts';

const program = new Command();
program.enablePositionalOptions();
const config = loadConfig();

const SUPPORTED_MODELS = {
  text: ['step-3.5-flash', 'step-3.5-flash-2603', 'step-3.7-flash'],
  speech: ['stepaudio-2.5-tts', 'stepaudio-2.5-asr'],
  image: ['step-image-edit-2']
};

function maskApiKey(apiKey?: string) {
  if (!apiKey) return undefined;
  if (apiKey.length <= 8) return '********';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function validRegions() {
  return Object.keys(REGION_URLS).join(', ');
}

function validateRegion(region: string) {
  if (!REGION_URLS[region]) {
    console.error(`Unknown region: ${region}. Valid options: ${validRegions()}`);
    process.exit(1);
  }
  return region;
}

program
  .name('stepfun')
  .description('StepFun Command Line Interface')
  .version(CLI_VERSION)
  .option('--api-key <key>', 'API key (overrides all other auth)')
  .option('--region <region>', 'API region (StepPlan-CN, StepPlan-Global, PayGo-CN, PayGo-Global)', config.region || 'PayGo-CN')
  .option('--base-url <url>', 'API base URL (overrides region)')
  .option('--output <format>', 'Output format: text, json', 'text')
  .option('--quiet', 'Suppress non-essential output')
  .option('--verbose', 'Print HTTP request/response details')
  .option('--no-color', 'Disable ANSI colors and spinners');

function getClient(options: any) {
  const apiKey = options.apiKey || config.apiKey || process.env.STEPFUN_API_KEY;
  if (!apiKey) {
    console.error('Error: API key is required. Run `stepfun auth login` or use --api-key');
    process.exit(1);
  }
  const region = validateRegion(options.region || config.region || 'PayGo-CN');
  const baseUrl = options.baseUrl || config.baseUrl || REGION_URLS[region];
  return new StepFunClient(apiKey, baseUrl);
}

// Auth Command
const authCmd = program.command('auth').description('Authentication');

authCmd.command('login')
  .description('Authenticate and set region via interactive prompt')
  .action(async () => {
    const response = await prompts([
      {
        type: 'select',
        name: 'region',
        message: 'Please select your StepFun API region:',
        choices: [
          { title: 'StepPlan-CN (国内版 StepPlan)', value: 'StepPlan-CN' },
          { title: 'StepPlan-Global (国际版 StepPlan)', value: 'StepPlan-Global' },
          { title: 'PayGo-CN (国内版 纯API按量计费)', value: 'PayGo-CN' },
          { title: 'PayGo-Global (国际版 纯API按量计费)', value: 'PayGo-Global' }
        ],
        initial: Math.max(0, Object.keys(REGION_URLS).indexOf(config.region || 'PayGo-CN'))
      },
      {
        type: 'password',
        name: 'apiKey',
        message: prev => `Please enter your API Key for ${prev}:`
      }
    ]);

    if (response.region && response.apiKey) {
      saveConfig({ region: response.region, apiKey: response.apiKey, baseUrl: undefined });
      console.log(`\nRegion set to ${response.region} (${REGION_URLS[response.region]})`);
      console.log('API Key saved successfully.');
    } else {
      console.log('Login cancelled.');
    }
  });

authCmd.command('status')
  .description('Show authentication status')
  .action(() => {
    const parentOptions = program.opts();
    const currentConfig = loadConfig();
    const envApiKey = process.env.STEPFUN_API_KEY;
    const apiKey = parentOptions.apiKey || currentConfig.apiKey || envApiKey;
    const authSource = parentOptions.apiKey ? '--api-key' : currentConfig.apiKey ? 'config' : envApiKey ? 'STEPFUN_API_KEY' : 'none';
    const region = validateRegion(parentOptions.region || currentConfig.region || 'PayGo-CN');
    const baseUrl = parentOptions.baseUrl || currentConfig.baseUrl || REGION_URLS[region];
    const status = {
      authenticated: Boolean(apiKey),
      authSource,
      apiKey: maskApiKey(apiKey),
      region,
      baseUrl
    };

    if (parentOptions.output === 'json') {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(`Authenticated: ${status.authenticated ? 'yes' : 'no'}`);
      console.log(`Auth source: ${status.authSource}`);
      if (status.apiKey) console.log(`API key: ${status.apiKey}`);
      console.log(`Region: ${status.region}`);
      console.log(`Base URL: ${status.baseUrl}`);
    }
  });

// Config Command
const configCmd = program.command('config').description('CLI configuration');

configCmd.command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    if (key === 'api_key') {
      saveConfig({ apiKey: value });
      console.log('API key saved.');
    } else if (key === 'base_url') {
      saveConfig({ baseUrl: value });
      console.log('Base URL saved.');
    } else if (key === 'region') {
      if (!REGION_URLS[value]) {
        console.error(`Unknown region: ${value}. Valid options: ${validRegions()}`);
        process.exitCode = 1;
        return;
      }
      saveConfig({ region: value, baseUrl: undefined });
      console.log(`Region saved as ${value} (${REGION_URLS[value]}).`);
    } else {
      console.error(`Unknown config key: ${key}`);
      process.exitCode = 1;
    }
  });

configCmd.command('show')
  .description('Show current configuration')
  .action(() => {
    const currentConfig = loadConfig();
    console.log(JSON.stringify({
      ...currentConfig,
      apiKey: maskApiKey(currentConfig.apiKey)
    }, null, 2));
  });

// Models Command
const modelsCmd = program.command('models').description('Model discovery');

modelsCmd.command('list')
  .description('List supported models')
  .action(() => {
    const parentOptions = program.opts();

    if (parentOptions.output === 'json') {
      console.log(JSON.stringify(SUPPORTED_MODELS, null, 2));
    } else {
      console.log('Text:');
      SUPPORTED_MODELS.text.forEach(model => console.log(`  - ${model}`));
      console.log('Speech:');
      SUPPORTED_MODELS.speech.forEach(model => console.log(`  - ${model}`));
      console.log('Image:');
      SUPPORTED_MODELS.image.forEach(model => console.log(`  - ${model}`));
    }
  });

// Text Command
const textCmd = program.command('text').description('Text generation (chat)');

textCmd.command('chat')
  .description('Start a chat completion')
  .requiredOption('-p, --prompt <text>', 'Prompt text')
  .option('-m, --model <model>', 'Model name', 'step-3.5-flash')
  .action(async (options) => {
    const parentOptions = program.opts();
    const client = getClient(parentOptions);
    try {
      const messages = [{ role: 'user', content: options.prompt }];
      const result = await client.chatCompletion(options.model, messages);
      
      if (parentOptions.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const content = result.choices?.[0]?.message?.content || '';
        console.log(content);
      }
    } catch (err: any) {
      console.error(err.message);
    }
  });

// Speech Command
const speechCmd = program.command('speech').description('Speech generation and recognition');

speechCmd.command('synthesize')
  .description('Synthesize speech from text')
  .requiredOption('-t, --text <text>', 'Text to synthesize')
  .option('-o, --output <file>', 'Output file path', 'output.wav')
  .option('-v, --voice <voice>', 'Voice name', 'cixingnan')
  .option('-m, --model <model>', 'Model name', 'stepaudio-2.5-tts')
  .action(async (options) => {
    const parentOptions = program.opts();
    const client = getClient(parentOptions);
    try {
      if (!parentOptions.quiet) console.log(`Synthesizing text to ${options.output}...`);
      const buffer = await client.audioSynthesize(options.model, options.text, options.voice);
      fs.writeFileSync(options.output, buffer);
      if (!parentOptions.quiet) console.log('Done.');
    } catch (err: any) {
      console.error(err.message);
    }
  });

speechCmd.command('recognize')
  .description('Recognize text from speech')
  .requiredOption('-f, --file <file>', 'Audio file path')
  .option('-m, --model <model>', 'Model name', 'stepaudio-2.5-asr')
  .action(async (options) => {
    const parentOptions = program.opts();
    const client = getClient(parentOptions);
    try {
      if (!parentOptions.quiet) console.log(`Recognizing speech from ${options.file}...`);
      const result = await client.audioTranscribe(options.model, options.file);
      
      if (parentOptions.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.text || result);
      }
    } catch (err: any) {
      console.error(err.message);
    }
  });

// Image Command
const imageCmd = program.command('image').description('Image tools');

imageCmd.command('edit')
  .description('Edit an image')
  .requiredOption('-f, --file <file>', 'Image file to edit')
  .requiredOption('-p, --prompt <text>', 'Prompt text for edit')
  .option('-m, --model <model>', 'Model name', 'step-image-edit-2')
  .action(async (options) => {
    const parentOptions = program.opts();
    const client = getClient(parentOptions);
    try {
      if (!parentOptions.quiet) console.log(`Editing image ${options.file}...`);
      const result = await client.imageEdit(options.model, options.file, options.prompt);
      
      if (parentOptions.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result); // Assume response has urls or similar, will just output json anyway if complex
      }
    } catch (err: any) {
      console.error(err.message);
    }
  });

program.parse(process.argv);
