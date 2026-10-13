<template>
    <div
        ref="rootRef"
        class="lf-dd"
    >
        <div @click.stop="toggle">
            <slot
                name="trigger"
                :open="open"
            />
        </div>
        <Teleport to="body">
            <ul
                v-if="open"
                ref="menuRef"
                class="lf-dd-menu"
                :style="style"
                role="menu"
            >
                <li
                    v-for="item in items"
                    :key="item.label"
                    role="menuitem"
                    :class="['lf-dd-item', { disabled: item.disabled }]"
                    @click="select(item)"
                >
                    <LfIcon
                        v-if="item.icon"
                        :name="item.icon"
                        class="lf-dd-icon"
                    />
                    <span>{{ item.label }}</span>
                </li>
            </ul>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import LfIcon from './LfIcon.vue';
import type { RowAction } from '../../lib/types.ts';

/** DropdownMenu: white card with icon + label items, opens under (or above) its trigger. */
const props = withDefaults(defineProps<{ items: RowAction[]; align?: 'start' | 'end' }>(), { align: 'end' });
const open = ref(false);
const rootRef = ref<HTMLElement>();
const menuRef = ref<HTMLElement>();
const style = ref<Record<string, string>>({});

function place(): void {
    const r = rootRef.value?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 220 && r.top > 220;
    style.value = {
        position: 'fixed',
        ...(props.align === 'end' ? { right: `${window.innerWidth - r.right}px` } : { left: `${r.left}px` }),
        ...(up ? { bottom: `${window.innerHeight - r.top + 4}px` } : { top: `${r.bottom + 4}px` }),
    };
}
let openedAt = 0;
function toggle(): void {
    open.value = !open.value;
    if (open.value) {
        openedAt = Date.now();
        place();
    }
}
function select(item: RowAction): void {
    if (item.disabled) return;
    open.value = false;
    item.onClick();
}
const onDoc = (e: MouseEvent) => {
    if (!rootRef.value?.contains(e.target as Node) && !menuRef.value?.contains(e.target as Node)) open.value = false;
};
const onScroll = () => {
    // a scroll right after opening (the click scrolled the trigger into view) only moves the menu
    if (Date.now() - openedAt < 400) place();
    else open.value = false;
};
watch(open, (v) => {
    if (v) {
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('scroll', onScroll, true);
    } else {
        document.removeEventListener('mousedown', onDoc);
        window.removeEventListener('scroll', onScroll, true);
    }
});
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDoc);
    window.removeEventListener('scroll', onScroll, true);
});
</script>

<style scoped>
.lf-dd {
    display: inline-flex;
}
</style>

<style>
.lf-dd-menu {
    z-index: 1000;
    min-width: 12rem;
    margin: 0;
    padding: var(--sp-xxs);
    list-style: none;
    background: var(--white);
    border-radius: var(--radius-xxs);
    box-shadow: var(--shadow-gray-s);
    font-family: var(--font);
}
.lf-dd-item {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    padding: var(--sp-xs) var(--sp-sm);
    border-radius: var(--radius-xxs);
    font-size: 0.875rem;
    line-height: 1.5rem;
    color: var(--gray-800);
    cursor: pointer;
    white-space: nowrap;
}
.lf-dd-item:hover {
    background: var(--gray-50);
}
.lf-dd-item.disabled {
    color: var(--gray-300);
    cursor: not-allowed;
}
.lf-dd-icon {
    color: var(--gray-600);
}
</style>
