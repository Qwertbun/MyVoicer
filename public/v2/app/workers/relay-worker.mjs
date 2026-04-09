const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 150000;

function normalizeString(value, maxLength = 2048) {
  return String(value || "").trim().slice(0, maxLength);
}

async function deriveKey(roomId, roomKey) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${roomId}:${roomKey}`),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(`synto-v2:${roomId}`),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptPayload({ roomId, roomKey, text }) {
  const cleanRoomId = normalizeString(roomId, 32);
  const cleanRoomKey = normalizeString(roomKey, 128);
  const payload = normalizeString(text, 1200);
  if (!cleanRoomId || !cleanRoomKey || !payload) {
    throw new Error("invalid_encrypt_payload");
  }

  const key = await deriveKey(cleanRoomId, cleanRoomKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(payload)
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted),
  };
}

async function decryptPayload({ roomId, roomKey, iv, ciphertext }) {
  const cleanRoomId = normalizeString(roomId, 32);
  const cleanRoomKey = normalizeString(roomKey, 128);
  if (!cleanRoomId || !cleanRoomKey) {
    throw new Error("invalid_decrypt_payload");
  }

  const key = await deriveKey(cleanRoomId, cleanRoomKey);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
    },
    key,
    fromBase64(ciphertext)
  );

  return {
    text: decoder.decode(decrypted),
  };
}

self.onmessage = async (event) => {
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  const operation = normalizeString(data.op, 32);
  const requestId = normalizeString(data.requestId, 96);

  try {
    if (operation === "encrypt") {
      const result = await encryptPayload(data.payload || {});
      self.postMessage({ ok: true, requestId, result });
      return;
    }

    if (operation === "decrypt") {
      const result = await decryptPayload(data.payload || {});
      self.postMessage({ ok: true, requestId, result });
      return;
    }

    self.postMessage({
      ok: false,
      requestId,
      errorCode: "unknown_worker_op",
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      requestId,
      errorCode: normalizeString(error?.message || error?.name || "worker_error", 120),
    });
  }
};
