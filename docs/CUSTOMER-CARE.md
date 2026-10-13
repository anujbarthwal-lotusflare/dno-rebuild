# Customer Care Suite

The portal-vue app rebuilds the Customer Care Suite of the LotusFlare DNO portal. Layout, spacing,
colours, typography, icons and illustrations follow the original portal
(`ts-polaris/portal/src`): the design tokens of `tailwind.preset.ts` and `designSystemColors.ts`
are in `portal-vue/src/styles/base.css`, and the icons, fonts and images were copied from the
original `src/assets`. Components carry the name of the original component they replicate in their
header comment (Button, Select, Search, Tag, Modal, Drawer, TabGroup, DataTable, Pagination,
FileUploader, HeaderLayout, SearchBanner, Sidebar, LayoutPage, LayoutSection, AbstractTileWrapper...).

## Pages

| Page | Route | Notes |
| --- | --- | --- |
| User Manager (Customer Care Suite) | `#/customer-care/user-manager` | Find users with Account ID, E-mail, IMSI, Subscriber ID, MSISDN or User ID, *Equal to* or *Starts with* (E-mail and MSISDN). One match opens the profile, several open Search Results. The default parameter comes from Settings. |
| Search Results | `#/customer-care/user-manager/search-results` | Matches of a search, click to open. |
| Customer Overview | `#/customer-care/user-manager/user/:id` | Basic info, contact info, KYC, flags, account deletion (Received / Approved / Scheduled in yellow, Terminating in red, schedule time, requested by). Edit User, Support Actions, Page edit mode. |
| Account Overview | `#/customer-care/user-manager/account/:id` | Edit Account, Support Actions, Page edit mode. |
| Subscriber Overview | `#/customer-care/user-manager/subscriber/:id` | MSISDN in the header, Edit Subscriber (state transitions), Support Actions, Page edit mode. |
| Organization | `#/customer-care/user-manager/organization/:id` | Details, Page edit mode. |
| Message History (menu: Messages) | `#/customer-care/message-history` | Messages sent to end users. |
| External Log History (menu: Audit Logs) | `#/customer-care/external-log-history` | Calls to external systems, filter by entity. |
| Residential / Business Customers | `#/customer-management/residential-customers`, `...business-customers` | Customer lists. |
| Customer 360 | `#/customer-management/residential-customer/:id`, `...business-customer/:id` | Header, contact strip, tabs (below). |
| Settings > User Settings | `#/settings/user-settings` | Time zone, date format, time format, default user search parameter. Dates across the suite follow these. |

Sidebar entries outside the Customer Care Suite (Product Catalog, Charging, ...) open a placeholder
page so the navigation matches the portal.

## Tiles

The tile catalog (`backend/src/care/tiles.ts`) has the 70 tiles of the original
`constants/layoutTiles.ts` with their names, sizes (XLARGE 12x6, LARGE 12x4, MEDIUM 6x4, SMALL 3x4,
THIRD 4x2, VERTICAL 4x6, CUSTOM 12x3) and the pages each may be placed on.

Every table tile has the tile table header: fuzzy search over the whole record (a typo or a partial
word still matches, closest first; `field:value` narrows to one field, quotes allow spaces, several
conditions must all match), Filter (column, condition, value; removable filter tags), `{ }` shows
the tile's data as JSON, a column picker, sorting by column, pagination (Show 5/10/15/25/50), and a
side panel with the row's details on click.

Tiles with their own behaviour:

