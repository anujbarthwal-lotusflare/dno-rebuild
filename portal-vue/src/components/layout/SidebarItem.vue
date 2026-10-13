<template>
    <div :class="['menu-item', { compact }]">
        <!-- single link -->
        <component
            :is="external(item.link) ? 'a' : RouterLink"
            v-if="item.link && !item.subItems"
            v-bind="linkProps(item.link)"
            :class="['single', { active: selfActive, compact }]"
            :title="compact ? item.name : undefined"
        >
            <span class="indicator" />
            <span class="img-wrapper">
                <LfIcon
                    v-if="item.icon"
                    :name="item.icon"
                    class="menu-icon"
                />
            </span>
            <span
                v-if="!compact"
                :class="['label', { active: selfActive }]"
                >{{ item.name }}</span
            >
        </component>

        <!-- group -->
        <div
            v-else
            class="group"
        >
            <button
                type="button"
                :class="['group-header', { 'active-parent': parentActive, open, compact, muted }]"
                :title="compact ? item.name : undefined"
                :aria-expanded="open"
                @click="emit('toggle')"
            >
                <span class="indicator" />
                <span class="img-wrapper">
                    <LfIcon
                        v-if="item.icon"
                        :name="item.icon"
                        class="menu-icon"
                    />
                </span>
                <template v-if="!compact">
                    <span class="label">{{ item.name }}</span>
                    <LfIcon
                        :name="open ? 'ChevronUpIcon' : 'ChevronDownIcon'"
                        class="chev"
                        size="0.875rem"
                    />
                </template>
            </button>
            <div
                v-if="open && !compact"
                class="subs"
            >
                <component
                    :is="external(sub.link) ? 'a' : RouterLink"
                    v-for="sub in item.subItems"
                    :key="`${sub.link}|${sub.name}`"
                    v-bind="linkProps(sub.link)"
                    :class="['sub-item', { active: !external(sub.link) && subActive(sub.link) }]"
                >
                    <span class="sub-indicator" />
                    {{ sub.name }}
                    <LfIcon
                        v-if="external(sub.link)"
                        name="OpenLinkIcon"
                        size="0.75rem"
                        class="ext"
                    />
                </component>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { isExternal } from '../../lib/menuArrangement.ts';
import LfIcon from '../ui/LfIcon.vue';
import type { MenuItem } from './menu.ts';

/** SidebarMenuItem: 40px rows, 16px icons, active group in blue-400 with a 3px indicator. */
const props = defineProps<{ item: MenuItem; compact: boolean; open: boolean; muted?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const external = (link?: string) => !!link && isExternal(link);
/** Portal pages use the router; web addresses open in a new tab. */
const linkProps = (link: string) => (isExternal(link) ? { href: link, target: '_blank', rel: 'noopener noreferrer' } : { to: link });
const route = useRoute();

// list pages own their detail pages too: /business-customers owns /business-customer/:id
const subActive = (link: string) => route.path === link || route.path.startsWith(link + '/') || route.path.startsWith(link.replace(/s$/, '') + '/');
const parentActive = computed(() => Boolean(props.item.subItems?.some((s) => subActive(s.link))));
const selfActive = computed(() => Boolean(props.item.link && (route.path === props.item.link || route.path.startsWith(props.item.link + '/'))));
</script>

<style scoped>
.ext {
    margin-left: 0.25rem;
    color: var(--gray-400);
}
.menu-item {
    position: relative;
}
.single,
.group-header {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 2.5rem;
    border-radius: 8px;
    color: var(--gray-600);
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
}
.single:hover,
.group-header:hover:not(.active-parent) {
    background: #f3f4f6;
}
.img-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    flex: 0 0 auto;
    padding-left: 0.5rem;
}
.compact .img-wrapper {
    padding-left: 0;
}
.menu-icon {
    color: #1f2937;
}
.single:hover .menu-icon,
.group-header:hover .menu-icon {
    color: var(--blue-400);
}
.label {
    flex: 1;
    min-width: 0;
    padding: 7px 0;
    margin-left: 0.25rem;
    line-height: 1.625rem;
    color: var(--gray-600);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.single.active {
    background: var(--blue-100);
}
.single.active .label,
.single.active .menu-icon {
    color: var(--blue-400);
    font-weight: 600;
}
.indicator {
    position: absolute;
    left: 0;
    top: 50%;
    width: 0;
    height: 20px;
    transform: translateY(-50%);
    border-radius: 0 10px 10px 0;
    background: #9ca3af;
    transition: width 0.2s ease;
}
.single:hover .indicator,
.group-header:hover .indicator {
    width: 3px;
}
.single.active .indicator,
.group-header.active-parent .indicator {
    width: 3px;
    background: var(--blue-400);
}
.group-header.active-parent .label,
.group-header.active-parent .menu-icon {
    color: var(--blue-400);
    font-weight: 600;
}
.group-header.active-parent .chev {
    color: var(--blue-400);
}
.group-header.muted .label {
    color: var(--gray-600);
    font-weight: 400;
}
.chev {
    margin-right: 0.75rem;
    color: #1f2937;
}
.subs {
    display: flex;
    flex-direction: column;
}
.sub-item {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0.5rem 0.5rem 0.5rem 3.25rem;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 0.875rem;
    line-height: 1.5rem;
    color: var(--gray-600);
}
.sub-item:hover {
    background: #f3f4f6;
}
.sub-item.active {
    background: var(--blue-100);
    border-color: var(--blue-200);
    color: var(--blue-400);
    font-weight: 600;
}
.sub-item.active:hover {
    background: var(--blue-200);
}
.sub-indicator {
    position: absolute;
    left: -1px;
    top: 50%;
    width: 0;
    height: 50%;
    transform: translateY(-50%);
    border-radius: 0 10px 10px 0;
    background: #9ca3af;
    transition: width 0.2s ease;
}
.sub-item:hover .sub-indicator {
    width: 3px;
}
.sub-item.active .sub-indicator {
    width: 3px;
    background: var(--blue-400);
}
.compact .single,
.compact .group-header {
    justify-content: center;
    width: 2.5rem;
}
</style>
