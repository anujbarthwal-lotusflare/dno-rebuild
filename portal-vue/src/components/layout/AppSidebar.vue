<template>
    <aside :class="['sidebar', { compact }]">
        <div class="logo-row">
            <RouterLink
                to="/customer-care/user-manager"
                class="logo"
                aria-label="Home"
            >
                <img
                    v-if="compact"
                    :src="asset('/images/LotusFlareLogo.svg')"
                    :alt="brand.logoAlt"
                    class="logo-small"
                />
                <img
                    v-else
                    :src="asset('/images/LotusFlareLogoDark.svg')"
                    :alt="brand.logoAlt"
                    class="logo-full"
                />
            </RouterLink>
            <button
                v-if="!compact && !editingMenu"
                type="button"
                class="collapse customize"
                aria-label="Customize menu"
                title="Customize menu: drag and drop"
                data-test-id="customize-menu"
                @click="editingMenu = true"
            >
                <LfIcon name="EditIcon" />
            </button>
            <button
                v-if="!editingMenu"
                type="button"
                class="collapse"
                :aria-label="compact ? 'Expand' : 'Collapse'"
                @click="compact = !compact"
            >
                <LfIcon :name="compact ? 'ExpandNavIcon' : 'CollapseNavIcon'" />
            </button>
        </div>
        <nav class="nav lf-scroll">
            <div
                v-if="editingMenu"
                class="menu-edit-wrap"
            >
                <div class="menu-edit-head">
                    <span class="menu-edit-title">Customize menu</span>
                    <button
                        type="button"
                        class="me-btn"
                        title="Back to the default menu"
                        @click="resetMenu"
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        class="me-btn primary"
                        data-test-id="menu-done"
                        @click="editingMenu = false"
                    >
                        Done
                    </button>
                </div>
                <MenuEditor
                    :items="arranged"
                    :pages="menuPages"
                    :icons="menuIcons"
                    :env-label="envLabel"
                    :env-hidden="!!menuArrangement.env?.hidden"
                    @edit="(k, c) => apply(editEntry(arranged, menuArrangement, k, c), 'Menu entry updated')"
                    @env="(e) => apply(editEnv(arranged, menuArrangement, e), 'Environment label updated')"
                    @change="onMenuChange"
                    @add-menu="(e) => apply(addMenu(arranged, menuArrangement, e), `${e.name} added`)"
                    @add-sub="(g, e) => apply(addSubMenu(arranged, menuArrangement, g, e), `${e.name} added`)"
                    @remove="(k) => apply(deleteEntry(arranged, menuArrangement, k), 'Deleted from the menu')"
                />
            </div>
            <ul
                v-else
                class="list"
            >
                <li
                    v-for="item in menu"
                    :key="item.name"
                >
                    <SidebarItem
                        :item="item"
                        :compact="compact"
                        :open="openItem === item.name"
                        @toggle="toggle(item.name)"
                    />
                </li>
            </ul>
            <ul
                v-if="!editingMenu"
                class="list footer-list"
            >
                <li
                    v-for="item in footerMenu"
                    :key="item.key ?? item.name"
                >
                    <SidebarItem
                        :item="item"
                        :compact="compact"
                        :open="openItem === item.name"
                        :muted="item.key === 'tenant'"
                        @toggle="toggle(item.name)"
                    />
                </li>
            </ul>
        </nav>
        <div
            v-if="!menuArrangement.env?.hidden"
            class="env"
        >
            <span class="dot" />
            <span
                v-if="!compact"
                class="env-label"
                >{{ envLabel }}</span
            >
        </div>
    </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import LfIcon from '../ui/LfIcon.vue';
import { asset, brand } from '../../lib/assets.ts';
import SidebarItem from './SidebarItem.vue';
import MenuEditor from './MenuEditor.vue';
import { addMenu, addSubMenu, arrange, deleteEntry, editEntry, editEnv, zones, loadMenuArrangement, menuArrangement, resetMenuArrangement, saveMenuArrangement, toArrangement, visibleMenu } from '../../lib/menuArrangement.ts';
import type { MenuArrangement } from '../../lib/menuArrangement.ts';
import type { ArrangedItem } from '../../lib/menuArrangement.ts';
import { showToast, toastError } from '../../lib/toast.ts';
import { FOOTER_MENU, MAIN_MENU } from './menu.ts';
import type { MenuItem } from './menu.ts';
import { gmtOffset, settings } from '../../lib/settings.ts';

const route = useRoute();
const compact = ref(false);
const openItem = ref<string>('');

