<template>
    <div v-if="actions.length">
        <LfDropdownMenu :items="menuItems">
            <template #trigger>
                <LfButton
                    icon="NotificationIcon"
                    label="Support Actions"
                    class="support-btn"
                />
            </template>
        </LfDropdownMenu>
        <LfModal
            v-if="pending"
            :title="pending.label"
            width="34rem"
            @close="close"
        >
            <template v-if="!result">
                <p class="text">{{ pending.description }}</p>
                <p
                    v-if="error"
                    class="error"
                >
                    {{ error }}
                </p>
            </template>
            <template v-else>
                <p class="text">{{ result.message }}</p>
                <dl
                    v-if="result.details"
                    class="kv"
                >
                    <template
                        v-for="d in result.details"
                        :key="d.label"
                    >
                        <dt>{{ d.label }}</dt>
                        <dd>{{ d.value }}</dd>
                    </template>
                </dl>
            </template>
            <template #footer>
                <template v-if="!result">
                    <LfButton
                        variant="tertiary_m"
                        label="Cancel"
                        @click="close"
                    />
                    <LfButton
                        label="Confirm"
                        :loading="running"
                        @click="run"
                    />
                </template>
                <LfButton
                    v-else
                    label="Close"
                    @click="close"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfDropdownMenu from '../ui/LfDropdownMenu.vue';
import LfModal from '../ui/LfModal.vue';
import { api } from '../../lib/api.ts';
import { showToast } from '../../lib/toast.ts';
import type { EntityType, RowAction } from '../../lib/types.ts';

interface Action {
    key: string;
    label: string;
    description: string;
}

/** SupportActions: the entity's support actions in a dropdown, each confirmed before it runs. */
const props = defineProps<{ entityType: EntityType; entityId: string }>();
const emit = defineEmits<{ done: [] }>();
const actions = ref<Action[]>([]);
const pending = ref<Action>();
const running = ref(false);
const error = ref('');
const result = ref<{ message: string; details?: { label: string; value: string }[] }>();

onMounted(async () => {
    actions.value = await api<Action[]>(`/care/${props.entityType}/${props.entityId}/supportActions`).catch(() => []);
});
const menuItems = computed<RowAction[]>(() => actions.value.map((a) => ({ label: a.label, onClick: () => open(a) })));

function open(a: Action): void {
    pending.value = a;
    result.value = undefined;
    error.value = '';
}
function close(): void {
    pending.value = undefined;
}
async function run(): Promise<void> {
    if (!pending.value) return;
    running.value = true;
    error.value = '';
    try {
        result.value = await api(`/care/${props.entityType}/${props.entityId}/supportActions/${pending.value.key}`, 'POST');
        showToast('success', pending.value.label, result.value?.message);
        emit('done');
        if (!result.value?.details) close();
    } catch (e) {
        error.value = (e as Error).message;
    } finally {
        running.value = false;
    }
}
</script>

<style scoped>
.support-btn {
    padding-left: 0.75rem;
    padding-right: 2rem;
}
.text {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.error {
    margin-top: var(--sp-sm);
    font-size: 0.75rem;
    color: var(--red-600);
}
.kv {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: var(--sp-xs) var(--sp-md);
    margin: var(--sp-md) 0 0;
    font-size: 0.875rem;
}
dt {
    font-weight: 600;
}
dd {
    margin: 0;
    color: var(--gray-600);
}
</style>
