# DNO rebuild

A clean TypeScript rebuild of two parts of the DNO platform:

- the **Customer Care Suite** of the DNO portal (User Manager search, Customer / Account / Subscriber
  Overview and Organization pages with their tiles, page edit mode, Customer 360, agent settings),
  with the portal's look: same layout, design tokens, Open Sans, icons and illustrations;
- the **core commercial flow** behind it:
  customer → catalog → price → order → product in service → rating → bill → payment → dunning.

It was written from the logic in the two existing repositories (`ts-polaris`, the NestJS
monorepo, and `lua`, the OpenResty services). Everything is TypeScript:

- `backend/` is the domain core. It has no dependencies and knows nothing about HTTP frameworks.
- `nest/` is the NestJS application that exposes the core as a REST API.
- `portal-vue/` is the Vue 3 portal (Vite, vue-router): the Customer Care Suite and Customer 360.

## Run it

Requires Node.js 22.18 or newer.

```bash
npm install      # once
npm start        # builds both, then serves API and portal on http://127.0.0.1:3000
npm test         # core and Customer Care tests + the NestJS API tests
```

While working on the console, run `npm start` in one terminal and `npm run dev:portal` in another;
the dev server on http://127.0.0.1:5173 reloads on save and forwards `/api` to port 3000.

Data lives in `./data/dno.sqlite`; demo data is loaded on first start (the Customer Care demo data
is added to an existing database too).

Open http://127.0.0.1:3000 and you land on **Customer Care > User Manager**. Things to try:

| Search with | Value | Opens |
| --- | --- | --- |
| Account ID | `94caf1984e6e41a88ea7cce35bee9a24` | Account Overview (Yan Li, ZAR wallet) |
| Subscriber ID | `39668fc4472cbf3505e9e1433cea` | Subscriber Overview (installation pending warning, appointment) |
| E-mail | `asha.verma@example.com` | Customer Overview (two accounts, deletion scheduled) |
| MSISDN, Starts with | `9198100` | Search results with three lines |
| Account ID | `99b81ab636494140b21dead6dfc70b82` | Account of the LotusFlare test organization |

Customer 360: **Customers > Business Customers > AWS Cloud Pte Ltd**.
`docs/CUSTOMER-CARE.md` describes every page, tile and action.
Settings: `PORT`, `HOST`, `DNO_DB` (SQLite path or `:memory:`), `DNO_SEED=0` to start empty.

Page layouts are editable and versioned: **Page edit mode** on any overview page lets you drag
tiles in from the tile library, drag tiles within and between sections, drag sections to reorder,
and resize, rename and delete tiles; changes autosave as a draft, **Save** commits a
numbered version with a message, and **Version history** restores or promotes any version. Each
version is also written to `layouts/<page>/<user|operator>/v<N>.json`. To commit every version to
git, run `git init` in the project (or point `DNO_LAYOUT_DIR` at a repo) and start with
`DNO_LAYOUT_GIT=1 npm run serve`; add `DNO_LAYOUT_GIT_PUSH=1` to push too.

### Without npm

The core also ships a dependency-free server that needs no install: `npm run start:core`, tests
with `npm run test:core`. It exposes the same API (the Customer Care routes are declared once in
`backend/src/care/routes.ts` and mounted by both servers) and serves the built portal
(`portal-vue/dist`) when present, otherwise the older framework-free console in `portal/`.

## What is in it

| Area | Folder | What it does |
| --- | --- | --- |
| Party | `backend/src/party` | Individuals and organizations, status state machines, create/patch validators |
| Catalog | `backend/src/catalog` | Specifications, offerings, lifecycle rules, price tables turned into prices |
| Pricing | `backend/src/pricing` | Which prices apply (term, quantity, currency, characteristics), discounts and markups, one-time fees, early termination |
| Tax | `backend/src/tax` | Percentage tax, inclusive and exclusive, single and bulk |
| Ordering | `backend/src/ordering` | Order capture, validation with reasons, delivery as a saga with rollback |
| Inventory | `backend/src/inventory` | Products and subscriptions, activation, suspension, termination, bundle rules |
| Billing | `backend/src/billing` | Billing accounts and balances, bill cycles, rating records, bill calculation, settlement, proration |
| Payment | `backend/src/payment` | Payments and refunds, status rules, matching payments to bills |
| Dunning | `backend/src/lifecycle` | Overdue bills move an account through grace, suspension and termination; paying restores service |
| Customer Care | `backend/src/care` | User manager entities, search, tile catalog and data, wallets, refunds, agent notes, appointments, layouts, preferences, Customer 360 |
| Shared | `backend/src/common` | Exact decimal maths, state machine engine, document store, event bus, saga runner |
| API | `nest/src` | NestJS module, controllers and error filter over the core |
| Portal | `portal-vue/src` | Vue 3 Customer Care Suite and Customer 360 in the original portal's look |

`docs/LOGIC-MAP.md` lists, rule by rule, where each piece of logic came from in the original
repositories and which parts were reconstructed rather than ported.

## Money conventions

- All money maths is exact decimal with half-even rounding, as in the original.
- `payableBalance` above zero is credit the customer holds; below zero is what they owe.
- Postpaid accounts are charged on their bill. Prepaid accounts pay on delivery: existing credit
  is used first and the shortfall is reserved against the order's payment method.

## Not in this slice

Authentication and permissions (the original uses Keycloak), multi-tenancy, Kafka,
Cassandra/Postgres, service orders towards the network (SOM/OSS), usage charging, quotes, payment
gateways and payment plans, external tax providers, document generation, and the other ~45
ts-polaris apps and ~80 Lua services. The API has no login: keep it bound to localhost.

The store and event bus sit behind small interfaces (`common/store.ts`, `common/runtime.ts`) so
Postgres and Kafka can be added without touching domain code.
