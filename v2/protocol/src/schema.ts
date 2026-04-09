import { WS_PROTOCOL_VERSION, type AckEnvelope, type AckPayload, type WsEnvelope } from "./contracts";

export function makeEnvelope<TPayload>(type: string, requestId: string, payload: TPayload): WsEnvelope<TPayload> {
  return {
    v: WS_PROTOCOL_VERSION,
    type,
    requestId,
    payload,
  };
}

export function makeAck<TData = unknown>(requestId: string, payload: AckPayload<TData>): AckEnvelope<TData> {
  return makeEnvelope("ack", requestId, {
    ok: Boolean(payload.ok),
    requestId,
    data: payload.data,
    errorCode: payload.errorCode,
    message: payload.message,
  });
}

export function isProtocolEnvelope(value: unknown): value is WsEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<WsEnvelope>;
  return candidate.v === WS_PROTOCOL_VERSION
    && typeof candidate.type === "string"
    && typeof candidate.requestId === "string"
    && "payload" in candidate;
}
