// Module-level reactive dialog queue. Deliberately NOT a composable factory
// (no `useDialog()` call needed): the state lives here at module scope so
// Pinia stores (which have no component instance) can call `dialog.alert(...)`
// just like any Vue component does. `DialogHost.vue` is the single renderer,
// mounted once in App.vue.
import { computed, reactive } from 'vue';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
}

export interface AlertOptions {
  title?: string;
  message: string;
}

type DialogKind = 'confirm' | 'prompt' | 'alert';

interface QueueItem {
  id: number;
  kind: DialogKind;
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  placeholder?: string;
  inputValue: string;
  resolve: (value: boolean | string | null | void) => void;
}

let nextId = 0;

const state = reactive<{ queue: QueueItem[] }>({ queue: [] });

// Exposed for DialogHost.vue only.
export const dialogQueue = computed(() => state.queue);
export const currentDialog = computed<QueueItem | null>(() => state.queue[0] ?? null);

function enqueue(item: Omit<QueueItem, 'id'>): void {
  state.queue.push({ ...item, id: ++nextId });
}

function settleCurrent(value: boolean | string | null | void): void {
  const item = state.queue.shift();
  item?.resolve(value);
}

export const dialog = {
  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      enqueue({
        kind: 'confirm',
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText ?? 'Confirmar',
        cancelText: opts.cancelText ?? 'Cancelar',
        danger: opts.danger ?? false,
        inputValue: '',
        resolve: (v) => resolve(!!v),
      });
    });
  },

  prompt(opts: PromptOptions): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      enqueue({
        kind: 'prompt',
        title: opts.title,
        message: opts.message,
        confirmText: 'Aceptar',
        cancelText: 'Cancelar',
        danger: false,
        placeholder: opts.placeholder,
        inputValue: opts.defaultValue ?? '',
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      });
    });
  },

  alert(opts: AlertOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      enqueue({
        kind: 'alert',
        title: opts.title,
        message: opts.message,
        confirmText: 'Aceptar',
        cancelText: '',
        danger: false,
        inputValue: '',
        resolve: () => resolve(),
      });
    });
  },
};

// Called by DialogHost.vue when the user confirms/accepts the current dialog.
export function confirmCurrentDialog(value?: string): void {
  const item = state.queue[0];
  if (!item) return;
  if (item.kind === 'prompt') {
    settleCurrent(value ?? item.inputValue);
  } else {
    settleCurrent(true);
  }
}

// Called by DialogHost.vue on cancel / backdrop / Escape.
export function cancelCurrentDialog(): void {
  const item = state.queue[0];
  if (!item) return;
  settleCurrent(item.kind === 'prompt' ? null : item.kind === 'confirm' ? false : undefined);
}
