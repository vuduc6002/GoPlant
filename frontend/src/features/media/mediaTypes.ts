export type MediaStatus = 'PENDING' | 'READY' | 'ATTACHED' | 'DELETING' | 'DELETED';

export interface MediaItem {
  id: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  status: MediaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MediaReadUrlResponse {
  mediaId: string;
  readUrl: string;
  expiresAt: string;
}

export interface LocalImageFile {
  uri: string;
  name?: string;
  type?: string;
  size?: number;
}

export interface UploadMediaOptions {
  expectedUserId?: string;
  expectedSessionGeneration?: number;
}
