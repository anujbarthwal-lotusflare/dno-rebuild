/**
 * Domain model. Field names follow the TM Forum Open API shapes used by the
 * original (`libs/vo`), trimmed to what the core flow needs. String-literal
 * unions replace the original enums; the values are identical.
 */

export interface Money {
    unit: string;
    value: number;
}
export interface TimePeriod {
    startDateTime?: string;
    endDateTime?: string;
}
export interface Ref {
    id: string;
    name?: string;
    href?: string;
    '@referredType'?: string;
}
export interface Duration {
    amount: number;
    units: 'day' | 'week' | 'month' | 'year';
}

/* ---------- Party ---------- */

export type IndividualState = 'initialized' | 'validated' | 'deceased';
export type OrganizationState = 'initialized' | 'validated' | 'closed';

export interface ContactMedium {
    '@type': string; // PhoneContactMedium | EmailContactMedium | GeographicAddressContactMedium | ...
    preferred?: boolean;
    [key: string]: unknown;
}
export interface CreditProfile {
    creditScore?: number;
    creditProfileDate?: string;
    creditRiskRating?: number;
}
export interface TaxExemptionCertificate {
    certificateNumber?: string;
    [key: string]: unknown;
}
interface PartyBase {
    id: string;
    contactMedium?: ContactMedium[];
    creditProfile?: CreditProfile[];
    taxExemptionCertificate?: TaxExemptionCertificate[];
    lastUpdate?: string;
}
export interface Individual extends PartyBase {
    '@type': 'Individual';
    givenName: string;
    familyName: string;
    status: IndividualState;
}
export interface Organization extends PartyBase {
    '@type': 'Organization';
    name: string;
    tradingName?: string;
    isLegalEntity?: boolean;
    isHeadOffice?: boolean;
    organizationType?: string;
    organizationParentRelationship?: { relationshipType?: string; organization: Ref };
    status: OrganizationState;
}
export type Party = Individual | Organization;

export interface RelatedParty {
    role: string; // 'customer' | 'payer' | ...
    partyOrPartyRole: Ref; // @referredType: 'Individual' | 'Organization'
}

/* ---------- Catalog ---------- */

export type LifecycleStatus = 'inDraft' | 'active' | 'retired' | 'inTest' | 'launched' | 'obsolete';
export type PriceType =
    | 'recurringCharge'
    | 'oneTimeCharge'
    | 'priceAlteration'
    | 'usageCharge'
    | 'markup'
    | 'discount'
    | 'oneTimeFee';
export type RecurringChargePeriod = 'daily' | 'monthly' | 'quarterly' | 'semiAnnually' | 'yearly';
export type ItemAction = 'add' | 'modify' | 'delete' | 'noChange';
export type PopRelationshipType = 'discounts' | 'overrides' | 'markup' | 'discount' | 'appliesTo';

export interface CharacteristicValueSpecification {
    id: string;
    value: unknown;
    unitOfMeasure?: string;
    isDefault?: boolean;
    characteristicValueSpecificationRef?: Ref;
}
export interface CharacteristicSpecification {
    '@type'?: 'CharacteristicSpecification';
    id: string;
    name: string;
    characteristicValueSpecification?: CharacteristicValueSpecification[];
}
export interface ProdSpecCharValueUse {
    '@type'?: 'ProductSpecificationCharacteristicValueUse';
    id?: string;
    name: string;
    characteristicSpecificationRef?: Ref;
    productSpecCharacteristicValue?: CharacteristicValueSpecification[];
}
export interface ProductSpecification {
    id: string;
    '@type': 'ProductSpecification';
    name: string;
    description?: string;
    version?: string;
    lifecycleStatus: LifecycleStatus;
    productSpecCharacteristic?: CharacteristicSpecification[];
    lastUpdate?: string;
}

