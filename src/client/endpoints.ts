/** Canonical API paths shared by request and dry-run implementations. */
export const ENDPOINTS = {
  chatCompletions: '/chat/completions',
  audioSpeech: '/audio/speech',
  audioTranscription: '/audio/asr/sse',
  imageEdits: '/images/edits',
  files: '/files'
} as const;

/** Returns the metadata or delete endpoint for a file ID. */
export function fileEndpoint(fileId: string): string {
  return `${ENDPOINTS.files}/${encodeURIComponent(fileId)}`;
}

/** Returns the parsed-content endpoint for a file ID. */
export function fileContentEndpoint(fileId: string): string {
  return `${fileEndpoint(fileId)}/content`;
}

/** Joins a configured base URL and API path without producing duplicate slashes. */
export function endpointUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
}
