<template>
    <div class="lf-uploader">
        <div
            :class="['zone', { drag: dragging, disabled }]"
            @dragenter.prevent="dragging = true"
            @dragover.prevent
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
        >
            <input
                ref="inputRef"
                type="file"
                class="input"
                :multiple="multiple"
                :accept="accept"
                :disabled="disabled"
                @change="onChange"
            />
            <LfIcon
                class="up"
                name="UploadFileUploaderIcon"
                size="1.5rem"
            />
            <label class="cta">Drop your files here or <span class="upload-link">upload them</span></label>
            <p class="types">{{ typesText }} (max. {{ maxSizeMb }} MB)</p>
        </div>
        <p
            v-if="localError"
            class="err"
        >
            {{ localError }}
        </p>
        <ul
            v-if="modelValue.length"
            class="files"
        >
            <li
                v-for="(f, i) in modelValue"
                :key="f.name + i"
                class="file"
            >
                <LfIcon
                    name="DocumentIcon"
                    class="file-icon"
                />
                <span class="name">{{ f.name }}</span>
                <span class="size">{{ sizeText(f.size) }}</span>
                <button
                    type="button"
                    class="remove"
                    :aria-label="`Remove ${f.name}`"
                    @click="remove(i)"
                >
                    <LfIcon name="CloseIcon" />
                </button>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import LfIcon from './LfIcon.vue';

/** FileUploader (commonComponents): dashed drop zone, type and size check, file list. */
const props = withDefaults(defineProps<{ modelValue: File[]; accept?: string; typesText?: string; maxSizeMb?: number; multiple?: boolean; disabled?: boolean }>(), {
    accept: '.pdf,.png,.jpg,.jpeg,.doc,.docx',
    typesText: 'PDF, PNG, JPG, DOC, DOCX',
    maxSizeMb: 5,
    multiple: true,
});
const emit = defineEmits<{ 'update:modelValue': [File[]] }>();
const dragging = ref(false);
const localError = ref('');
const inputRef = ref<HTMLInputElement>();

const sizeText = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function add(files: FileList | null | undefined): void {
    localError.value = '';
    if (!files?.length) return;
    const allowed = props.accept.split(',').map((x) => x.trim().toLowerCase());
    const next = props.multiple ? [...props.modelValue] : [];
    for (const f of Array.from(files)) {
        const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase();
        if (!allowed.includes(ext)) {
            localError.value = `${f.name}: file type is not supported`;
            continue;
        }
        if (f.size > props.maxSizeMb * 1024 * 1024) {
            localError.value = `${f.name} is larger than ${props.maxSizeMb} MB`;
            continue;
        }
        next.push(f);
    }
    emit('update:modelValue', next);
}
function onDrop(e: DragEvent): void {
    dragging.value = false;
    add(e.dataTransfer?.files);
}
function onChange(e: Event): void {
    add((e.target as HTMLInputElement).files);
    if (inputRef.value) inputRef.value.value = '';
}
function remove(i: number): void {
    emit('update:modelValue', props.modelValue.filter((_, k) => k !== i));
}
</script>

<style scoped>
.lf-uploader {
    max-width: 46rem;
}
.zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border: 1px dashed var(--gray-150);
    border-radius: 0.75rem;
    background: var(--white);
}
.zone.drag {
    background: var(--gray-25);
}
.zone.disabled {
    pointer-events: none;
    color: var(--gray-300);
    background: var(--gray-100);
}
.input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
}
.up {
    margin-bottom: var(--sp-md);
    color: var(--blue-300);
}
.cta {
    margin-bottom: var(--sp-xs);
    text-align: center;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-800);
}
.upload-link {
    color: var(--blue-400);
    cursor: pointer;
}
.zone:hover .upload-link {
    text-decoration: underline;
}
.types {
    text-align: center;
    font-size: 0.75rem;
    color: var(--gray-600);
}
.err {
    margin-top: var(--sp-xxs);
    text-align: center;
    font-size: 0.75rem;
    color: var(--red-600);
}
.files {
    list-style: none;
    margin: var(--sp-sm) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
}
.file {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    padding: var(--sp-xs) var(--sp-sm);
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
}
.file-icon {
    color: var(--blue-400);
}
.name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--gray-800);
}
.size {
    color: var(--gray-500);
}
.remove {
    display: flex;
    color: var(--blue-300);
}
.remove:hover {
    color: var(--blue-400);
}
</style>