export interface ProductOfferingTerm {
    id?: string;
    name?: string;
    duration: Duration;
    renewalAction?: 'autoRenew' | 'manualRepurchase' | 'none';
}
export interface AllowedProductAction {
    action: ItemAction;
    channel?: Ref[];
}
export interface PopRelationship {
    '@type'?: 'ProductOfferingPriceRelationship';
    id: string;
    name?: string;
    relationshipType: PopRelationshipType;
}
export interface BundledPopRelationship {
    '@type'?: 'BundledProductOfferingPriceRelationship';
    id: string;
    bundledProductOfferingPriceId: string;
    name?: string;
    relationshipType: 'composedOf' | 'nullify';
}
export interface PricingLogicAlgorithm {
    plaSpecId: string; // 'earlyTerminationPayRestOfTerm'
    name?: string;
}
export interface ProductOfferingPrice {
    '@type': 'ProductOfferingPrice';
    id: string;
    name?: string;
    description?: string;
    version?: string;
    lastUpdate?: string;
    lifecycleStatus?: LifecycleStatus;
    priceType: PriceType;
    price?: Money;
    percentage?: number;
    isBundle?: boolean;
    isPercentage?: boolean;
    isRange?: boolean;
    isTaxIncluded?: boolean;
    /** Tax rate in percent for this price (rebuild addition; the original resolves tax through the Lua tax service). */
    taxRate?: number;
    recurringChargePeriodType?: RecurringChargePeriod;
    recurringChargePeriodLength?: number;
    chargeType?: 'inArrear' | 'inAdvance';
    isPaymentPlanAllowed?: boolean;
    applicationDuration?: number;
    allowedAction?: AllowedProductAction[];
    appliesOn?: 'item' | 'quantity';
    pricingLogicAlgorithm?: PricingLogicAlgorithm[];
    popRelationship?: PopRelationship[];
    bundledPopRelationship?: BundledPopRelationship[];
    priceAlterationType?: string[];
    productOfferingTerm?: ProductOfferingTerm[];
    prodSpecCharValueUse?: ProdSpecCharValueUse[];
    lowerOrderQuantity?: number;
    upperOrderQuantity?: number;
    priority?: number;
    rangeIntervalType?: string;
    lowerPercentageLimit?: number;
    upperPercentageLimit?: number;
    lowerValueLimit?: number;
    upperValueLimit?: number;
    lowerPriceLimit?: Money;
    upperPriceLimit?: Money;
}

/* Price tables: the authoring format the portal edits; POPs are generated from them. */
export type PriceTableRelationship = 'overrides' | 'discount' | 'markup';
export type PriceTableAlteration = 'percentage' | 'fixed';
export interface BasePriceItem {
    '@type'?: 'BasePriceItem';
    priceType: PriceType;
    price?: Money;
    action?: ItemAction;
}
export interface BundleBasePriceItem {
    '@type'?: 'BundleBasePriceItem';
    priceType: PriceType;
    currency: string;
    alterationAmount: number;
    action?: ItemAction;
}
export interface PriceItemRange {
    lowerValue: number;
    upperValue: number;
}
export interface ComplexPriceItem {
    '@type'?: 'ComplexPriceItem';
    priceType: PriceType;
    currency: string;
    rowIndex: number;
    colIndex: number;
    alterationAmount?: number | null;
    ranges?: PriceItemRange[];
    duration?: number;
}
export interface CharacteristicValueEntry {
    characteristicSpecificationRef?: Ref;
    characteristicValueSpecificationId: string;
}
export interface QuantityTier {
    lowerValue: number;
    upperValue?: number;
}
export interface PriceTableHeaderItem {
    categoryName: 'Characteristic' | 'Terms' | 'QuantityTiers';
    categoryValues?: (CharacteristicValueEntry | ProductOfferingTerm | QuantityTier)[];
}
export interface PriceTableHeader {
    priceTableHeaderItems?: PriceTableHeaderItem[];
}
export interface SimpleBasePriceTable {
    '@type': 'SimpleProductOfferingBasePriceTable';
    tableConfig: { isTaxIncluded?: boolean; recurringChargePeriodType?: RecurringChargePeriod; taxRate?: number };
    tableData?: BasePriceItem[];
}
export interface BundleBasePriceTable {
    '@type': 'BundleProductOfferingBasePriceTable';
    tableConfig: {
        isTaxIncluded?: boolean;
        recurringChargePeriodType?: RecurringChargePeriod;
        bundlePriceRelationshipType: PriceTableRelationship;
        bundlePriceAdjustmentType?: PriceTableAlteration;
    };
    tableData?: BundleBasePriceItem[];
}
export interface ComplexPriceTable {
    '@type': 'SimpleProductOfferingComplexPriceTable' | 'BundleProductOfferingComplexPriceTable';
    tableConfig: {
        priceRelationshipType: PriceTableRelationship;
        priceAdjustmentType?: PriceTableAlteration;
        tableRows?: PriceTableHeader[];
        tableColumns?: PriceTableHeader[];
    };
    tableData?: ComplexPriceItem[];
}
export type PriceTable = SimpleBasePriceTable | BundleBasePriceTable | ComplexPriceTable;

