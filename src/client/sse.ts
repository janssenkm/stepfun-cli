/**
 * Incrementally parses SSE data fields without assuming network chunks align
 * with lines or event boundaries. Non-data fields and comments are ignored.
 */
export async function* parseSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];

  const consumeLine = (rawLine: string): string | undefined => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      if (dataLines.length === 0) return undefined;
      const data = dataLines.join('\n');
      dataLines = [];
      return data;
    }
    if (line.startsWith(':')) return undefined;
    if (line === 'data') dataLines.push('');
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    return undefined;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const data = consumeLine(line);
        if (data !== undefined) yield data;
      }
    }

    buffer += decoder.decode();
    if (buffer) {
      const data = consumeLine(buffer);
      if (data !== undefined) yield data;
    }
    if (dataLines.length > 0) yield dataLines.join('\n');
  } finally {
    reader.releaseLock();
  }
}
