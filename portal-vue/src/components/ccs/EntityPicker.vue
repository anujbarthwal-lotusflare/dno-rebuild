<template>
    <LfSelect
        :model-value="modelValue"
        :options="options"
        :clearable="false"
        placeholder="Select entity"
        class="picker"
        @update:model-value="onChange"
    />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import LfSelect from '../ui/LfSelect.vue';
import { api } from '../../lib/api.ts';
import type { EntityType, SelectOption } from '../../lib/types.ts';

/** AssociatedEntityPicker: the profile itself and its linked accounts and subscribers. */
const props = defineProps<{ entityType: EntityType; entityId: string; modelValue: string | null; include?: EntityType[] }>();
const emit = defineEmits<{ 'update:modelValue': [string]; pick: [{ entityType: EntityType; id: string }] }>();

const entries = ref<{ entityType: EntityType; id: string; label: string }[]>([]);
const options = computed<SelectOption[]>(() => entries.value.map((e) => ({ value: `${e.entityType}:${e.id}`, label: e.label })));

function onChange(v: string | string[] | null): void {
    if (typeof v !== 'string') return;
    emit('update:modelValue', v);
    const [entityType, id] = v.split(':') as [EntityType, string];
    emit('pick', { entityType, id });
}

onMounted(async () => {
    const q = props.include ? `?include=${props.include.join(',')}` : '';
    entries.value = await api(`/care/${props.entityType}/${props.entityId}/entityPicker${q}`);
    const first = entries.value[0];
    if (!props.modelValue && first) onChange(`${first.entityType}:${first.id}`);
});
</script>

<style scoped>
.picker {
    width: 100%;
}
</style>
