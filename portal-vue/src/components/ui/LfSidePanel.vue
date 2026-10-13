<template>
    <LfDrawer
        :visible="visible"
        width="36rem"
        @close="emit('close')"
    >
        <div class="panel">
            <div class="head">
                <h3>{{ header }}</h3>
                <slot name="headerExtra" />
            </div>
            <section
                v-for="card in cards"
                :key="card.title"
                class="card"
            >
                <h5 class="card-title">{{ card.title }}</h5>
                <dl class="pairs">
                    <template
                        v-for="item in card.items"
                        :key="item.label"
                    >
                        <dt>{{ item.label }}</dt>
                        <dd>
                            <LfTag
                                v-if="item.tag"
                                :label="String(item.value)"
                            />
                            <span v-else>{{ item.value === '' || item.value === undefined || item.value === null ? '-' : item.value }}</span>
                        </dd>
                    </template>
                </dl>
            </section>
            <slot />
        </div>
    </LfDrawer>
</template>

<script setup lang="ts">
import LfDrawer from './LfDrawer.vue';
import LfTag from './LfTag.vue';
import type { SidePanelCard } from '../../lib/types.ts';

/** OverviewSidePanel: details of a clicked row, grouped in cards. */
defineProps<{ visible: boolean; header: string; cards: SidePanelCard[] }>();
const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xl);
    padding-right: var(--sp-xl);
}
.head {
    display: flex;
    align-items: center;
    gap: var(--sp-md);
    min-height: 1.5rem;
}
.card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
}
.card-title {
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--blue-300);
}
.pairs {
    display: grid;
    grid-template-columns: 10rem 1fr;
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
    word-break: break-word;
    white-space: pre-wrap;
}
</style>
