// Module-level reactive toast queue, mirroring useDialog.ts: state lives at
// module scope so Pinia stores can call `toast.error(...)` without a Vue
// component instance. `ToastHost.vue` is the single renderer, mounted once
// in App.vue.
import { reactive } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const MAX_VISIBLE = 3;
const DURATION_MS = 4000;

let nextId = 0;

const state = reactive<{ toasts: ToastItem[] }>({ toasts: [] });

// Exposed for ToastHost.vue only.
export const toastState = state;

export function dismissToast(id: number): void {
  const idx = state.toasts.findIndex((t) => t.id === id);
  if (idx !== -1) state.toasts.splice(idx, 1);
}

function push(type: ToastType, message: string): void {
  const id = ++nextId;
  state.toasts.push({ id, type, message });
  if (state.toasts.length > MAX_VISIBLE) {
    state.toasts.splice(0, state.toasts.length - MAX_VISIBLE);
  }
  setTimeout(() => dismissToast(id), DURATION_MS);
}

export const toast = {
  success(message: string): void {
    push('success', message);
  },
  error(message: string): void {
    push('error', message);
  },
  info(message: string): void {
    push('info', message);
  },
};
