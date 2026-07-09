import fs from 'fs';
import path from 'path';
import { ENDPOINTS, fileContentEndpoint, fileEndpoint } from '../client/endpoints';
import { HttpClient } from '../client/http';
import type { FileListResponse, FileObject, FilePurpose } from './types';

/** Capability service for the StepFun Files API. */
export class FileService {
  private readonly http: HttpClient;

  constructor(apiKey: string, baseUrl: string, timeoutSeconds: number, verbose = false) {
    this.http = new HttpClient(apiKey, baseUrl, timeoutSeconds * 1000, verbose);
  }

  async uploadLocal(filePath: string, purpose: FilePurpose): Promise<FileObject> {
    const bytes = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', new Blob([bytes]), path.basename(filePath));
    return await this.http.requestJson<FileObject>({ endpoint: ENDPOINTS.files, method: 'POST', body: form });
  }

  async uploadUrl(url: string, purpose: FilePurpose): Promise<FileObject> {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('url', url);
    return await this.http.requestJson<FileObject>({ endpoint: ENDPOINTS.files, method: 'POST', body: form });
  }

  async list(): Promise<FileListResponse> {
    return await this.http.requestJson<FileListResponse>({ endpoint: ENDPOINTS.files, method: 'GET' });
  }

  async get(fileId: string): Promise<FileObject> {
    return await this.http.requestJson<FileObject>({ endpoint: fileEndpoint(fileId), method: 'GET' });
  }

  async content(fileId: string): Promise<string> {
    return await this.http.requestText({ endpoint: fileContentEndpoint(fileId), method: 'GET' });
  }

  async delete(fileId: string): Promise<FileObject> {
    return await this.http.requestJson<FileObject>({ endpoint: fileEndpoint(fileId), method: 'DELETE' });
  }
}
