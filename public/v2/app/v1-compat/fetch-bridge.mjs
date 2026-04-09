const RELAY_CHUNK_SIZE_BYTES_FALLBACK = 16 * 1024 * 1024;
const relayUploadUrlPartMeta = new Map();
const relayUploadedEtagsBySession = new Map();

function normalizeUrlKey(urlText) {
  const raw = String(urlText || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw, window.location.origin);
    if (url.searchParams.has("capability")) {
      url.searchParams.delete("capability");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function rememberUploadPartMeta(uploadUrl, sessionId, partNumber) {
  const key = normalizeUrlKey(uploadUrl);
  const cleanSessionId = String(sessionId || "").trim();
  const cleanPartNumber = Math.round(Number(partNumber) || 0);
  if (!key || !cleanSessionId || cleanPartNumber <= 0) {
    return;
  }

  relayUploadUrlPartMeta.set(key, {
    sessionId: cleanSessionId,
    partNumber: cleanPartNumber,
  });
}

function rememberUploadedPartEtag(sessionId, partNumber, etag) {
  const cleanSessionId = String(sessionId || "").trim();
  const cleanPartNumber = Math.round(Number(partNumber) || 0);
  const cleanEtag = String(etag || "").replace(/"/g, "").trim();
  if (!cleanSessionId || cleanPartNumber <= 0 || !cleanEtag) {
    return;
  }

  if (!relayUploadedEtagsBySession.has(cleanSessionId)) {
    relayUploadedEtagsBySession.set(cleanSessionId, new Map());
  }
  relayUploadedEtagsBySession.get(cleanSessionId).set(cleanPartNumber, cleanEtag);
}

function normalizeRelayErrorPayload(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const next = { ...payload };
  if (!next.error && (next.errorCode || next.message)) {
    next.error = String(next.errorCode || next.message || "").trim();
  }
  return next;
}

function buildJsonResponseFrom(originalResponse, payload) {
  const headers = new Headers(originalResponse.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers,
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function cloneHeaders(inputHeaders) {
  const next = new Headers();
  if (!inputHeaders) {
    return next;
  }

  const source = new Headers(inputHeaders);
  for (const [key, value] of source.entries()) {
    next.set(key, value);
  }
  return next;
}

async function parseJsonBodyIfPossible(init) {
  if (!init || typeof init !== "object") {
    return null;
  }

  const body = init.body;
  if (typeof body !== "string" || !body.trim()) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function stringifyBody(bodyObject) {
  if (!bodyObject || typeof bodyObject !== "object") {
    return null;
  }
  return JSON.stringify(bodyObject);
}

function mapRelayUploadInitRequest(body) {
  if (!body || typeof body !== "object") {
    return body;
  }

  const next = { ...body };
  const size = Number(next.size);
  if (Number.isFinite(size) && size > 0) {
    next.totalBytes = Math.round(size);
  }
  if (next.capability && !next.token) {
    next.token = next.capability;
  }
  return next;
}

function mapRelayUploadCompleteRequest(body) {
  if (!body || typeof body !== "object") {
    return body;
  }

  const next = { ...body };
  if (next.capability && !next.token) {
    next.token = next.capability;
  }

  if (Array.isArray(next.parts)) {
    next.parts = next.parts
      .map((item) => ({
        partNumber: Number(item?.partNumber) || 0,
        eTag: String(item?.eTag || item?.etag || "").trim(),
      }))
      .filter((item) => item.partNumber > 0 && item.eTag);
  }

  return next;
}

function mapRelayRequestBody(pathname, bodyObject) {
  if (!bodyObject || typeof bodyObject !== "object") {
    return bodyObject;
  }

  if (pathname.endsWith("/uploads/init")) {
    return mapRelayUploadInitRequest(bodyObject);
  }
  if (pathname.endsWith("/uploads/complete")) {
    return mapRelayUploadCompleteRequest(bodyObject);
  }

  const next = { ...bodyObject };
  if (next.capability && !next.token) {
    next.token = next.capability;
  }
  return next;
}

function mapRelayResponse(pathname, payload) {
  const normalized = normalizeRelayErrorPayload(payload);
  if (!normalized || typeof normalized !== "object") {
    return normalized;
  }

  const next = { ...normalized };

  if (pathname.endsWith("/uploads/init")) {
    if (!next.uploadId) {
      next.uploadId = String(next.sessionId || "").trim();
    }
    const limits = next.limits && typeof next.limits === "object" ? next.limits : {};
    next.limits = {
      ...limits,
      chunkSizeBytes: Number(limits.chunkSizeBytes) > 0
        ? Math.round(Number(limits.chunkSizeBytes))
        : RELAY_CHUNK_SIZE_BYTES_FALLBACK,
    };
  }

  if (pathname.endsWith("/uploads/part-url") && !next.url) {
    next.url = String(next.uploadUrl || "").trim();
  }

  if (pathname.endsWith("/uploads/status")) {
    const uploadedMap = relayUploadedEtagsBySession.get(String(next.sessionId || "").trim()) || new Map();
    const uploadedParts = Array.isArray(next.uploadedParts) ? next.uploadedParts : [];
    const normalizedParts = uploadedParts
      .map((item) => {
        if (typeof item === "number") {
          const partNumber = Math.round(item);
          if (!Number.isFinite(partNumber) || partNumber <= 0) {
            return null;
          }
          const knownEtag = uploadedMap.get(partNumber);
          return {
            partNumber,
            etag: knownEtag || `part-${partNumber}`,
          };
        }

        const partNumber = Math.round(Number(item?.partNumber) || 0);
        if (!Number.isFinite(partNumber) || partNumber <= 0) {
          return null;
        }

        const knownEtag = uploadedMap.get(partNumber);
        const etag = String(item?.etag || item?.eTag || knownEtag || `part-${partNumber}`).trim();
        return {
          partNumber,
          etag: etag || `part-${partNumber}`,
        };
      })
      .filter(Boolean);

    if (normalizedParts.length === 0 && uploadedMap.size > 0) {
      next.uploadedParts = Array.from(uploadedMap.entries())
        .map(([partNumber, etag]) => ({
          partNumber: Math.round(Number(partNumber) || 0),
          etag: String(etag || "").trim() || `part-${partNumber}`,
        }))
        .filter((item) => item.partNumber > 0)
        .sort((left, right) => left.partNumber - right.partNumber);
    } else {
      next.uploadedParts = normalizedParts;
    }
  }

  if (pathname.endsWith("/attachments/download-url") && !next.url) {
    next.url = String(next.downloadUrl || "").trim();
  }

  return next;
}

function mapNetworkModeResponse(payload) {
  const normalized = normalizeRelayErrorPayload(payload);
  const relayUploads = normalized?.relayUploads && typeof normalized.relayUploads === "object"
    ? normalized.relayUploads
    : {};
  const limits = relayUploads?.limits && typeof relayUploads.limits === "object"
    ? relayUploads.limits
    : {};

  return {
    mode: "relay",
    relayUploads: {
      provider: String(relayUploads.provider || "memory-v2").trim(),
      limits: {
        maxFileBytes: Number(limits.maxFileBytes) > 0
          ? Math.round(Number(limits.maxFileBytes))
          : 10 * 1024 * 1024 * 1024,
        maxTotalMessageBytes: Number(limits.maxTotalMessageBytes) > 0
          ? Math.round(Number(limits.maxTotalMessageBytes))
          : 10 * 1024 * 1024 * 1024,
        chunkSizeBytes: Number(limits.chunkSizeBytes) > 0
          ? Math.round(Number(limits.chunkSizeBytes))
          : RELAY_CHUNK_SIZE_BYTES_FALLBACK,
      },
    },
  };
}

function rewriteRelayPath(pathname) {
  if (!pathname.startsWith("/api/relay/")) {
    return pathname;
  }
  return pathname.replace("/api/relay/", "/api/v2/relay/");
}

export function installV1CompatFetchBridge() {
  if (window.__SYNTO_V1_COMPAT_FETCH_BRIDGE__) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const urlText = typeof input === "string" ? input : input?.url;
    if (!urlText || typeof urlText !== "string") {
      return nativeFetch(input, init);
    }

    const url = new URL(urlText, window.location.origin);
    const knownUploadPart = relayUploadUrlPartMeta.get(normalizeUrlKey(url.toString()));
    if (
      knownUploadPart
      && String(init?.method || "GET").trim().toUpperCase() === "PUT"
    ) {
      const response = await nativeFetch(input, init);
      if (response.ok) {
        const etag = response.headers.get("etag") || response.headers.get("ETag");
        rememberUploadedPartEtag(knownUploadPart.sessionId, knownUploadPart.partNumber, etag);
      }
      return response;
    }

    if (url.pathname === "/api/network-mode") {
      const response = await nativeFetch("/api/v2/network-mode", init);
      const payload = await parseJsonResponse(response);
      if (!payload || typeof payload !== "object") {
        return response;
      }
      return buildJsonResponseFrom(response, mapNetworkModeResponse(payload));
    }

    if (url.pathname === "/api/notifications/check") {
      return new Response(
        JSON.stringify({
          rooms: [],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      );
    }

    if (!url.pathname.startsWith("/api/relay/")) {
      return nativeFetch(input, init);
    }

    const relayPathname = rewriteRelayPath(url.pathname);
    const relayUrl = new URL(relayPathname, window.location.origin);
    relayUrl.search = url.search;
    if (relayUrl.searchParams.has("capability") && !relayUrl.searchParams.has("token")) {
      relayUrl.searchParams.set("token", relayUrl.searchParams.get("capability") || "");
    }

    const requestHeaders = cloneHeaders(init?.headers);
    const jsonBody = await parseJsonBodyIfPossible(init);
    const mappedBodyObject = mapRelayRequestBody(url.pathname, jsonBody);

    const nextInit = {
      ...init,
      headers: requestHeaders,
      body: jsonBody ? stringifyBody(mappedBodyObject) : init?.body,
    };

    if (jsonBody && !requestHeaders.get("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }

    const response = await nativeFetch(relayUrl.toString(), nextInit);
    const payload = await parseJsonResponse(response);
    if (!payload || typeof payload !== "object") {
      return response;
    }

    const mappedPayload = mapRelayResponse(url.pathname, payload);
    if (url.pathname.endsWith("/uploads/part-url")) {
      const sessionId = String(mappedPayload?.sessionId || jsonBody?.sessionId || "").trim();
      const partNumber = Number(mappedPayload?.partNumber || jsonBody?.partNumber);
      const uploadUrl = String(mappedPayload?.url || "").trim();
      rememberUploadPartMeta(uploadUrl, sessionId, partNumber);
    }
    return buildJsonResponseFrom(response, mappedPayload);
  };

  window.__SYNTO_V1_COMPAT_FETCH_BRIDGE__ = true;
}
