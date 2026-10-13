# Logic map: original → rebuild

"Ported" means the rule was read in the original source and re-implemented with the same
behaviour. "Reconstructed" means the original spreads the behaviour over orchestration plans or
services that were not read line by line; the rebuild implements a sensible equivalent, and it
should be reviewed by someone who knows the intended behaviour.

Original paths are relative to `ts-polaris/` unless they start with `lua/`.
Rebuild paths are relative to `backend/src/`.

## Ported

| Rule | Original source | Rebuild |
| --- | --- | --- |
| State machine engine (targets, events, guards, entry/exit actions, config validation) | `libs/stateMachineEngine/src/StateMachineEngine.ts` | `common/stateMachine.ts` |
| Individual states: initialized → validated → deceased | `apps/partyManagement/src/module/stateMachine/IndividualStateMachine.ts` | `party/service.ts` |
| Organization states: initialized → validated → closed | `apps/partyManagement/src/module/stateMachine/OrganizationStateMachine.ts` | `party/service.ts` |
| A new party must start as initialized; a status change emits an event | `apps/partyManagement/.../IndividualStateTransitionInterceptor.ts` | `party/service.ts` |
| Department cannot be a legal entity; head office cannot have a parent; parent must exist; credit profile and tax-exemption certificate completeness | `apps/partyManagement/src/module/*/controller/http/validators/*` | `party/service.ts` |
| Offering and specification lifecycle transitions | `apps/productCatalogManagement/resources/enum_state_transitions_dir_name/enum_name_to_state_transition.json` | `catalog/service.ts` |
| Price tables → product offering prices: simple base, bundle base with its five availability rules, complex tables with terms, quantity tiers, characteristics and ranges; generated names and descriptions | `apps/productCatalogManagement/src/module/productOfferingPrice/domain/service/ProductOfferingPriceService.ts` | `catalog/popBuilder.ts` |
| Price filter: term, quantity, currency, characteristic, no one-time fees, one major price per type, alterations need a surviving target | `libs/priceCalculation/src/priceFilter.ts` | `pricing/pricing.ts` `filterProductOfferingPrice` |
| Discounts and markups by priority | `libs/priceCalculation/src/priceAlterationCalculator.ts`, `DutyFreeAmountCalculator.ts` | `calculatePriceAfterAlteration`, `calculateDutyFreeAmount` |
| One-time fee matching per action; quantity multiplier; "multiple fees matched" error | `libs/priceCalculation/src/calculator.ts` | `calculateOneTimeFee` |
| Early termination: remaining term ÷ charge period × recurring price | `libs/priceCalculation/src/priceLogicAlgorithm.ts`, `timeUtil.ts` | `earlyTerminationPayRestOfTerm` |
| Bundle nullify / composedOf handling for member prices | `libs/priceCalculation/src/priceCalculationHelper.ts` | `applyBundlePriceForChild` |
| Product price and price alteration construction | `libs/priceCalculation/src/priceCalculationHelper.ts`, `priceCalculationService.ts` | `constructProductPriceWithAlteration` |
| Difference between an order line and the installed product | `libs/priceCalculation/src/calculator.ts` | `calculateDifference` |
| Percentage tax, inclusive/exclusive, bulk totals, "tax exceeds price" check | `lua/services_root/services/tax/tax_provider/lf_tax/LFTaxHelper.lua`, `tax/TaxHelper.lua`, `tax/operator_impl/Default.lua` | `tax/tax.ts` |
| Draft orders are stored as-is; acknowledged orders are enriched, then placed | `apps/productOrderCaptureAndValidation/src/module/productOrdering/domain/service/ProductOrderingService.ts` | `ordering/service.ts` |
| Order validators: order state, customer present and not closed/deceased, billing account belongs to customer, quantity range, term consistency, price comparison, credit limit | `apps/productOrderCaptureAndValidation/.../validateOrder/validator/*.ts` | `ordering/service.ts` `validate`, `diffPrices` |
| Order delivery step sequence; "rejected before fulfilment starts, failed after"; rollback | `apps/productOrderCaptureAndValidation/src/orchestrationPlans/common/plans/default/place_order.json`, `apps/productOrderDelivery/.../fulfilment_execution_v2.json`, `product_order_item_fulfilment.json` | `ordering/service.ts` `placeOrder` |
| Product activation: allowed source states, term validity window, manual-repurchase termination date, subscription activation | `apps/productInventory/src/product/domain/service/ProductService.ts` | `inventory/service.ts` |
| Bundle deactivation: all members → head; partial only if the operator allows it | `lua/services_root/services/subscriptionlifecycle/StateTransitions.lua` | `inventory/service.ts` `resolveBundleDeactivation` |
| Billing account state rules; credit limit not editable through balance edit or patch; currency cannot change | `apps/billingAccountManagement/src/common/constant/Ruleset.ts`, `common/utils/DomainUtils.ts`, `module/billingAccount/domain/service/BillingAccountService.ts` | `billing/accountService.ts` |
| Bill cycle dates: schedule, end date, offsets, offset caps | `apps/billCalculation/src/module/invoiceManagement/helpers/createBillCycle.ts` | `billing/billCycle.ts` |
| Bill amounts: amount due, remaining, tax in/excluded, balance update, unsettled amount | `apps/billCalculation/src/module/invoiceManagement/domain/service/BillCalculationService.ts` (`calculateCustomerBillAmounts`, `calculateRemainingAmount`, `createCustomerBill`) | `billing/billingService.ts` |
| Charge/credit sign per rating type | `libs/customization/src/constants/CustomizedBillingConstants.ts` | `ACBR_SIGN` |
| Bill settlement across unpaid bills; which bill states can be paid | `BillCalculationService.settleBills` | `settleBills` |
| Proration credit amount | `BillCalculationService.calculateProratedAmounts` | `calculateProratedAdjustment` |
| Payment and refund status transitions | `apps/paymentManagement/resources/enum_state_transitions_dir_name/enum_name_to_state_transition.json` | `payment/service.ts` |
| Payment validation, unmatched amount, matching status | `apps/paymentManagement/src/module/payment/domain/service/PaymentService.ts` | `payment/service.ts` |
| Subscriber state graph and action names (active, grace with/without subscription, terminating, terminated); "billing initiated" suspension reason | `lua/services_root/services/subscriptionlifecycle/EventHandler.lua` | `lifecycle/dunning.ts` |

