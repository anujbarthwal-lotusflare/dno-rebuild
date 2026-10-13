<template>
    <div
        ref="rootRef"
        :class="['lf-select', size, { disabled }]"
    >
        <LfLabel
            v-if="label"
            :optional="optional"
            >{{ label }}</LfLabel
        >
        <div
            ref="controlRef"
            class="control"
            :class="{ open, invalid: !!error, 'has-value': hasValue }"
            tabindex="0"
            role="combobox"
            :aria-expanded="open"
            @click="toggle"
            @keydown="onKeydown"
        >
            <div class="values">
                <template v-if="multiple">
                    <span
                        v-for="v in selectedOptions"
                        :key="v.value"
                        class="chip"
                    >
                        {{ v.label }}
                        <button
                            type="button"
                            class="chip-x"
                            :aria-label="`Remove ${v.label}`"
                            @click.stop="remove(v.value)"
                        >
                            <LfIcon
                                name="CloseIcon"
                                size="0.875rem"
                            />
                        </button>
                    </span>
                </template>
                <input
                    v-if="filterable && open"
                    ref="searchRef"
                    v-model="term"
                    class="search"
                    :placeholder="hasValue && !multiple ? selectedOptions[0]?.label : placeholder"
                    @click.stop
                    @keydown="onKeydown"
                />
                <span
                    v-else-if="!multiple && hasValue"
                    class="single"
                    >{{ selectedOptions[0]?.label }}</span
                >
                <span
                    v-else-if="!hasValue"
                    class="placeholder"
                    >{{ placeholder }}</span
                >
            </div>
            <button
                v-if="clearable && hasValue && !disabled"
                type="button"
                class="clear"
                aria-label="Clear"
                @click.stop="clear"
            >
                <LfIcon
                    name="CloseIcon"
                    size="0.75rem"
                />
            </button>
            <LfIcon
                class="caret"
                name="CaretDownIcon"
            />
        </div>
        <span
            v-if="error"
            class="error"
            >{{ error }}</span
        >
        <Teleport to="body">
            <ul
                v-if="open"
                ref="menuRef"
                class="lf-select-menu lf-scroll"
                :style="menuStyle"
                role="listbox"
            >
                <li
                    v-for="(o, i) in visibleOptions"
                    :key="o.value"
                    :class="['opt', { selected: isSelected(o.value), highlight: i === highlighted, disabled: o.disabled }]"
                    role="option"
                    :aria-selected="isSelected(o.value)"
                    @mousedown.prevent
                    @mouseenter="highlighted = i"
                    @click="choose(o)"
                >
                    <span class="opt-label">{{ o.label }}</span>
                </li>
                <li
                    v-if="!visibleOptions.length"
                    class="empty"
                >
                    No options
                </li>
            </ul>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import LfIcon from './LfIcon.vue';
import LfLabel from './LfLabel.vue';
import type { SelectOption } from '../../lib/types.ts';

/** Select, styled like the portal's vue-select based Select (ring, caret, blue-shadow menu). */
const props = withDefaults(
    defineProps<{
        modelValue?: string | string[] | null;
        options: SelectOption[];
        label?: string;
        placeholder?: string;
        multiple?: boolean;
        filterable?: boolean;
        clearable?: boolean;
        disabled?: boolean;
        optional?: boolean;
        error?: string;
        size?: 'small' | 'medium' | 'large';
        menuMinWidth?: string;
    }>(),
    { placeholder: 'Select...', size: 'medium' },
);
const emit = defineEmits<{ 'update:modelValue': [string | string[] | null]; change: [string | string[] | null] }>();

const rootRef = ref<HTMLElement>();
const controlRef = ref<HTMLElement>();
const menuRef = ref<HTMLElement>();
const searchRef = ref<HTMLInputElement>();
const open = ref(false);
const term = ref('');
const highlighted = ref(0);
const menuStyle = ref<Record<string, string>>({});

const values = computed<string[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : []));
const hasValue = computed(() => values.value.length > 0);
const selectedOptions = computed(() => values.value.map((v) => props.options.find((o) => o.value === v) ?? { value: v, label: v }));
const visibleOptions = computed(() => {
    const t = term.value.trim().toLowerCase();
    const list = props.multiple ? props.options.filter((o) => !values.value.includes(o.value)) : props.options;
    return t ? list.filter((o) => o.label.toLowerCase().includes(t)) : list;
});
const isSelected = (v: string) => values.value.includes(v);

function place(): void {
    const el = controlRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 200 && r.top > below;
    menuStyle.value = {
        position: 'fixed',
        left: `${r.left}px`,
        minWidth: props.menuMinWidth ?? `${r.width}px`,
        ...(up ? { bottom: `${window.innerHeight - r.top + 6}px` } : { top: `${r.bottom + 6}px` }),
    };
}

