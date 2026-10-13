<template>
    <div class="page">
        <LfHeader :title="title" />
        <div class="body">
            <LfEmptyState :description="`${title} is a separate DNO module. This rebuild covers the Customer Care Suite and Customer 360; the module is listed so the navigation matches the portal.`" />
            <div class="links">
                <RouterLink to="/customer-care/user-manager">Go to User Manager</RouterLink>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfHeader from '../components/ui/LfHeader.vue';
import LfEmptyState from '../components/ui/LfEmptyState.vue';

const props = defineProps<{ slug: string }>();
const title = computed(() => props.slug.split('-').map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' '));
</script>

<style scoped>
.body {
    max-width: 40rem;
    margin: 0 auto;
    padding: var(--sp-2xl);
}
.links {
    text-align: center;
    font-size: 0.875rem;
}
</style>
