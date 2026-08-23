/**
 * useToast — Arabic user-facing notifications (AGENTS.md error handling).
 *
 * Module-scope singleton queue; `<AppToaster>` renders it. Errors are
 * always phrased in Arabic from `src/locales/ar.json` keys — never raw
 * exception text. Auto-dismiss after a timeout, manual dismiss supported.
 */

import { readonly, ref } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  /** Already-localized message (callers pass `t('key')`). */
  message: string;
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 3_000,
  info: 4_000,
  error: 6_000,
};

export function pushToast(kind: ToastKind, message: string, durationMs?: number): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, kind, message }];
  const ms = durationMs ?? DEFAULT_DURATION_MS[kind];
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

/** Test/dev reset. */
export function clearToasts(): void {
  toasts.value = [];
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    success: (message: string) => pushToast('success', message),
    error: (message: string) => pushToast('error', message),
    info: (message: string) => pushToast('info', message),
    dismiss: dismissToast,
  };
}
