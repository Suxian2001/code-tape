import type { CloudApiErrorCode } from "../cloud/types.js";
import {
  decodeObjectKey,
  LOCAL_DEV_OBJECT_STORAGE_OBJECT_PATH_PREFIX,
  LOCAL_DEV_OBJECT_STORAGE_UPLOAD_PATH_PREFIX,
  type LocalDevObjectStorage,
} from "../cloud/localDevObjectStorage.js";

export type LocalDevObjectStorageHandler = (request: Request) => Promise<Response | null>;

const STATUS_BY_ERROR: Record<CloudApiErrorCode, number> = {
  "bad-request": 400,
  unauthorized: 401,
  forbidden: 403,
  "not-found": 404,
  "upload-session-expired": 410,
  "upload-session-conflict": 409,
  "unsupported-schema": 422,
  "invalid-manifest": 422,
  "invalid-event": 422,
  "checksum-mismatch": 422,
  "quota-exceeded": 413,
  "media-type-not-supported": 415,
  "rate-limited": 429,
};

export function createLocalDevObjectStorageHandler(
  storage: LocalDevObjectStorage,
): LocalDevObjectStorageHandler {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const uploadMatch = url.pathname.match(
      new RegExp(
        `^${escapeRegExp(LOCAL_DEV_OBJECT_STORAGE_UPLOAD_PATH_PREFIX)}([^/]+)$`,
        "u",
      ),
    );
    if (uploadMatch) {
      return handleUpload(request, storage, uploadMatch[1]!);
    }

    const objectMatch = url.pathname.match(
      new RegExp(
        `^${escapeRegExp(LOCAL_DEV_OBJECT_STORAGE_OBJECT_PATH_PREFIX)}([^/]+)$`,
        "u",
      ),
    );
    if (objectMatch) {
      return handleDownload(request, storage, objectMatch[1]!);
    }

    if (
      url.pathname.startsWith("/dev/object-storage/") &&
      (url.pathname.startsWith(LOCAL_DEV_OBJECT_STORAGE_UPLOAD_PATH_PREFIX) ||
        url.pathname.startsWith(LOCAL_DEV_OBJECT_STORAGE_OBJECT_PATH_PREFIX))
    ) {
      return objectStorageError("not-found", "route not found");
    }

    return null;
  };
}

async function handleUpload(
  request: Request,
  storage: LocalDevObjectStorage,
  uploadToken: string,
): Promise<Response> {
  if (request.method !== "PUT") {
    return methodNotAllowed("upload requires PUT method");
  }

  const target = storage.getPendingUploadTarget(uploadToken);
  if (!target) {
    if (storage.isConsumedUploadToken(uploadToken)) {
      return objectStorageError("upload-session-conflict", "upload target already consumed");
    }
    return objectStorageError("not-found", "upload target not found");
  }

  const contentType = request.headers.get("content-type");
  if (!contentType || !mimeTypesMatch(contentType, target.mimeType)) {
    return objectStorageError(
      "media-type-not-supported",
      `content-type must be ${target.mimeType}`,
    );
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > target.maxSizeBytes) {
    return objectStorageError(
      "quota-exceeded",
      `upload exceeds max size of ${target.maxSizeBytes} bytes`,
    );
  }

  await storage.putObject({
    key: target.objectKey,
    body,
    contentType: target.mimeType,
  });
  storage.markUploadTokenConsumed(uploadToken);
  return new Response(null, { status: 204 });
}

async function handleDownload(
  request: Request,
  storage: LocalDevObjectStorage,
  objectKeyEncoded: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("download requires GET method");
  }
  const objectKey = decodeObjectKey(objectKeyEncoded);
  if (!objectKey) {
    return objectStorageError("bad-request", "invalid object key encoding");
  }

  const stored = await storage.getObject(objectKey);
  if (!stored) {
    return objectStorageError("not-found", "object not found");
  }

  return new Response(toArrayBuffer(stored.body), {
    status: 200,
    headers: {
      "content-type": stored.contentType,
      "content-length": String(stored.sizeBytes),
    },
  });
}

function mimeTypesMatch(actual: string, expected: string): boolean {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

function methodNotAllowed(message: string): Response {
  return new Response(
    JSON.stringify({
      error: { code: "bad-request", message },
    }),
    {
      status: 405,
      headers: { "content-type": "application/json" },
    },
  );
}

function objectStorageError(code: CloudApiErrorCode, message: string): Response {
  return new Response(
    JSON.stringify({
      error: { code, message },
    }),
    {
      status: STATUS_BY_ERROR[code],
      headers: { "content-type": "application/json" },
    },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