export interface ProductOffering {
    id: string;
    '@type': 'ProductOffering';
    name: string;
    description?: string;
    version?: string;
    lifecycleStatus: LifecycleStatus;
    isBundle?: boolean;
    isSellable?: boolean;
    productSpecification?: Ref;
    productOfferingTerm?: ProductOfferingTerm[];
    productOfferingPriceTable?: PriceTable[];
    productOfferingPrice?: ProductOfferingPrice[];
    bundledProductOffering?: Ref[];
    bundledGroupProductOffering?: { bundledProductOffering: Ref[] }[];
    prodSpecCharValueUse?: ProdSpecCharValueUse[];
    productOfferingCharacteristic?: CharacteristicSpecification[];
    /**
     * Authoring shortcut (rebuild addition): when set, the catalog generates a one-time fee for
     * the delete action that charges the rest of the term of the recurring charge in this currency.
     */
    earlyTerminationFee?: { currency: string; taxRate?: number; isTaxIncluded?: boolean };
    validFor?: TimePeriod;
    lastUpdate?: string;
}

/* ---------- Product price (on orders and in inventory) ---------- */

export interface Characteristic {
    id?: string;
    name: string;
    value: unknown;
    unitOfMeasure?: string;
    characteristicSpecificationRef?: Ref;
    characteristicValueSpecificationRef?: Ref;
}
export interface Price {
    '@type'?: 'Price';
    dutyFreeAmount?: Money;
    taxIncludedAmount?: Money;
    taxRate?: number;
    percentage?: number;
}
export interface PriceAlteration {
    '@type'?: 'PriceAlteration';
    id?: string;
    name?: string;
    priceType?: PriceType;
    priority?: number;
    isPercentage?: boolean;
    isRange?: boolean;
    price: Price;
    productOfferingPrice?: Ref;
    productOfferingTerm?: Ref;
    applicationDuration?: number;
    recurringChargePeriod?: RecurringChargePeriod;
    lowerPercentageLimit?: number;
    upperPercentageLimit?: number;
    lowerValueLimit?: number;
    upperValueLimit?: number;
    lowerAmountLimit?: Money;
    upperAmountLimit?: Money;
}
export interface ProductPrice {
    '@type'?: 'ProductPrice';
    name?: string;
    description?: string;
    priceType: PriceType;
    price: Price;
    productOfferingPrice?: Ref;
    productOfferingTerm?: Ref;
    recurringChargePeriod?: RecurringChargePeriod;
    chargeType?: 'inArrear' | 'inAdvance';
    isPaymentPlanAllowed?: boolean;
    /** True when the amount in `price.dutyFreeAmount` already contains tax (copied from the POP). */
    isTaxIncluded?: boolean;
    isRange?: boolean;
    lowerValueLimit?: number;
    upperValueLimit?: number;
    priceAlteration?: PriceAlteration[];
}
export interface ProductTerm {
    id?: string;
    name?: string;
    duration: Duration;
    validFor?: TimePeriod;
    renewalAction?: 'autoRenew' | 'manualRepurchase' | 'none';
    productOfferingTerm?: Ref;
}

/* ---------- Inventory ---------- */

export type ProductStatus =
    | 'created'
    | 'pendingActive'
    | 'cancelled'
    | 'active'
    | 'pendingTerminate'
    | 'terminated'
    | 'suspended'
    | 'aborted';

export interface Product {
    id: string;
    '@type': 'Product';
    name?: string;
    status: ProductStatus;
    quantity: number;
    isBundle?: boolean;
    productOffering: Ref & { version?: string };
    productPrice?: ProductPrice[];
    productTerm?: ProductTerm[];
    productCharacteristic?: Characteristic[];
    billingAccount?: Ref;
    relatedParty?: RelatedParty[];
    subscription?: Ref;
    productRelationship?: { relationshipType: 'bundles' | 'bundledBy'; id: string }[];
    productOrderItem?: { orderId: string; orderItemId: string; action: ItemAction }[];
    creationDate?: string;
    startDate?: string;
    terminationDate?: string;
    /** Set when a suspended product is reactivated; recurring rating restarts from here. */
    resumeDate?: string;
    suspensionReason?: string;
    lastUpdate?: string;
}
export interface Subscription {
    id: string;
    '@type': 'Subscription';
    name?: string;
    state: 'pending' | 'active' | 'suspended' | 'terminated';
    product: Ref[];
    billingAccount?: Ref;
    relatedParty?: RelatedParty[];
    creationDate?: string;
}