| Tile | Behaviour |
| --- | --- |
| Wallet | Entity picker (the profile and its linked accounts and subscribers), balance, expire/grace dates. Top-up (amount, optional voucher code) and Deduct balance (not above the balance), each behind a Sensitive edit confirmation. |
| Current Benefits | Latest available benefit of the picked account: discount, remaining uses, benefit type, benefit ID. |
| Billing | Amount due of the chosen account, View info (transaction history sidebar with remaining balance), Download invoice. |
| Billing V2 | Amount due on the latest unpaid bill, Download invoice (PDF opens in a new tab). |
| Billing Transaction V2 | Transactions; a row opens the charges sidebar (Charges, Discount, Refund). Select charges, enter a reason, Refund. Reserve, failed and fully refunded transactions cannot be refunded; a charge cannot be refunded twice. |
| Billing Statements (V2) | Statements with Download / Open of the PDF. |
| Agent Notes | New Note (note tags, agent notes, PDF/PNG/JPG/DOC/DOCX attachments up to 5 MB, drag and drop), detail side panel, Download of the attachments from the row menu. |
| Appointments | Next appointment card (date, weekday, time range, type, ID), Read note, Edit (current slot, Change appointment time, date and time, agent notes, Notify customer) with an "Are you sure you want to edit this appointment?" confirmation. |
| Associated Entities (Large) | Hierarchy of the profile; IDs open that profile. On the Organization page it shows "Organization: name" with a copy button. |
| Associated Entities Tiles | The same hierarchy as cards. |
| Salesforce Message History | Choose an Account ID, Search, open a message (campaign, sent, sender, subject, message). |
| Access List | Users with portal roles on the entity; User ID opens the user. |
| Organization Accounts / Associated Roles | Accounts and roles of the organization. |
| Subscriber Warnings | Derived from the line: installation pending on an active line, activation not completed, suspended, empty wallet. |
| Plan And Purchase | Current plan(s) with allowance use, purchase history. |
| Balances and Wallet | Wallet, credit balance, usage buckets. |
| Broadband facts | Consumer broadband label. |
| Audit Logs Tile | Every agent action in this rebuild (top-up, deduction, refund, note, appointment edit, support action, profile edits) is written here. |
| Latest Order Details V2, Wholesale Pricing Schema, TMO ID Info | Key/value summaries. |

The remaining history tiles (deliveries, login history, consent, IMEI history, OE queue and
workflows, vouchers, porting, usage, external logs...) read from systems outside this rebuild
(delivery, auth, OE, charging services). Their rows are generated deterministically from the
entity id in `backend/src/care/tileData.ts`, so each profile always shows the same history and some
profiles show "No data". Replace a `case` there with a real client to connect a system.

## Customize the menu

The pencil next to the logo opens **Customize menu**, which covers the whole sidebar: the main
menu, the bottom area (Settings, Support & Feedback, My Account, the tenant) and the environment label.

- **Drag** an entry by its row to reorder it; drag it across the "Bottom of the sidebar" line to move
  it between the main menu and the bottom area. Drag a sub-menu within its group or into another
  group. Holding an entry at the top or bottom edge scrolls the menu, a blue line shows where it
  lands, and Esc cancels.
- **Edit** (pencil): rename any entry or sub-menu, change a menu's icon, and change the link of an
  entry you added. "Original name" undoes a rename. Settings keeps its time-zone suffix.
- **Add menu** (bottom of the main menu): a group that holds sub-menus, or a single link; pick a
  name and an icon. **Add sub-menu** (under every group): a name and a link, either a portal page
  (`/...`, the field suggests the existing pages) or a web address (`https://...`, opens in a new
  tab). Without a link it opens a page with its name. Other links (`javascript:`, `//host`) are refused.
- **Delete** (bin, click twice): removes an entry; deleting a group removes its sub-menus.
- **Hide** (eye): keeps an entry but leaves it out of the menu. Empty groups are hidden.
- **Environment label**: rename "Staging" or hide it.

Every change is saved right away for the agent (`GET|PUT|DELETE /care/menu`). **Reset** brings back
the original sidebar; entries added to the portal later appear in their default place.

## Page edit mode and layout versions

Page edit mode turns the page into the layout editor. Everything on the page can be changed:

- **Tile library** (panel on the right): every tile allowed on the page, with search and
  All / Not on page / On page filters. Drag a tile onto any section; a dashed blue outline shows
  where it lands and the other tiles make room. The + button adds it to the end of the first section.
- **Tiles**: drag a tile by its title to move it (red placeholder, push-down on collision,
  vertical compaction); drag it onto another section to move it there. Holding a tile near the top
  or bottom edge scrolls the page. Resize from the corner or with the size menu (Small, Third,
  Vertical, Medium, Wide, Large, Extra large), rename with the pencil, delete with the bin.
