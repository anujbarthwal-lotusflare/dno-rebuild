<template>
    <LfDrawer
        :visible="visible"
        width="38rem"
        @close="emit('close')"
    >
        <div class="history">
            <div class="head">
                <h3>Layout history</h3>
                <p class="sub">{{ pageTitle }} · every committed version is kept. Restoring adds a new version; nothing is overwritten.</p>
            </div>
            <LfTabs
                v-model="scope"
                :tabs="[
                    { key: 'user', label: 'My layout', count: counts.user },
                    { key: 'operator', label: 'Operator default', count: counts.operator },
                ]"
            />
            <div
                v-if="loading"
                class="muted"
            >
                Loading...
            </div>
            <LfEmptyState
                v-else-if="!shown.length"
                :description="scope === 'user' ? 'No versions yet. Edit the page and Save to create version 1.' : 'No operator default versions yet.'"
            />
            <ol
                v-else
                class="timeline"
            >
                <li
                    v-for="v in shown"
                    :key="v.id"
                    :class="['entry', { head: v.isHead }]"
                >
                    <span class="dot" />
                    <div class="entry-top">
                        <span class="ver">v{{ v.version }}</span>
                        <span class="msg">{{ v.message }}</span>
                        <LfTag
                            v-if="v.isHead"
                            label="Current"
                            color="green"
                        />
                    </div>
                    <div class="meta">
                        {{ v.author }} · {{ fmtDateTime(v.createdAt) }} · {{ v.sectionCount }} sections, {{ v.tileCount }} tiles
                        <span v-if="v.restoredFrom"> · restored from {{ v.restoredFrom.scope === 'operator' ? 'operator default' : 'my layout' }} v{{ v.restoredFrom.version }}</span>
                    </div>
                    <div
                        v-if="changeChips(v.summary).length"
                        class="chips"
                    >
                        <LfTag
                            v-for="c in changeChips(v.summary)"
                            :key="c.label"
                            :label="c.label"
                            :color="c.tone"
                        />
                    </div>
                    <details
                        v-if="changeLines(v.summary).length"
                        class="details"
                    >
                        <summary>What changed</summary>
                        <ul>
                            <li
                                v-for="l in changeLines(v.summary)"
                                :key="l"
                            >
                                {{ l }}
                            </li>
                        </ul>
                    </details>
                    <div class="actions">
                        <LfButton
                            variant="tertiary_s"
                            icon="EyeShowIcon"
                            label="Open in editor"
                            @click="checkout(v)"
                        />
                        <LfButton
                            v-if="!v.isHead"
                            variant="tertiary_s"
                            icon="RedoIcon"
                            label="Restore"
                            @click="restoring = { v, target: v.scope }"
                        />
                        <LfButton
                            v-if="v.scope === 'user'"
                            variant="tertiary_s"
                            icon="PublishIcon"
                            label="Make operator default"
                            @click="restoring = { v, target: 'operator' }"
                        />
                        <LfButton
                            variant="tertiary_s"
                            icon="DownloadIcon"
                            label="Download"
                            @click="download(v)"
                        />
                    </div>
                </li>
            </ol>
        </div>
    </LfDrawer>
    <LfModal
        v-if="restoring"
        :title="restoring.target === 'operator' && restoring.v.scope === 'user' ? `Make v${restoring.v.version} the operator default?` : `Restore v${restoring.v.version}?`"
        width="34rem"
        @close="restoring = undefined"
    >
        <div class="form">
            <p class="text">
                {{
                    restoring.target === 'operator'
                        ? 'The layout becomes a new operator default version that everyone in the organization sees.'
                        : `The layout of v${restoring.v.version} becomes a new version of your layout. Later versions stay in the history.`
                }}
            </p>
            <LfInput
                v-model="message"
                label="Message"
                optional
                :placeholder="`Restore v${restoring.v.version}`"
            />
        </div>
        <template #footer>
            <LfButton
                variant="tertiary_m"
                label="Cancel"
                @click="restoring = undefined"
            />
            <LfButton
                :label="restoring.target === 'operator' && restoring.v.scope === 'user' ? 'Make operator default' : 'Restore'"
                :loading="busy"
                @click="restore"
            />
        </template>
    </LfModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfDrawer from '../ui/LfDrawer.vue';
