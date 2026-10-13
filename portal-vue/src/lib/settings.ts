/** Agent preferences (Settings > User Settings): time zone, date and time format, default search parameter. */
import { reactive } from 'vue';
import { api } from './api.ts';

export type DateFormat = 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD';
export interface Settings {
    timezone: string;
    dateFormat: DateFormat;
    timeFormat: '12' | '24';
    userSearchParam: string;
}

export const settings = reactive<Settings & { loaded: boolean }>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    dateFormat: 'DD-MM-YYYY',
    timeFormat: '24',
    userSearchParam: 'accountId',
    loaded: false,
});

export async function loadSettings(): Promise<void> {
    try {
        Object.assign(settings, await api<Settings>('/care/settings'), { loaded: true });
    } catch {
        settings.loaded = true;
    }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
    Object.assign(settings, await api<Settings>('/care/settings', 'PUT', patch));
}

/** "GMT+05:30" for the configured time zone. */
export function gmtOffset(timeZone: string = settings.timezone, at = new Date()): string {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
        const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
        return name === 'GMT' ? 'GMT+00:00' : name;
    } catch {
        return 'GMT+00:00';
    }
}
