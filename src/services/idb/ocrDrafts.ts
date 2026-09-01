/**
 * OcrDraft persistence (M9) — local-only IndexedDB store.
 *
 * Images are transient per decision: stored as Blob in ocrDraft,
 * deleted after user confirms the derived sidePurchase (or after 7d TTL).
 */

import { v4 as uuidv4 } from 'uuid';

import { db } from '@/services/idb/db';
import { getSupabase } from '@/services/supabase/client';

import type { OcrDraft } from '@/types/domain';

async function getAuthContext(): Promise<{ uid: string | null; isOfflineOnly: boolean }> {
  const client = getSupabase();
  if (!client) return { uid: null, isOfflineOnly: true };
  try {
    const session = (await client.auth.getSession()).data.session;
    if (session?.user.id) return { uid: session.user.id, isOfflineOnly: false };
  } catch {
    // offline
  }
  return { uid: null, isOfflineOnly: false };
}

export async function createOcrDraft(
  imageBlob: Blob,
  userId?: string,
): Promise<OcrDraft> {
  const now = new Date().toISOString();
  const row: OcrDraft = {
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    userId,
    status: 'pending',
    imageBlob,
  };
  await db.ocrDraft.put(row);
  return row;
}

export async function getOcrDraft(id: string): Promise<OcrDraft | undefined> {
  return db.ocrDraft.get(id);
}

export async function listOcrDrafts(): Promise<OcrDraft[]> {
  const ctx = await getAuthContext();
  let all: OcrDraft[];
  if (ctx.uid) {
    all = await db.ocrDraft.where('userId').equals(ctx.uid).toArray();
  } else if (ctx.isOfflineOnly) {
    all = await db.ocrDraft.toArray();
  } else {
    all = await db.ocrDraft.toArray();
    // Auth configured but no session: avoid cross-tenant leakage
    const hasAnyUserId = all.some((d) => d.userId !== undefined);
    if (hasAnyUserId) return [];
  }
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateOcrDraft(
  id: string,
  patch: Partial<Omit<OcrDraft, 'id'>>,
): Promise<void> {
  const existing = await db.ocrDraft.get(id);
  if (!existing) throw new Error(`ocrDraft not found: ${id}`);
  await db.ocrDraft.put({
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteOcrDraft(id: string): Promise<void> {
  await db.ocrDraft.delete(id);
}

/** Remove drafts older than 7 days (TTL for transient images). */
export async function purgeStaleDrafts(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const ctx = await getAuthContext();
  let stale: OcrDraft[];
  if (ctx.uid) {
    stale = await db.ocrDraft.where('userId').equals(ctx.uid).filter((d) => d.createdAt < cutoff).toArray();
  } else {
    stale = await db.ocrDraft.where('createdAt').below(cutoff).toArray();
  }
  await db.ocrDraft.bulkDelete(stale.map((d) => d.id));
  return stale.length;
}