import LfEmptyState from '../ui/LfEmptyState.vue';
import LfInput from '../ui/LfInput.vue';
import LfModal from '../ui/LfModal.vue';
import LfTabs from '../ui/LfTabs.vue';
import LfTag from '../ui/LfTag.vue';
import { api, downloadJson } from '../../lib/api.ts';
import { fmtDateTime } from '../../lib/format.ts';
import { changeChips, changeLines } from '../../lib/layoutChanges.ts';
import { showToast, toastError } from '../../lib/toast.ts';
import type { LayoutInfo, LayoutScope, LayoutSection, LayoutVersionBrief, PageKey } from '../../lib/types.ts';

/** Version history of a page layout: browse, open in the editor, restore, promote, download. */
const props = defineProps<{ visible: boolean; page: PageKey; pageTitle: string }>();
const emit = defineEmits<{ close: []; restored: [LayoutInfo]; checkout: [{ sections: LayoutSection[]; label: string }] }>();

const scope = ref<string>('user');
const versions = ref<LayoutVersionBrief[]>([]);
const loading = ref(false);
const restoring = ref<{ v: LayoutVersionBrief; target: LayoutScope }>();
const message = ref('');
const busy = ref(false);

const shown = computed(() => versions.value.filter((v) => v.scope === scope.value));
const counts = computed(() => ({ user: versions.value.filter((v) => v.scope === 'user').length, operator: versions.value.filter((v) => v.scope === 'operator').length }));

async function load(): Promise<void> {
    loading.value = true;
    try {
        versions.value = await api<LayoutVersionBrief[]>(`/care/layout/${props.page}/versions`);
    } catch (e) {
        toastError(e, 'Could not load the history');
    } finally {
        loading.value = false;
    }
}
watch(
    () => props.visible,
    (v) => {
        if (v) void load();
    },
    { immediate: true },
);

const full = (v: LayoutVersionBrief) => api<{ sections: LayoutSection[] }>(`/care/layout/${props.page}/versions/${v.scope}/${v.version}`);

async function checkout(v: LayoutVersionBrief): Promise<void> {
    try {
        const f = await full(v);
        emit('checkout', { sections: f.sections, label: `${v.scope === 'operator' ? 'operator default' : 'my layout'} v${v.version}` });
    } catch (e) {
        toastError(e);
    }
}
async function download(v: LayoutVersionBrief): Promise<void> {
    try {
        const f = await full(v);
        downloadJson(`layout-${props.page}-${v.scope}-v${v.version}.json`, { page: props.page, scope: v.scope, version: v.version, message: v.message, sections: f.sections });
    } catch (e) {
        toastError(e);
    }
}
async function restore(): Promise<void> {
    const r = restoring.value;
    if (!r) return;
    busy.value = true;
    try {
        const res = await api<{ version: { version: number; scope: string }; layout: LayoutInfo }>(`/care/layout/${props.page}/versions/${r.v.scope}/${r.v.version}/restore`, 'POST', {
            message: message.value || undefined,
            targetScope: r.target,
        });
        showToast('success', `Saved as ${res.version.scope === 'operator' ? 'operator default' : 'my layout'} v${res.version.version}`);
        restoring.value = undefined;
        message.value = '';
        emit('restored', res.layout);
        await load();
    } catch (e) {
        toastError(e, 'Restore failed');
    } finally {
        busy.value = false;
    }
}
defineExpose({ reload: load });
</script>

<style scoped>
.history {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding-right: var(--sp-xl);
}
.sub {
    font-size: 0.75rem;
    color: var(--gray-600);
}
.muted {
    font-size: 0.875rem;
    color: var(--gray-500);
}
.timeline {
    list-style: none;
    margin: 0;
    padding: 0 0 0 1rem;
    border-left: 2px solid var(--gray-150);
}
.entry {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0 0 1.25rem 1rem;
}
.dot {
    position: absolute;
    left: calc(-1rem - 7px);
    top: 0.3rem;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--white);
    border: 2px solid var(--gray-300);
}
.entry.head .dot {
    background: var(--blue-400);
    border-color: var(--blue-400);
}
.entry-top {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
}
.ver {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: var(--radius-xxs);
    background: var(--blue-100);
    color: var(--blue-400);
}
.msg {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-800);
}
.meta {
    font-size: 0.75rem;
    color: var(--gray-600);
}
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-xxs);
}
.details {
    font-size: 0.75rem;
    color: var(--gray-600);
}
.details summary {
    cursor: pointer;
    color: var(--blue-400);
}
.details ul {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-md);
}
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding-bottom: var(--sp-xs);
}
.text {
    font-size: 0.875rem;
    color: var(--gray-600);
}
</style>
