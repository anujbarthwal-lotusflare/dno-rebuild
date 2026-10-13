<template>
    <LfModal
        :title="scope === 'operator' ? 'Save as operator default' : 'Save layout version'"
        width="36rem"
        @close="emit('close')"
    >
        <div class="form">
            <p class="text">
                <template v-if="scope === 'operator'">
                    This becomes operator default <strong>v{{ nextVersion }}</strong>, the {{ pageTitle }} layout for everyone in the organization.
                </template>
                <template v-else>
                    This becomes <strong>v{{ nextVersion }}</strong> of your {{ pageTitle }} layout. Earlier versions stay in the history.
                </template>
            </p>
            <LfInput
                v-model="message"
                label="Message"
                optional
                :placeholder="`Version ${nextVersion}`"
                :maxlength="300"
            />
            <div class="changes">
                <div class="changes-title">Changes</div>
                <div
                    v-if="chips.length"
                    class="chips"
                >
                    <LfTag
                        v-for="c in chips"
                        :key="c.label"
                        :label="c.label"
                        :color="c.tone"
                    />
                </div>
                <ul
                    v-if="lines.length"
                    class="lines"
                >
                    <li
                        v-for="l in lines"
                        :key="l"
                    >
                        {{ l }}
                    </li>
                </ul>
                <p
                    v-else
                    class="text"
                >
                    No changes to the current layout.
                </p>
            </div>
            <p
                v-if="error"
                class="error"
            >
                {{ error }}
            </p>
        </div>
        <template #footer>
            <LfButton
                variant="tertiary_m"
                label="Cancel"
                @click="emit('close')"
            />
            <LfButton
                :label="scope === 'operator' ? 'Save As Operator Default' : 'Save version'"
                :loading="busy"
                @click="emit('commit', message)"
            />
        </template>
    </LfModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfInput from '../ui/LfInput.vue';
import LfModal from '../ui/LfModal.vue';
import LfTag from '../ui/LfTag.vue';
import { changeChips, changeLines } from '../../lib/layoutChanges.ts';
import type { LayoutChangeSummary, LayoutScope } from '../../lib/types.ts';

/** Commit dialog: message and the list of changes since the current version. */
const props = defineProps<{ scope: LayoutScope; nextVersion: number; pageTitle: string; summary?: LayoutChangeSummary; busy: boolean; error: string }>();
const emit = defineEmits<{ close: []; commit: [string] }>();
const message = ref('');
const chips = computed(() => changeChips(props.summary));
const lines = computed(() => changeLines(props.summary));
</script>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding: var(--sp-xs) 0;
}
.text {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.changes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    padding: var(--sp-sm) var(--sp-md);
    border-radius: var(--radius-xs);
    background: var(--gray-50);
}
.changes-title {
    font-size: 0.75rem;
    font-weight: 600;
}
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-xxs);
}
.lines {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.75rem;
    color: var(--gray-600);
}
.error {
    font-size: 0.75rem;
    color: var(--red-600);
}
</style>
