export type FilePurpose = 'file-extract' | 'retrieval-text' | 'retrieval-image' | 'storage';

/** Metadata returned by the StepFun Files API. */
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

export interface FileListResponse {
  object: 'list';
  data: FileObject[];
}
