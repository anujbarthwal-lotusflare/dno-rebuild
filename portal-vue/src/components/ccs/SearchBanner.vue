<template>
    <div
        class="banner"
        :style="{ '--banner-art': `url(&quot;${asset('/images/esim-search-illustration.svg')}&quot;)` }"
    >
        <div class="banner-text">
            <h2 class="title">{{ title }}</h2>
            <p
                v-if="primaryText"
                class="text"
            >
                {{ primaryText }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { asset } from '../../lib/assets.ts';
/** SearchBanner (components/partials/SearchBanner.vue) with the e-SIM search illustration. */
defineProps<{ title: string; primaryText?: string }>();
</script>

<style scoped>
.banner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 15rem;
    margin-top: 2.5rem;
    margin-bottom: 5.25rem;
    padding-left: 2rem;
    border-radius: 0.5rem;
    background-color: #d6dcea;
}
.banner-text {
    max-width: 16rem;
    position: relative;
    z-index: 1;
}
.title {
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: 600;
    color: var(--gray-800);
    white-space: nowrap;
}
.text {
    margin-top: 1.5rem;
    font-size: 0.875rem;
    line-height: 1.375rem;
    color: var(--gray-800);
}
.banner::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    margin-right: 2rem;
    width: 50%;
    height: 106%;
    background-image: var(--banner-art);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: right bottom;
}
</style>
