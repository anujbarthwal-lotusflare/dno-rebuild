<template>
    <div class="sensitive">
        <LfIcon
            name="WarningIcon"
            size="2rem"
            class="warn"
        />
        <h3>Sensitive edit</h3>
        <p>You are about to change data that affects the customer's balance. The change is recorded in the audit log under your name. Do you want to proceed?</p>
        <div class="actions">
            <LfButton
                variant="tertiary_m"
                label="Cancel"
                @click="emit('close')"
            />
            <LfButton
                label="Proceed"
                @click="emit('proceed')"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import LfButton from '../ui/LfButton.vue';
import LfIcon from '../ui/LfIcon.vue';

/** SensitiveEditModal: confirmation before wallet changes. */
const emit = defineEmits<{ close: []; proceed: [] }>();
</script>

<style scoped>
.sensitive {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-md);
    padding: 0 0 var(--sp-2xl);
    text-align: center;
}
.warn {
    color: var(--yellow-400);
}
p {
    max-width: 30rem;
    font-size: 0.875rem;
    color: var(--gray-600);
}
.actions {
    display: flex;
    gap: var(--sp-2xl);
    align-items: center;
    margin-top: var(--sp-sm);
}
</style>
