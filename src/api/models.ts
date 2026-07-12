import { requestJson } from '../client/http';
import { mgmtUrl } from '../client/urls';
import type { Config } from '../config/schema';

// Model catalog — management base (/v1). Lists the models your key can access;
// treat this as the source of truth (the set differs by region and evolves).

export interface Model {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

export interface ModelList {
  object: 'list';
  data: Model[];
}

export async function listModels(config: Config): Promise<ModelList> {
  return requestJson<ModelList>(config, { url: mgmtUrl(config, '/models') });
}

export async function getModel(config: Config, id: string): Promise<Model> {
  return requestJson<Model>(config, { url: mgmtUrl(config, `/models/${encodeURIComponent(id)}`) });
}
