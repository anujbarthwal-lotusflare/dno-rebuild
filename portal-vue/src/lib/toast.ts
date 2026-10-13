import { reactive } from 'vue';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';
export interface Toast {
    id: number;
    variant: ToastVariant;
    title: string;
    description?: string;
}

export const toasts = reactive<Toast[]>([]);
let next = 1;

export function showToast(variant: ToastVariant, title: string, description?: string, ms = 5000): void {
    const id = next++;
    toasts.push({ id, variant, title, description });
    if (ms > 0) setTimeout(() => closeToast(id), ms);
}

export function closeToast(id: number): void {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
}

export const toastError = (e: unknown, title = 'Something went wrong'): void => showToast('error', title, e instanceof Error ? e.message : String(e));
