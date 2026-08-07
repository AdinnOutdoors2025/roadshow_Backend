# Project Context

> Live working state. Updated at the end of every session by `/bye`.
> Stable architecture facts live in [architecture.md](architecture.md); rules live in [business-rules.md](business-rules.md).

**Last updated:** 2026-08-07

---

## 1. Current project status

**Roadshow Backend** (Adinn Outdoors) — Express 5 + Mongoose 8 REST API for outdoor-advertising vehicle booking and campaign management. Single entry point `VehicleMain.js`, port 3001, shared production MongoDB Atlas cluster.

- **Branch:** `karthi-claude` (main branch is `main`)
- **State:** actively developed, in production use
- **Working tree:** clean apart from the `.claude/` and `docs/` additions

Active development is concentrated in the **admin operations engine** — `controllers/Adminordercontroller/Adminordercontroller.js` (2000+ lines) and `controllers/Salesordercontroller/Salesordercontroller.js`.

---

## 2. Current milestone

Admin/sales pipeline hardening — three modules landed in the last week:

| Module | Commit | Date |
|---|---|---|
| Role permission (`sales` / `operation` menu gating) | `484be56` | 2026-08-07 |
| Invoice generation on the Order aggregate | `a306bd9` | 2026-08-05 |
| Project code creation + project settings (default To/Cc mail) | `2cba5dd` | 2026-08-05 |
| Pipeline history logging | `0ea406a` | 2026-08-04 |

---

## 3. Recently completed

- **`RolePermission` model** (`Models/RolePermissionModel.js`) — `{ role: 'sales' | 'operation', allowedMenus: [String] }`, unique per role. Wired via `Routes/RolePermissionRoutes/` + `controllers/RolePermissionController/`.
- **`ProjectSetting` model** (`Models/ProjectSettingModel/ProjectSettingModel.js`) — single settings doc holding `defaultTo` / `defaultCc` / `updatedBy` for project-code mail defaults.
- **Invoice data on `Order`** — `invoiceData` (sub-doc: `invoiceNumber`, `invoiceDate`, `lineItems[]`) plus `invoiceHistory[]` with granular `changes[]` and `lineItemChanges[].fieldChanges[]` audit trails. Sits at `Models/AdminorderModel/Adminorder.js:576-678`.
- Invoice generation was **removed from the sales side** (`6ccb134`) and now lives on the admin/ops side only.

---

## 4. Decisions taken

- Invoice generation belongs to the **admin/ops pipeline** (`invoiceGeneration` stage), not the sales pipeline.
- Invoice edits are **never overwritten silently** — every change appends to `invoiceHistory[]`, following the repo-wide `*History` audit pattern.
- Menu-level authorization is **data-driven** via the `RolePermission` collection rather than hardcoded role checks, so menus can change without a deploy.
- The two auth systems (customer vs admin/client) stay **separate on purpose** — do not merge without sign-off.

---

## 5. Known issues / risks

| # | Issue | Impact |
|---|---|---|
| 1 | **Shared production DB.** Mongo URI is hardcoded in `VehicleMain.js`; `.env`'s `MONGODB_URI` is ignored. No dev/staging DB exists. | Any write lands in live data. Never run `deleteMany`/`drop`/bulk updates without explicit confirmation. |
| 2 | **Customer cart flow is stale.** `controllers/CartController/cart.js` queries `Models/vehicleDetails.js` for fields that don't exist on it (`model`, `city`, `basePrice`, `mainImage`). | Cart/checkout likely broken end-to-end. Untested. |
| 3 | **Case-sensitive require mismatches** in `VehicleMain.js` (`./routes/...` vs `Routes/`, `./Routes/vehicleTypeRoutes` vs `VehicleTypeRoutes.js`). | Fine on Windows, breaks on a Linux deploy. |
| 4 | **Cloudinary credentials hardcoded** in `VehicleMain.js`, not env-driven. | Key rotation requires a source edit. |
| 5 | **`ROADSHOW_QUOTATION_APPROVAL_PASSWORD` has an insecure hardcoded fallback.** | Must be set explicitly in every environment. |
| 6 | **Two out-of-sync vehicle models** — `vehicleDetails.js` (current) vs `VehicleMainSchema.js` (legacy customer catalog). | Confirm which one a new feature should read from. |
| 7 | **No tests, no linter, no build step.** | Verification is manual only — run the server, exercise the route. |
| 8 | **`CLAUDE.md` §9/§10 tables are out of date** — missing RolePermission, ProjectSetting, CityRoutes, VehicleModelRoutes, Employeeauthroutes, EnquiryRoutes, ContactEnquiryRoute, Productenquiry, and the Election routes. | Route lookups from the table alone will miss these. |
| 9 | **`CLAUDE.md` is 37 KB and contains two merged copies** of the same architecture doc. | Consumes context every session. |

---

## 6. Files most likely to be modified

1. `controllers/Adminordercontroller/Adminordercontroller.js` — core ops engine
2. `controllers/Salesordercontroller/Salesordercontroller.js` — sales pipeline
3. `Models/AdminorderModel/Adminorder.js` — the central Order aggregate
4. `Routes/AdminorderRoutes/AdminorderRoutes.js`
5. `controllers/RolePermissionController/RolePermissionController.js`
6. `VehicleMain.js` — whenever a new router is mounted

---

## 7. Next session TODO

See [todo.md](todo.md).
