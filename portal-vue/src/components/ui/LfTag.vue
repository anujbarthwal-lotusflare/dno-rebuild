<template>
    <span :class="['lf-tag', tone]">
        <span class="label">{{ label }}</span>
        <button
            v-if="closable"
            type="button"
            class="x"
            :aria-label="`Remove ${label}`"
            @click.stop="emit('close')"
        >
            <LfIcon
                name="CloseIcon"
                size="1rem"
            />
        </button>
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfIcon from './LfIcon.vue';
import { statusColor } from '../../lib/status.ts';
import type { TagColor } from '../../lib/status.ts';

/** Tag (commonComponents Tag): min-h 1.5rem, xs semibold, coloured background. */
const props = defineProps<{ label: string; color?: TagColor; closable?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const tone = computed(() => props.color ?? statusColor(props.label));
</script>

<style scoped>
.lf-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xxs);
    max-width: 12.5rem;
    min-height: 1.5rem;
    padding: 0 var(--sp-sm);
    border-radius: var(--radius-xxs);
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 600;
    vertical-align: middle;
}
.label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.green {
    background: var(--green-100);
    color: var(--green-600);
}
.yellow {
    background: var(--yellow-100);
    color: var(--yellow-600);
}
.red {
    background: var(--red-100);
    color: var(--red-600);
}
.blue {
    background: var(--blue-100);
    color: var(--blue-400);
}
.gray {
    background: var(--gray-100);
    color: var(--gray-800);
}
.white {
    background: var(--white);
    border: 1px solid var(--gray-150);
    color: var(--gray-800);
}
.x {
    display: flex;
    color: var(--blue-300);
    margin-right: calc(-1 * var(--sp-xs));
    padding: 2px;
}
.x:hover {
    color: var(--blue-400);
}
</style>
