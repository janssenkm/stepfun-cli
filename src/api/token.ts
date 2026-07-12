import { requestJson } from '../client/http';
import { genUrl } from '../client/urls';
import type { Config } from '../config/schema';

export interface TokenCountResponse {
  data: { total_tokens: number };
}

// Token counting is a model utility. Documented at POST /v1/token/count (public
// base); resolved at runtime via the management base with the same key.
export async function countTokens(
  config: Config,
  body: { model: string; messages: unknown[] },
): Promise<TokenCountResponse> {
  return requestJson<TokenCountResponse>(config, {
    url: genUrl(config, '/token/count'),
    method: 'POST',
    body,
  });
}