/* ---------- Ordering ---------- */

export type ProductOrderState =
    | 'draft'
    | 'acknowledged'
    | 'queued'
    | 'pending'
    | 'held'
    | 'inProgress'
    | 'completed'
    | 'failed'
    | 'partial'
    | 'rejected'
    | 'cancelled'
    | 'assessingCancellation'
    | 'pendingCancellation';
export type ProductOrderItemState = ProductOrderState | 'submitted' | 'rollbackInProgress';

export interface StateReason {
    code: string;
    label: string;
}
export interface ProductOrderItem {
    id: string;
    action: ItemAction;
    quantity: number;
    state: ProductOrderItemState;
    productOffering?: Ref & { version?: string };
    product?: Partial<Product> & { id?: string };
    productOrderItemRelationship?: { id: string; relationshipType: string }[];
    itemTotalPrice?: OrderPrice[];
    stateReason?: StateReason[];
}
export interface OrderPrice {
    priceType: PriceType;
    recurringChargePeriod?: RecurringChargePeriod;
    price: Price;
}
export interface ProductOrder {
    id: string;
    '@type': 'ProductOrder';
    state: ProductOrderState;
    category?: string;
    description?: string;
    currency?: string;
    relatedParty: RelatedParty[];
    billingAccount?: Ref;
    paymentMethod?: Ref;
    channel?: Ref;
    productOrderItem: ProductOrderItem[];
    orderTotalPrice?: OrderPrice[];
    payment?: Ref[];
    deficitAmount?: Money;
    stateReason?: StateReason[];
    orderDate?: string;
    completionDate?: string;
    lastUpdate?: string;
}

/* ---------- Billing ---------- */

export type AccountState = 'created' | 'active' | 'suspended' | 'closed';
export type RatingType = 'prepaid' | 'postpaid' | 'hybrid';
export type BalanceType =
    | 'depositBalance'
    | 'disputedBalance'
    | 'loyaltyBalance'
    | 'receivableBalance'
    | 'payableBalance'
    | 'scheduledReceivable'
    | 'availableCreditLimit';
export type TransactionType =
    | 'billGenerationTransaction'
    | 'paymentTransaction'
    | 'adjustmentCreditTransaction'
    | 'adjustmentDebitTransaction'
    | 'transferCreditTransaction'
    | 'transferDebitTransaction'
    | 'depositCreditTransaction'
    | 'depositDebitTransaction';
export type SubscriberState =
    | 'active'
    | 'graceWithSubscription'
    | 'graceWithoutSubscription'
    | 'terminating'
    | 'terminated';

export interface AccountBalance {
    balanceType: BalanceType;
    amount: Money;
}
export interface BillingAccount {
    id: string;
    '@type': 'BillingAccount';
    name: string;
    state: AccountState;
    ratingType: RatingType;
    relatedParty: RelatedParty[];
    accountBalance: AccountBalance[];
    creditLimit?: Money;
    unsettledBillsAmount?: Money;
    billStructure?: { cycleSpecification?: Ref };
    /** Dunning state of the account's subscribers (Lua subscriptionlifecycle). */
    subscriberState?: SubscriberState;
    lastUpdate?: string;
}
export interface BillingCycleSpecification {
    id: string;
    '@type': 'BillingCycleSpecification';
    name: string;
    frequency: 'monthly' | 'quarterly' | 'semiAnnually' | 'annually';
    billingCycleStartDay?: number;
    billingDateShift: number;
    paymentDueDateOffset: number;
    mailingDateOffset: number;
    creditDateOffset: number;
    chargeDateOffset: number;
}
export interface BillCycle {
    id: string;
    '@type': 'BillCycle';
    name: string;
    billingDate: string;
    billingPeriod: TimePeriod;
    billingAccount: Ref;
    BillCycleSpecification: Ref;
    validFor: TimePeriod;
    paymentDueDate: string;
    mailingDate: string;
    creditDate: string;
    chargeDate: string;
}
export interface AccountBalanceTransaction {
    id: string;
    accountId: string;
    balanceType: BalanceType;
    transactionType: TransactionType;
    amount: Money;
    balanceAfter: Money;
    created: string;
    reference?: string;
}