// the agent's arrangement of the main menu (drag and drop in Customize menu)
const editingMenu = ref(false);
// the bottom area: Settings, Support & Feedback, My Account and the tenant
const tenantItem: MenuItem = { key: 'tenant', name: brand.tenant, icon: '', subItems: [{ name: brand.tenant, link: '/customer-care/user-manager?tenant' }] };
const arranged = computed(() => arrange(MAIN_MENU, menuArrangement, [...FOOTER_MENU, tenantItem]));
const menu = computed(() => visibleMenu(zones(arranged.value).main));
const footerMenu = computed<MenuItem[]>(() =>
    visibleMenu(zones(arranged.value).footer).map((m) => (m.key === 'Settings' ? { ...m, name: `${m.name} (${gmtOffset(settings.timezone)})` } : m)),
);
const envLabel = computed(() => menuArrangement.env?.label || 'Staging');
onMounted(loadMenuArrangement);
function onMenuChange(items: ArrangedItem[]): void {
    saveMenuArrangement(toArrangement(items, menuArrangement), (e) => toastError(e, 'Menu not saved'));
}
function apply(next: MenuArrangement, message: string): void {
    saveMenuArrangement(next, (e) => toastError(e, 'Menu not saved'));
    showToast('success', message, 'Reset brings back the original menu.');
}
// pages offered for new menu links, and icons for new menus
const menuPages = [...MAIN_MENU, ...FOOTER_MENU].flatMap((m) => [...(m.link ? [{ name: m.name, link: m.link }] : []), ...(m.subItems ?? []).map((s) => ({ name: `${m.name} › ${s.name}`, link: s.link }))]);
const menuIcons = [...new Set([...MAIN_MENU, ...FOOTER_MENU].map((m) => m.icon).filter(Boolean))];
async function resetMenu(): Promise<void> {
    try {
        await resetMenuArrangement();
        showToast('success', 'Menu reset', 'The original menu is back: default order, every entry shown, added entries removed, deleted ones restored.');
    } catch (e) {
        toastError(e);
    }
}


function toggle(name: string): void {
    openItem.value = openItem.value === name ? '' : name;
}

// open the group that holds the current page
watch(
    () => route.path,
    (path) => {
        const owner = menu.value.find((m) => m.subItems?.some((s) => path.startsWith(s.link) || path.startsWith(s.link.replace(/s$/, '') + '/')));
        if (owner) openItem.value = owner.name;
    },
    { immediate: true },
);
</script>

<style scoped>
.sidebar {
    display: flex;
    flex-direction: column;
    width: 15.625rem;
    height: 100vh;
    flex-shrink: 0;
    background: var(--gray-25);
    border-right: 1px solid var(--gray-150);
    transition: width 0.3s ease-in;
    position: sticky;
    top: 0;
    z-index: 30;
}
.sidebar.compact {
    width: 4rem;
}
.logo-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-xl) var(--sp-md);
    background: var(--gray-25);
}
.compact .logo-row {
    flex-direction: column;
    gap: var(--sp-sm);
    padding: var(--sp-xl) var(--sp-xs);
}
.logo {
    display: flex;
}
.logo-full {
    width: 142px;
    height: 24px;
}
.logo-small {
    width: 1.5rem;
    height: 1.5rem;
}
.collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--gray-600);
    border-radius: var(--radius-xxs);
}
.collapse:hover {
    color: var(--gray-800);
    background: var(--gray-100);
}
.customize {
    margin-left: auto;
    margin-right: var(--sp-xs);
}
.menu-edit-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
}
.menu-edit-head {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    padding: 0 var(--sp-sm);
}
.menu-edit-title {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-800);
}
.me-btn {
    padding: 0.25rem 0.625rem;
    border-radius: var(--radius-xxs);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--blue-400);
    box-shadow: inset 0 0 0 1px var(--blue-300);
}
.me-btn.primary {
    color: var(--white);
    background: var(--blue-400);
    box-shadow: none;
}
.nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-lg);
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0.75rem 0 0 1px;
}
.compact .nav {
    padding: 0 var(--sp-xs);
}
.list {
    margin: 0;
    padding: 0;
    list-style: none;
}
.footer-list {
    margin-top: auto;
    padding-bottom: var(--sp-xs);
}
.env {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    height: 2.5rem;
    padding: var(--sp-xxs) var(--sp-md);
    margin-top: 0;
    border-top: 1px solid var(--gray-150);
    background: var(--gray-25);
    box-sizing: content-box;
}
.dot {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
}
.env-label {
    font-size: 0.875rem;
    color: var(--gray-600);
}
</style>