function toggle(): void {
    if (props.disabled) return;
    if (open.value && !props.filterable) close();
    else openMenu();
}
async function openMenu(): Promise<void> {
    if (props.disabled || open.value) return;
    open.value = true;
    term.value = '';
    highlighted.value = Math.max(0, visibleOptions.value.findIndex((o) => isSelected(o.value)));
    place();
    await nextTick();
    searchRef.value?.focus();
}
function close(): void {
    open.value = false;
    term.value = '';
}
function emitValue(v: string | string[] | null): void {
    emit('update:modelValue', v);
    emit('change', v);
}
function choose(o: SelectOption): void {
    if (o.disabled) return;
    if (props.multiple) {
        emitValue([...values.value, o.value]);
        term.value = '';
    } else {
        emitValue(o.value);
        close();
    }
}
function remove(v: string): void {
    emitValue(values.value.filter((x) => x !== v));
}
function clear(): void {
    emitValue(props.multiple ? [] : null);
}
function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open.value) openMenu();
        else highlighted.value = Math.min(visibleOptions.value.length - 1, highlighted.value + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlighted.value = Math.max(0, highlighted.value - 1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!open.value) openMenu();
        else {
            const o = visibleOptions.value[highlighted.value];
            if (o) choose(o);
        }
    } else if (e.key === 'Escape') close();
    else if (e.key === 'Backspace' && props.multiple && !term.value && values.value.length) remove(values.value[values.value.length - 1]!);
}

const onDocDown = (e: MouseEvent) => {
    const t = e.target as Node;
    if (rootRef.value?.contains(t) || menuRef.value?.contains(t)) return;
    close();
};
const onScroll = (e: Event) => {
    if (menuRef.value?.contains(e.target as Node)) return;
    place();
};
watch(open, (v) => {
    if (v) {
        document.addEventListener('mousedown', onDocDown);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', place);
    } else {
        document.removeEventListener('mousedown', onDocDown);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', place);
    }
});
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocDown);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', place);
});
</script>

<style scoped>
.lf-select {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    min-width: 0;
}
.control {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-xxs);
    min-height: 2rem;
    padding: var(--sp-xxs) 0.625rem var(--sp-xxs) var(--sp-xs);
    border-radius: var(--radius-xs);
    box-shadow: inset 0 0 0 1px var(--gray-150);
    background: var(--white);
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--gray-800);
    cursor: pointer;
    outline: none;
    transition: box-shadow 0.04s ease-out;
}
.small .control {
    min-height: 1.5rem;
    padding-block: 0;
}
.large .control {
    min-height: 2.5rem;
    font-size: 0.875rem;
}
.control:hover:not(.open) {
    box-shadow: inset 0 0 0 2px var(--gray-150);
}
.control.open,
.control:focus-visible {
    box-shadow: inset 0 0 0 1px var(--blue-400);
}
.control.invalid {
    box-shadow: inset 0 0 0 1px var(--red-400);
}
.disabled .control {
    pointer-events: none;
    background: var(--gray-100);
    color: var(--gray-500);
    box-shadow: inset 0 0 0 1px var(--gray-100);
}
.values {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-xxs);
    padding-left: var(--sp-xxs);
}
.single {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.placeholder {
    color: var(--gray-500);
}
.search {
    flex: 1;
    min-width: 4rem;
    border: 0;
    outline: none;
    background: transparent;
    font-size: inherit;
    padding: 0;
    height: 1.5rem;
}
.search::placeholder {
    color: var(--gray-500);
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xxs);
    min-height: 1.5rem;
    padding: 0 var(--sp-xxs) 0 var(--sp-xs);
    border-radius: var(--radius-xxs);
    background: var(--gray-100);
    color: var(--gray-800);
    font-weight: 600;
    font-size: 0.75rem;
}
.chip-x {
    display: flex;
    color: var(--blue-300);
}
.chip-x:hover {
    color: var(--blue-400);
}
.clear {
    display: flex;
    color: var(--blue-300);
    padding-right: 0.5rem;
    margin-right: 0.25rem;
    border-right: 2px solid var(--gray-150);
}
.caret {
    color: var(--blue-300);
}
.error {
    font-size: 0.75rem;
    color: var(--red-600);
}
</style>

<style>
.lf-select-menu {
    z-index: 1000;
    max-height: 11.5rem;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--white);
    border-radius: 0.25rem;
    box-shadow: var(--shadow-blue);
    font-family: var(--font);
}
.lf-select-menu .opt {
    margin: var(--sp-xxs);
    padding: var(--sp-xs);
    min-height: 2rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--gray-600);
    cursor: pointer;
    white-space: normal;
}
.lf-select-menu .opt.highlight {
    background: var(--gray-50);
}
.lf-select-menu .opt.selected {
    background: var(--gray-100);
}
.lf-select-menu .opt.disabled {
    color: var(--gray-300);
    pointer-events: none;
}
.lf-select-menu .empty {
    padding: var(--sp-sm);
    font-size: 0.75rem;
    color: var(--gray-500);
}
</style>