export type AcbrType =
    | 'appliedBillingChargeProductRecurringCharge'
    | 'appliedBillingChargeProductOneTimeCharge'
    | 'appliedBillingChargeProductUsageCharge'
    | 'appliedBillingChargeServiceFee'
    | 'appliedBillingCreditRebate'
    | 'appliedBillingCreditBillingDiscount'
    | 'appliedBillingChargePenaltyFee'
    | 'appliedBillingChargeCreditAdjustment'
    | 'appliedBillingChargeCreditProrationAdjustment'
    | 'appliedBillingChargeDebitAdjustment'
    | 'appliedBillingChargeDebitProrationAdjustment'
    | 'productWithoutCharges'
    | 'appliedBillingCreditBillingReplacement'
    | 'appliedBillingChargeProductInterestCharge';

/** AppliedCustomerBillingRate: one rated charge or credit waiting to be (or already) billed. */
export interface Acbr {
    id: string;
    '@type': 'AppliedCustomerBillingRate';
    name?: string;
    description?: string;
    appliedBillingRateType: AcbrType;
    status: 'active' | 'pending' | 'cancelled' | 'completed' | 'invalidated';
    date: string;
    isBilled: boolean;
    billingAccount: Ref;
    product?: Ref;
    productOrder?: Ref;
    bill?: Ref;
    taxExcludedAmount: Money;
    taxIncludedAmount: Money;
    appliedTax?: { taxRate: number; taxAmount: Money }[];
    periodCoverage?: TimePeriod;
    relatedAcbr?: Ref;
}

export type CustomerBillState =
    | 'new'
    | 'validated'
    | 'sent'
    | 'partiallySettled'
    | 'settled'
    | 'overdue'
    | 'onHold'
    | 'cancelled'
    | 'invalidated'
    | 'pendingCalculation'
    | 'underCollection';

export interface AppliedPayment {
    payment: Ref;
    appliedAmount: Money;
}
export interface CustomerBillItem {
    id: string;
    name?: string;
    customerBillItemType: AcbrType;
    taxExcludedAmount: Money;
    taxIncludedAmount: Money;
    taxAmount?: Money;
    product?: Ref;
    appliedCustomerBillingRate: Ref[];
    periodCoverage?: TimePeriod;
}
export interface CustomerBill {
    id: string;
    '@type': 'CustomerBill' | 'PayNowBill';
    billNo: string;
    state: CustomerBillState;
    category: string;
    billDate: string;
    paymentDueDate?: string;
    billingPeriod?: TimePeriod;
    billingAccount: Ref & { ratingType?: RatingType };
    billCycle?: Ref | null;
    relatedParty: RelatedParty[];
    previousAmountDue: Money;
    amountDue: Money;
    remainingAmount: Money;
    taxIncludedAmount: Money;
    taxExcludedAmount: Money;
    payableBalanceUpdateAmount: Money;
    customerBillItems: CustomerBillItem[];
    appliedPayment: AppliedPayment[];
    paymentMethod?: Ref;
    previousCustomerBill?: Ref;
    createOn: string;
}

/* ---------- Payment ---------- */

export type PaymentStatus =
    | 'reserved'
    | 'pending'
    | 'approved'
    | 'declined'
    | 'failed'
    | 'cancelling'
    | 'cancelled'
    | 'cancellationFailed';
export type MatchingStatus = 'matchedFully' | 'matchedPartially' | 'matchingErrors';

export interface PaymentItem {
    id: string;
    totalAmount: Money;
    unmatchedAmount?: Money;
    isMatchedSuccessfully?: boolean;
    item?: Ref; // the CustomerBill this item was matched to
}
export interface Payment {
    id: string;
    '@type': 'Payment';
    status: PaymentStatus;
    description?: string;
    paymentDate: string;
    totalAmount: Money;
    account: Ref;
    payer?: RelatedParty;
    paymentMethod?: Ref;
    paymentItem: PaymentItem[];
    unmatchedAmount?: Money;
    matchingStatus?: MatchingStatus;
    productOrder?: Ref;
    /** Bill this payment should settle first. */
    customerBill?: Ref;
    externalId?: string;
}
export interface Refund {
    id: string;
    '@type': 'Refund';
    status: 'requested' | 'completed' | 'rejected';
    totalAmount: Money;
    account: Ref;
    reason?: string;
    requestedDate: string;
    completionDate?: string;
}
