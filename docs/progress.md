# Progress Log

> Append-only. Newest first. Updated by `/bye` at the end of each session.

---

## 2026-08-07

**Session setup**

- Added project slash commands `.claude/commands/hi.md` (session start) and `.claude/commands/bye.md` (session end).
- Created the `docs/` folder they depend on: `context.md`, `business-rules.md`, `architecture.md`, `todo.md`, `progress.md`. Content sourced from `CLAUDE.md` and verified against the working tree.
- Audited the repo structure: 32 route folders, 31 controller folders, 32 models. Found 9 known issues, recorded in `context.md` §5.
- Found that `CLAUDE.md` §9/§10 route and collection tables are missing ~10 modules added since they were written.

**Pending:** the actual feature task for this session has not been chosen yet.

---

## Commit history — feature work to date

Reconstructed from git log. Branch `karthi-claude`.

### 2026-08 — pipeline & permissions

| Date | Commit | Work |
|---|---|---|
| 08-07 | `484be56` | **Role permission module.** New `RolePermission` model (`sales` / `operation` → `allowedMenus[]`), routes, controller. Touched `Adminorder.js`, `MainLoginSchema.js`, `adminroutes.js`, `admincontroller.js`, `Adminordercontroller.js`, `Salesordercontroller.js`, `VehicleMain.js`. |
| 08-05 | `a306bd9` | **Invoice generation module.** Added `invoiceData` + `invoiceHistory[]` to the Order schema with granular field-level change tracking. |
| 08-05 | `2cba5dd` | **Project code creation.** New `ProjectSetting` model (`defaultTo` / `defaultCc` / `updatedBy`) + routes + controller. |
| 08-04 | `0ea406a` | Pipeline history logging on `Adminorder.js` and both order controllers. |
| 08-04 | `6ccb134` | Removed invoice generation from the **sales** side — it now lives on admin/ops only. |
| 08-03 | `626618a` | Edit-profile update; sales-handling invoice generation added (later moved). Touched `dateConflictChecker.js`. |

### 2026-07 — campaign calculator, invoicing, orders

| Date | Commit | Work |
|---|---|---|
| 07-31 | `b0b3148` | Unused line removals |
| 07-30 | `08d237d` | Campaign calculator — extra charges |
| 07-30 | `232811f`, `f9f812b` | Order creation changes |
| 07-30 | `8e7d7c2` | Issue-time changes |
| 07-29 | `7f2cd41` | Campaign location field on order creation + client request API |
| 07-28 | `f3160b0` | Invoice discount |
| 07-27 | `2a3563e` | Invoice save options |
| 07-25 | `4fbfbce` | Campaign calculator and invoice |
| 07-25 | `52ed4cf` | ClientRequest changes |
| 07-24 | `0a04ed6`, `8f328b9` | Campaign calculator — hour changes, daily timeline summary |
| 07-23 | `3c3d481` | Campaign calculator changes |
| 07-22 | `ad0ada5` | Login-time driver campaign calculator |
| 07-22 | `03af59b` | Order creation changes |
| 07-22 | `8f9007a` | PO document edit |
| 07-21 | `d277dc1` | On-road extra km and extra hours |
