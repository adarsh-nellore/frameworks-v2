"use client";

// IndexedDB-backed blob store for per-board attachments. Only the blob bytes
// live here — metadata rides on `Board.attachments` (localStorage) so it can
// be hydrated synchronously on mount.
//
// Keyed by `${boardId}:${attachmentId}` so listing / bulk-delete for a board
// is a simple range scan.

const DB_NAME = "frameworks-attachments";
const STORE = "blobs";
const DB_VERSION = 1;

function keyFor(boardId: string, attachmentId: string): string {
  return `${boardId}:${attachmentId}`;
}

/**
 * Lazy-open the IDB database. Rejects if IDB is unavailable (SSR, private mode
 * with storage disabled). Callers should treat that as "no attachments" —
 * storage failures are non-fatal.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAttachment(
  boardId: string,
  attachmentId: string,
  blob: Blob
): Promise<void> {
  const db = await openDB();
  await promisifyRequest(tx(db, "readwrite").put(blob, keyFor(boardId, attachmentId)));
  db.close();
}

export async function getAttachment(
  boardId: string,
  attachmentId: string
): Promise<Blob | null> {
  const db = await openDB();
  const blob = (await promisifyRequest(
    tx(db, "readonly").get(keyFor(boardId, attachmentId))
  )) as Blob | undefined;
  db.close();
  return blob ?? null;
}

/**
 * Return the stored blob as a File suitable for FormData upload. We store a
 * raw Blob (not a File) since File adds name metadata we already carry on the
 * Board.attachments; reconstruct here so the FormData entry looks like a
 * normal browser upload to the server.
 */
export async function getAttachmentAsFile(
  boardId: string,
  attachmentId: string,
  name: string,
  mediaType: string
): Promise<File | null> {
  const blob = await getAttachment(boardId, attachmentId);
  if (!blob) return null;
  // Blob may not have a proper type — set it from the meta so the server sees
  // the right content-type (matters for image MIME routing in the extractor).
  return new File([blob], name, { type: mediaType });
}

export async function deleteAttachment(
  boardId: string,
  attachmentId: string
): Promise<void> {
  const db = await openDB();
  await promisifyRequest(tx(db, "readwrite").delete(keyFor(boardId, attachmentId)));
  db.close();
}

/** Purge every attachment for a board — called when the board is deleted. */
export async function deleteAllForBoard(boardId: string): Promise<void> {
  const db = await openDB();
  const store = tx(db, "readwrite");
  // Range [boardId:, boardId<) — upper bound uses the next ASCII char.
  const lower = `${boardId}:`;
  const upper = `${boardId};`;
  const range = IDBKeyRange.bound(lower, upper, false, true);
  await new Promise<void>((resolve, reject) => {
    const req = store.openKeyCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Tiny uuid for attachment ids. Doesn't need cryptographic strength. */
export function genAttachmentId(): string {
  return `a-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
