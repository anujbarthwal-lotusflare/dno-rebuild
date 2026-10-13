<template>
    <Teleport to="body">
        <div
            v-if="dnd.payload"
            :class="['ghost', { over: !!dnd.overGrid }]"
            :style="{ left: `${dnd.x + 14}px`, top: `${dnd.y + 10}px` }"
        >
            <LfIcon name="dnd-drag-handle-icon" />
            <span class="name">{{ dnd.payload.name }}</span>
            <span class="hint">{{ dnd.overGrid ? 'Release to drop' : 'Drop on a section' }}</span>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import LfIcon from '../ui/LfIcon.vue';
import { dnd } from '../../lib/dnd.ts';

/** Label that follows the pointer while a tile is dragged between sections or from the library. */
</script>

<style scoped>
.ghost {
    position: fixed;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 22rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-xs);
    background: var(--gray-800);
    color: var(--white);
    font-size: 0.8125rem;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    pointer-events: none;
}
.ghost.over {
    background: var(--blue-400);
}
.name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.hint {
    flex-shrink: 0;
    opacity: 0.75;
    font-size: 0.75rem;
}
</style>
