<template>
    <div>
        <LfHeader title="Page not found" />
        <LfEmptyState description="There is no page at this address." />
        <p class="back"><RouterLink to="/customer-care/user-manager">Back to User Manager</RouterLink></p>
    </div>
</template>

<script setup lang="ts">
import LfHeader from '../components/ui/LfHeader.vue';
import LfEmptyState from '../components/ui/LfEmptyState.vue';
</script>

<style scoped>
.back {
    text-align: center;
    font-size: 0.875rem;
}
</style>
