// ============================================================================
// 1. MESSAGING PRIMITIVE CONTRACT
// ============================================================================
export interface SendMessagePayload {
  recipientId: string; // User ID, phone number, or chat ID
  channel: "EMAIL" | "SMS" | "WHATSAPP" | "IN_APP" | "SYSTEM";
  templateId?: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  messageId: string;
  status: "QUEUED" | "SENT" | "FAILED";
  timestamp: number;
}

export interface IMessagingProvider {
  sendMessage(payload: SendMessagePayload): Promise<SendMessageResult>;
  sendBatch(payloads: SendMessagePayload[]): Promise<SendMessageResult[]>;
}

// ============================================================================
// 2. DATA STORAGE PRIMITIVE CONTRACT
// ============================================================================
export interface UploadAssetOptions {
  tenantId: string;
  category: "MENU" | "ROOM_GALLERY" | "DOCUMENT" | "USER_AVATAR";
  contentType: string;
  isPublic?: boolean;
}

export interface StoredAsset {
  assetId: string;
  url: string;
  hash: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  upload(fileBuffer: Buffer, options: UploadAssetOptions): Promise<StoredAsset>;
  getDownloadUrl(assetId: string): Promise<string>;
  delete(assetId: string): Promise<boolean>;
}

// ============================================================================
// 3. PLATFORM JOBS PRIMITIVE CONTRACT
// ============================================================================
export interface DispatchJobOptions {
  jobName: string;
  payload: Record<string, unknown>;
  delayMs?: number;
  scheduledAt?: Date;
  deduplicationKey?: string;
}

export interface IJobDispatcher {
  dispatch(options: DispatchJobOptions): Promise<{ jobId: string; status: "DISPATCHED" }>;
}
