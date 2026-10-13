<template>
    <button
        type="button"
        class="lf-copy"
        :title="`Copy ${what}`"
        :aria-label="`Copy ${what}`"
        @click.stop="copy"
    >
        <LfIcon
            name="CloneIcon"
            :size="size"
        />
    </button>
</template>

<script setup lang="ts">
import LfIcon from './LfIcon.vue';
import { copyText } from '../../lib/api.ts';
import { showToast } from '../../lib/toast.ts';

const props = withDefaults(defineProps<{ value: string; what?: string; size?: string }>(), { what: 'value', size: '1rem' });
async function copy(): Promise<void> {
    await copyText(props.value);
    showToast('success', `${props.what.charAt(0).toUpperCase()}${props.what.slice(1)} copied to clipboard`, undefined, 2500);
}
</script>

<style scoped>
.lf-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--blue-300);
    vertical-align: middle;
}
.lf-copy:hover {
    color: var(--blue-400);
}
</style>
