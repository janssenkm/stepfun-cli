import { readFileSync } from 'fs';
import { readStdin } from './fs';
import { fileToDataUrl } from './fs';
import { imageMimeForExt, audioMimeForExt } from './mime';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';
import { describeFile, ensureFileExists } from './fs';

export interface BuiltMessage {
  role: string;
  content: unknown; // string or multipart array
}

export interface BuiltConversation {
  system?: string;
  messages: BuiltMessage[];
}

export interface MessageFlags {
  message?: string[]; // repeatable; optional "role:" prefix
  messagesFile?: string; // JSON file or "-" for stdin
  system?: string;
  image?: string[]; // paths/URLs
  video?: string[];
  audio?: string[];
}

function parseMessage(raw: string): BuiltMessage {
  const m = raw.match(/^([a-zA-Z]+):\s*([\s\S]*)$/);
  if (m) return { role: m[1]!, content: m[2]! };
  return { role: 'user', content: raw };
}

async function toAttachment(kind: 'image' | 'video' | 'audio', ref: string): Promise<Record<string, unknown>> {
  if (/^https?:\/\//.test(ref)) {
    const url = ref;
    if (kind === 'image') return { type: 'image_url', image_url: { url } };
    if (kind === 'video') return { type: 'video_url', video_url: { url } };
    return { type: 'input_audio', input_audio: { data: url } };
  }
  // local file → data URL
  ensureFileExists(ref, kind);
  const { ext } = describeFile(ref);
  if (kind === 'image') {
    const url = await fileToDataUrl(ref, imageMimeForExt(ext));
    return { type: 'image_url', image_url: { url } };
  }
  if (kind === 'video') {
    throw new CLIError('Local video input must be a public URL.', ExitCode.USAGE);
  }
  const url = await fileToDataUrl(ref, audioMimeForExt(ext));
  return { type: 'input_audio', input_audio: { data: url } };
}

/** Build { system, messages } from the standard chat flags. */
export async function buildConversation(flags: Record<string, unknown>): Promise<BuiltConversation> {
  const f: MessageFlags = {
    message: flags.message as string[] | undefined,
    messagesFile: flags.messagesFile as string | undefined,
    system: flags.system as string | undefined,
    image: flags.image as string[] | undefined,
    video: flags.video as string[] | undefined,
    audio: flags.audio as string[] | undefined,
  };
  let messages: BuiltMessage[] = [];
  if (f.messagesFile) {
    let raw: string;
    if (f.messagesFile === '-') raw = await readStdin();
    else raw = readFileSync(f.messagesFile, 'utf-8');
    try {
      messages = JSON.parse(raw);
    } catch {
      throw new CLIError(`--messages-file is not valid JSON: ${f.messagesFile}`, ExitCode.USAGE);
    }
    if (!Array.isArray(messages)) {
      throw new CLIError('--messages-file must contain a JSON array of messages', ExitCode.USAGE);
    }
    for (const [index, message] of messages.entries()) {
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new CLIError(`--messages-file message ${index + 1} must be an object`, ExitCode.USAGE);
      }
      if (typeof message.role !== 'string' || !message.role) {
        throw new CLIError(`--messages-file message ${index + 1} must have a role`, ExitCode.USAGE);
      }
      if (!Object.prototype.hasOwnProperty.call(message, 'content')) {
        throw new CLIError(`--messages-file message ${index + 1} must have content`, ExitCode.USAGE);
      }
    }
  } else if (f.message && f.message.length > 0) {
    messages = f.message.map(parseMessage);
  }

  if (messages.length === 0) {
    throw new CLIError(
      'No messages. Pass --message (repeatable) or --messages-file.',
      ExitCode.USAGE,
    );
  }

  // Attach multimodal inputs to the last user turn.
  const attachments: Record<string, unknown>[] = [];
  const kinds: Array<['image' | 'video' | 'audio', string[]]> = [
    ['image', f.image ?? []],
    ['video', f.video ?? []],
    ['audio', f.audio ?? []],
  ];
  for (const [kind, refs] of kinds) {
    for (const ref of refs) attachments.push(await toAttachment(kind, ref));
  }
  if (attachments.length > 0) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      throw new CLIError('--image/--video/--audio require a user message to attach to.', ExitCode.USAGE);
    }
    const text = typeof lastUser.content === 'string' ? lastUser.content : '';
    lastUser.content = [
      ...(text ? [{ type: 'text', text }] : []),
      ...attachments,
    ];
  }

  return { system: f.system, messages };
}
