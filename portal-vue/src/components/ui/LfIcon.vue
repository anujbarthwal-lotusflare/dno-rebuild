<template>
    <span
        class="lf-icon"
        :style="style"
        aria-hidden="true"
    />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { asset } from '../../lib/assets.ts';

/**
 * Single-colour portal icon (from /icons, the original src/assets/icons). The SVG is used as a
 * mask so it takes the current text colour, like the original inline SVGs with currentColor.
 * `name` is a file name without .svg, e.g. "SearchIcon" or "consistency/sidebar-home".
 */
const props = withDefaults(defineProps<{ name: string; size?: string }>(), { size: '1rem' });

const style = computed(() => {
    const url = `url("${asset(`/icons/${props.name}.svg`)}")`;
    return {
        width: props.size,
        height: props.size,
        WebkitMaskImage: url,
        maskImage: url,
    };
});
</script>

<style scoped>
.lf-icon {
    display: inline-block;
    flex-shrink: 0;
    background-color: currentColor;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-size: contain;
    mask-size: contain;
    vertical-align: middle;
}
</style>
