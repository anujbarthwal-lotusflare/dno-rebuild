import { onMounted, ref, watch } from 'vue';
import type { Ref, WatchSource } from 'vue';

export class ApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status: number) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const res = await fetch('/api' + path, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ApiError(data?.code ?? String(res.status), data?.message ?? `Request failed (${res.status})`, res.status);
    return data as T;
}

export interface Loaded<T> {
    data: Ref<T | undefined>;
    error: Ref<string>;
    loading: Ref<boolean>;
    reload: () => Promise<void>;
}

/** Load data on mount and whenever one of `deps` changes. Keeps the old data on screen while reloading. */
export function useLoad<T>(loader: () => Promise<T>, deps: WatchSource[] = []): Loaded<T> {
    const data = ref<T>() as Ref<T | undefined>;
    const error = ref('');
    const loading = ref(false);
    let run = 0;
    const reload = async (): Promise<void> => {
        const mine = ++run;
        loading.value = true;
        try {
            const result = await loader();
            if (mine !== run) return;
            data.value = result;
            error.value = '';
        } catch (e) {
            if (mine === run) error.value = (e as Error).message;
        } finally {
            if (mine === run) loading.value = false;
        }
    };
    onMounted(reload);
    if (deps.length) watch(deps, reload);
    return { data, error, loading, reload };
}

/** Read a browser File as base64 (without the data: prefix). */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
        reader.readAsDataURL(file);
    });
}

/** Save a JSON value as a file download. */
export function downloadJson(filename: string, value: unknown): void {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pick a local file and read it as text. Resolves undefined when the dialog is cancelled. */
export function pickTextFile(accept: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return resolve(undefined);
            file.text().then(resolve, () => resolve(undefined));
        };
        input.click();
    });
}

export async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }
}
