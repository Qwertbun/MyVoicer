export type RuntimeVersion = "v1" | "v2";

export const WS_PROTOCOL_VERSION = 2 as const;

export interface WsEnvelope<TPayload = unknown> {
  v: typeof WS_PROTOCOL_VERSION;
  type: string;
  requestId: string;
  payload: TPayload;
}

export interface AckPayload<TData = unknown> {
  ok: boolean;
  requestId: string;
  data?: TData;
  errorCode?: string;
  message?: string;
}

export type AckEnvelope<TData = unknown> = WsEnvelope<AckPayload<TData>>;

export interface RoomJoinPayload {
  roomId: string;
  name: string;
  authorId?: string;
}

export interface SignalForwardPayload {
  to: string;
  payload: Record<string, unknown>;
}

export interface RelayEnvelopePayload {
  roomId: string;
  messageId: string;
  senderId: string;
  createdAt: number;
  v: number;
  alg: string;
  iv: string;
  ciphertext: string;
  transportVersion?: number;
  attachmentRefs?: Array<{
    messageId: string;
    attachmentId: string;
    name?: string;
    mimeType?: string;
    size?: number;
    transport?: string;
    objectKey?: string;
  }>;
}

export interface CapabilityTokenResponse {
  token: string;
  expiresAt: number;
  roomId: string;
}

export interface RuntimeInfo {
  runtimeVersion: RuntimeVersion;
  networkMode: "server" | "p2p" | "relay";
  remoteBackendConfigured: boolean;
  environmentLocked: boolean;
}
