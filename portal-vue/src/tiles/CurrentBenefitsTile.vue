<template>
    <div class="benefits">
        <EntityPicker
            v-model="picked"
            :entity-type="entityType"
            :entity-id="entityId"
            :include="['account']"
            @pick="load"
        />
        <dl class="kv">
            <dt>Discount</dt>
            <dd>{{ benefit?.discount || '-' }}</dd>
            <dt>Remaining Uses</dt>
            <dd>{{ benefit?.remainingUses === '' || benefit?.remainingUses === undefined ? '-' : benefit.remainingUses }}</dd>
            <dt>Benefit Type</dt>
            <dd>{{ benefit?.benefitType || '-' }}</dd>
            <dt>Benefit ID</dt>
            <dd class="id">{{ benefit?.benefitId || '-' }}</dd>
        </dl>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import EntityPicker from '../components/ccs/EntityPicker.vue';
import { api } from '../lib/api.ts';
import { toastError } from '../lib/toast.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

/** Current Benefits: the latest available promotion benefit of the picked account. */
defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const picked = ref<string | null>(null);
const benefit = ref<{ discount: string; remainingUses: number | ''; benefitType: string; benefitId: string }>();

async function load(t: { entityType: EntityType; id: string }): Promise<void> {
    try {
        benefit.value = await api(`/care/${t.entityType}/${t.id}/currentBenefit`);
    } catch (e) {
        toastError(e, 'Could not load the current benefit');
    }
}
</script>

<style scoped>
.benefits {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    margin: var(--sp-xs) var(--sp-xxs) 0;
}
.kv {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--sp-sm) var(--sp-md);
    margin: 0;
    font-size: 0.875rem;
}
dt {
    font-weight: 600;
    color: var(--gray-800);
}
dd {
    margin: 0;
    color: var(--gray-600);
    min-width: 0;
}
.id {
    word-break: break-all;
    font-size: 0.75rem;
}
</style>