- **Sections**: every section, including the **Details** block at the top, is dragged by its header
  bar (a short click still collapses it). While you drag, all sections fold to one-line headers so
  the whole page fits on screen; a blue line shows where the section goes, and Esc cancels.
  Rename, Initially Collapsed, Move section up/down, Remove section, Add section at the bottom, and
  Tile type + Add tile are also available. The Details block cannot be removed; its position is
  saved in the layout (`"kind": "details"`), and layouts saved earlier keep it at the top.

Changes are versioned like source code:

| Concept | What happens |
| --- | --- |
| Draft (working copy) | Every change is saved automatically, about half a second after you make it, as the page's draft. Reloading the page, closing the browser or pressing Cancel keeps it; the bar under the header shows "Unsaved draft" with Continue editing and Discard draft. |
| Save / Save and close | Commits the draft as the next version of **My layout**, with an optional message. The dialog lists what changed (tiles added, removed, moved, resized, renamed; sections added, removed, changed). |
| Save As Operator Default | Commits it as the next **Operator default** version, which everyone sees. |
| Version history | Every version of both lines (My layout and Operator default) with number, message, author, time and changes. Open in editor (loads it as your working copy), Restore (commits it again as a new version; history is never rewritten), Make operator default, Download (JSON). |
| Revert layout | Stops using My layout (the operator default or built-in default shows again); its versions stay in the history. |
| Export / Import | Layout JSON; an import becomes your draft until you save it. |

The API validates every draft and version (known tiles allowed on the page, inside the 12-column
grid, titles up to 60 characters).

### Versions on disk and in git

Each committed version is also written to `layouts/<page>/<user|operator>/v<N>.json`, with
`current.json` holding the latest. Settings:

| Variable | Effect |
| --- | --- |
| `DNO_LAYOUT_DIR` | Folder for the files (default `layouts/` in the project; `off` keeps versions in the database only). |
| `DNO_LAYOUT_GIT=1` | After each version, `git add` and `git commit` the folder with the version message. The folder must be inside a git repository. |
| `DNO_LAYOUT_GIT_PUSH=1` | Also `git push` after the commit (uses your git remote and credentials). |

Layout API: `GET /care/layout/:page`, `PUT|DELETE /care/layout/:page/draft`,
`POST /care/layout/:page/:scope/commit`, `GET /care/layout/:page/versions`,
`GET /care/layout/:page/versions/:scope/:n`, `POST /care/layout/:page/versions/:scope/:n/restore`,
`DELETE /care/layout/:page/user`.

## Customer 360

Read model over the core domain (party, ordering, inventory, billing, payment):

| Tab | Contents and actions |
| --- | --- |
| General information | Profile, contact medium (Edit: phone, email, postal address), identifications, credit profiles. |
| Orders | Product orders with items in the side panel. |
| Product portfolio | Subscriptions with their products as a tree. Subscription actions: Purchase product offerings (places a real order), Modify by order (quantity change order), Modify by quote (business), Modify status (active, suspended, terminated; termination prorates). Product actions: Modify by order, Modify status. |
| Quotes (business) | Quote lifecycle: submit, approve or reject, accept, cancel. |
| Accounts | Billing accounts with balance; business customers can delete (close) an account without products in service. |
| Bills | Bills with PDF download. |
| Payments | Payments; Create payment against an account, optionally settling a chosen bill first. |
| Provisioning Records | Service records behind each product. |

## API

All routes are under `/api` and listed in `backend/src/care/routes.ts`: `/care/search`,
`/care/{user|account|subscriber|organization}/:id`, `/care/:entityType/:id/tile/:tile`,
wallet, notes, appointments, transactions and refunds, invoices (PDF), layouts
(`GET /care/layout/:page`, `PUT /care/layout/:page/{user|operator}`, `DELETE /care/layout/:page/user`),
settings, support actions, and `/customer360/...`. Layout routes are listed under page edit mode above.

## Not rebuilt

Keycloak roles (every agent can edit layouts and save the operator default; versions are signed "Portal Agent"), the AI assistant
(the button opens a note), the tenant switcher and command palette, and the modules behind the
other sidebar entries.