## Reconstructed (review these)

- **What each order delivery step does.** Step names and order are the original's; the bodies are
  new: how the prepaid shortfall ("deficit") is computed, when the reservation is committed, how a
  modify re-prices a product. A modify does not charge or credit the price difference for the
  period already running.
- **Product status table.** The original does not declare it in one place.
- **Rating.** Charging a product on activation, the recurring-charge run (the original has a
  separate app, `productRecurringChargeScheduleManagement`), and not rating time spent suspended.
- **Balance arithmetic** for `editAccountBalance` (an orchestration plan in the original) and the
  available-credit calculation.
- **Overdue marking, bill cancellation, payment reversal, the refund balance check.**
- **Dunning schedule and effects.** The days-overdue thresholds are configuration here; the
  original takes them from debt-collection dunning profiles, and its actions also touch user
  management, SIM and OSS.
- **Single preferred contact medium per type.** Implemented from the validator's name.
- **Catalog checks beyond lifecycle** (bundle content, term duration, negative prices). The
  original's `ProductOfferingValidator` (620 lines) was not ported rule by rule.

## Deliberate differences

- A price that overrides the base price (a term price) replaces the base price it points to, and
  the early-termination fee follows the price the product actually carries.
- A bundle's own discount is attached to the member prices it is composed of, so it survives the
  price filter.
- One-time fees authored without channels apply to every channel (the original always requires a
  channel match).
- `earlyTerminationFee` on an offering is an authoring shortcut that generates the fee price.
- `taxRate` lives on the price; the original resolves tax through the tax service per operator.
- Only JSON Merge Patch is supported for updates (the original also accepts JSON Patch).
- Calculating a bill with nothing to bill is an error rather than an empty bill.
