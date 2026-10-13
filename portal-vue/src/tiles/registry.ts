import type { Component } from 'vue';
import TableTile from './TableTile.vue';
import WalletTile from './WalletTile.vue';
import CurrentBenefitsTile from './CurrentBenefitsTile.vue';
import BillingTile from './BillingTile.vue';
import BillingV2Tile from './BillingV2Tile.vue';
import LatestOrderTile from './LatestOrderTile.vue';
import BillingTransactionV2Tile from './BillingTransactionV2Tile.vue';
import AgentNotesTile from './AgentNotesTile.vue';
import AppointmentsTile from './AppointmentsTile.vue';
import AssociatedEntitiesTile from './AssociatedEntitiesTile.vue';
import AssociatedEntitiesV2Tile from './AssociatedEntitiesV2Tile.vue';
import SalesforceTile from './SalesforceTile.vue';
import BroadbandFactsTile from './BroadbandFactsTile.vue';
import BillingStatementsTile from './BillingStatementsTile.vue';
import PlanAndPurchaseTile from './PlanAndPurchaseTile.vue';
import BalancesAndWalletTile from './BalancesAndWalletTile.vue';

/** Tile `kind` (from the tile catalog) to the component that renders it. */
export const TILE_COMPONENTS: Record<string, Component> = {
    table: TableTile,
    keyValue: TableTile,
    wallet: WalletTile,
    currentBenefits: CurrentBenefitsTile,
    billing: BillingTile,
    billingV2: BillingV2Tile,
    latestOrder: LatestOrderTile,
    billingTransactionV2: BillingTransactionV2Tile,
    agentNotes: AgentNotesTile,
    appointments: AppointmentsTile,
    associatedEntities: AssociatedEntitiesTile,
    associatedEntitiesV2: AssociatedEntitiesV2Tile,
    salesforce: SalesforceTile,
    broadbandFacts: BroadbandFactsTile,
    billingStatements: BillingStatementsTile,
    planAndPurchase: PlanAndPurchaseTile,
    balancesAndWallet: BalancesAndWalletTile,
};
