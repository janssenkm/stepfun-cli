import { readFile } from 'fs/promises';
import { basename } from 'path';
import { request, requestJson } from '../client/http';
import { mgmtUrl } from '../client/urls';
import type { Config } from '../config/schema';

export interface FileObject {
  id: string;
  object: 'file';
  bytes?: number;
  created_at?: number;
  filename?: string;
  purpose?: string;
  status?: string;
  deleted?: boolean;
}

export interface FileList {
  object: 'list';
  data: FileObject[];
}

export interface UploadOpts {
  path?: string;
  url?: string;
  purpose: string;
}

export async function uploadFile(config: Config, opts: UploadOpts): Promise<FileObject> {
  const fd = new FormData();
  fd.append('purpose', opts.purpose);
  if (opts.path) {
    const buf = await readFile(opts.path);
    fd.append('file', new Blob([buf]), basename(opts.path));
  } else if (opts.url) {
    fd.append('url', opts.url);
  } else {
    throw new Error('uploadFile requires either path or url');
  }
  return requestJson<FileObject>(config, { url: mgmtUrl(config, '/files'), method: 'POST', body: fd });
}

export interface ListOpts {
  limit?: number;
  order?: 'asc' | 'desc';
  before?: string;
  after?: string;
}

export async function listFiles(config: Config, opts: ListOpts = {}): Promise<FileList> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.order) params.set('order', opts.order);
  if (opts.before) params.set('before', opts.before);
  if (opts.after) params.set('after', opts.after);
  const qs = params.toString();
  return requestJson<FileList>(config, { url: mgmtUrl(config, '/files') + (qs ? `?${qs}` : '') });
}

export async function getFile(config: Config, id: string): Promise<FileObject> {
  return requestJson<FileObject>(config, { url: mgmtUrl(config, `/files/${encodeURIComponent(id)}`) });
}

export async function deleteFile(config: Config, id: string): Promise<FileObject> {
  return requestJson<FileObject>(config, {
    url: mgmtUrl(config, `/files/${encodeURIComponent(id)}`),
    method: 'DELETE',
  });
}

// Raw content response — caller decides text vs binary (save to disk).
export async function getFileContent(config: Config, id: string): Promise<Response> {
  return request(config, { url: mgmtUrl(config, `/files/${encodeURIComponent(id)}/content`) });
}
