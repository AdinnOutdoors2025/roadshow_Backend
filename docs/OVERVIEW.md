# Roadshow Backend — Overall Overview

> Fresh full-codebase analysis of **`VehicleMain.js`** (the single entry point) and every route / controller / model / middleware / util / config it wires in.
> **Date of analysis:** 2026-08-28
> **Scope:** read-only review. No code was changed. This file is a *fresh* overview of the current tree and intentionally supersedes / complements the older `architecture.md` / `context.md` / `business-rules.md`, which under-report several newer modules.

---

## 1. What this is

An **Express 5 + Mongoose 8 REST API** for **Adinn Outdoors' "Roadshow"** — booking and campaign management of branded outdoor-advertising vehicles (LED vans / roadshow vehicles) across Indian cities. It is **frontend-only-here**: the backend serves JSON exclusively to two separate frontends (customer site + admin dashboard). There is no backend code in the frontend repo (`D:\Roadshow_Admin`) — this is the matching server.

Three audiences, three login flows:

- **Customers** — browse catalog, place a booking / campaign request (phone-OTP auth via `ClientUser`).
- **Clients / Agencies** — a booking flow with optional GST-verified identity + optional agency PO document.
- **Admin / Staff / Sales / Operation** — full order lifecycle: enquiries, quotations, pipeline stages, on-road execution, driver management, invoicing, campaign closure.

**Scale (source files):** 33 route files, 31 controller files, 33 model files, 5 middleware, 18 utils, 2 config, 1 reusable component. Two files dominate:
- `controllers/Adminordercontroller/Adminordercontroller.js` — ~186 KB / ~4,900 lines (ops engine).
- `controllers/VehicleDetailsController/vehicledetails.js` — ~128 KB.

---

## 2. Entry point — `VehicleMain.js`

The **only** file that boots the app. Responsibilities:

1. **DNS override** (`dns.setServers(['8.8.8.8','1.1.1.1'])`) — comment says "Added For IP Whitelisting".
2. **CORS** — actually configured **three times**. Middleware order matters:
   - `app.use(cors({ origin: true, credentials: true }))` (line 117) — reflects any origin and sets `Access-Control-Allow-Origin` before the allowlist runs.
   - An explicit allowlist block (lines 141–162) — accepted frontend origins plus a wildcard for **any `*.vercel.app`** subdomain (preview deployments). On a disallowed origin its callback passes `new Error(...)` to `next(err)`, so the request errors out rather than succeeding.
   - A final bare `app.use(cors())` (line 384) at the very end — only reachable by requests that already passed the allowlist (so largely redundant), and it also drops the `credentials` flag. Intent is clearly the allowlist; the first `origin:true` block reflects arbitrary origins in the header before the gate runs. Worth confirming which of the three should survive.
3. **Body parsing** — `express.json({ limit: "100mb" })`, `express.urlencoded({ limit: "100mb" })`, `bodyParser.json()`.
4. **Static file serving** — `/uploads`, `/public`, `/images` (first-app), plus bare `express.static("public")` (duplicated several times).
5. **MongoDB connection** — **hardcoded Atlas URI in source**, not from `.env`. `.env`'s `MONGODB_URI` is never read. `PORT` also hardcoded to `3001`. (Deploys to Render at `https://roadshow-backend.onrender.com`.)
6. **Router mounts** — every feature router (see §4).
7. **Inline endpoints** (scripted directly in this file, not via a Routes/controller pair):
   - `POST /upload` — Cloudinary single-image upload (`imageUpload.single("file")`), **Cloudinary credentials hardcoded in source**.
   - `POST /save-videos` — Cloudinary array upload up to 5 files (images/videos routed to different folders). Credentials hardcoded.
   - `POST /delete-video` — Cloudinary delete by `public_id` + `resource_type`.
   - `POST /api/update-vehicles-json` — deletes then re-uploads `roadshowRateCard/vehicles.json` in DigitalOcean Spaces (`adinn-space` bucket).
   - `POST /uploadaws` — Raw AWS S3 single-file upload (memory storage), builds a public URL.

### Entry-point quirks worth knowing
- **Duplicated/defensive middleware:** CORS configured twice; `express.static("public")` used 3+ times; a local-disk `multer.diskStorage` uploader (`upload`) is defined but the active vehicle image path uses `Middleware/vehicleDetailsUpload` instead.
- **Case-sensitive `require()` mismatches** (fine on Windows, breaks on a Linux deploy):
  - `require("./Routes/vehicleTypeRoutes")` vs actual file `Routes/VehicleTypeRoutes.js`.
  - `require("./Routes/shortUrl.routes.js")` vs actual `Routes/shortUrl.routes.js` — **this one actually matches** on disk (the `./routes/...` casing warning in older docs is stale; the current line uses the correct `Routes/` path).
- **Hardcoded secrets in this file:** Cloudinary `cloud_name`/`api_key`/`api_secret`, and the MongoDB connection string. Neither is env-driven.
- `app.use(cors())` at the very end (line 384) re-opens CORS for all origins after the strict allowlist — **effectively undoing the allowlist** for requests that reach the end of the middleware chain. Worth confirming intent.

---

## 3. Modules & module-system split

- **CommonJS everywhere** (`require`/`module.exports`) **except** the **roadshow-quotation** feature which is **ESM** (`import`/`export`) working via Node's `require(esm)` interop (runtime re-parse + lower perf): `controllers/roadshowQuotation/roadshowQuotationController.js`, `Utils/quotationUtils.js`, `Models/RoadshowQuotationModel.js`, `Models/CounterModel.js`, `config/digitalOceanSpaces.js`.
- Never mix `require` and `import` in one file; match the file you're editing.

---

## 4. Full route map (mounts declared in `VehicleMain.js`)

| Mount | Router | Controller | Domain |
|---|---|---|---|
| `/auth` | `Routes/Userroutes/authroutes.js` | `UserController/userController` | Customer register/OTP/login |
| `/api/client-auth` | `Routes/ClientAuthRoutes/` | `ClientAuthController` | Client-user OTP auth (`userType: 2`) |
| (root) | `Routes/Adminauthroutes/adminroutes.js` | `Adminauthcontroller/admincontroller` | Admin/staff/operation-user auth, profile, forgot-password |
| `/vehicles` | `Routes/Vehicleroutes/vehicleroutes.js` | `VehiclesController` | Legacy customer catalog |
| `/api` | `Routes/vehicleDetailsRoutes/vehicleDetails.js` | `VehicleDetailsController` | **Current** vehicle + registration CRUD, availability, statistics |
| `/api` | `Routes/VehicleTypeRoutes.js` | inline | Vehicle-type master |
| (root) | `Routes/EntryVehiclesRoutes/entryVehicles.js` | `EntryVehiclesController` | Simple fleet-entry records |
| (root) | `Routes/VehiclesAvailabilityRoutes/vehiclesavailability.js` | `VehiclesAvailabilityController` | Per-vehicle/per-location availability |
| (root) | `Routes/VehicleModelRoutes/vehiclemodel.js` | `VehicleModelController` | Vehicle model master |
| (root) | `Routes/VehicleModelElectionRoutes|VehiclesAvailabilityElectionRoutes` | their controllers | Alternate/parallel model + availability master data |
| (root) | `Routes/cartRoutes/cart.js` | `CartController` | Customer cart (**known stale** — see §8) |
| (root) | `Routes/OrderRoutes/orderRoutes.js` | `OrderController` | Legacy customer order creation |
| `/admin` | `Routes/AdminorderRoutes/AdminorderRoutes.js` | `Adminordercontroller` | **Core ops engine** (pipeline, on-road, driver, extra-km, campaign closure, FOC, invoice, vamosys proxy) |
| `/sales` | `Routes/Salesorderroutes/salesorderRoutes.js` | `Salesordercontroller` | Sales pipeline, PO docs, project mail/code |
| `/api/roadshow-quotations` | `Routes/roadshowQuotation/` | `roadshowQuotationController` (ESM) | Quotations / estimates, PDF, approval |
| `/packages` | `Routes/PackageManagementRoutes/` | `PackageManagementcontroller` | Rate-card packages per vehicle type/model |
| `/vehicleoffers` | `Routes/vehicleOfferRoutes/` | `vehicleOfferController` | Date-ranged discount campaigns |
| `/gstdetails` | `Routes/GstDetailRoutes/` | `gstDetailController` | GST master + `/verify` |
| `/promoters`, `/drivers` | `Routes/Promoterroutes|DriverdetailsRoutes` | their controllers | Promoter roster, Driver KYC |
| `/api/orders` | `Routes/driverlocationRoutes/` | `driverlocationcontroller` | Live driver GPS pings per order |
| `/locations` | `Routes/locationRoutes/` | `locationController` | State/city master |
| `/client-requests` | `Routes/ClientRequestRoutes/ClientRequestRoutes.js` (+ `clientRequestAuth.js`) | `ClientRequestController` | **Client booking requests, tracking, agency PO, auto-raised orders** |
| (root) | `Routes/Dashboard/dashboard.js` | `Dashboardcontroller` | Admin dashboard aggregates |
| `/project-settings` | `Routes/ProjectSettingRoutes/` | `ProjectSettingController` | Single settings doc (project-code mail To/Cc) |
| (root) | `Routes/RolePermissionRoutes/` | `RolePermissionController` | Role **and user** menu permissions |
| `/` | `Routes/shortUrl.routes.js` | `shortUrl.controller.js` | `GET /:code` → redirect |
| (root, inline) | `VehicleMain.js` itself | — | `/upload`, `/save-videos`, `/delete-video`, `/uploadaws`, `/api/update-vehicles-json` |

> Always read the router file for the exact sub-path — some routers are mounted with a prefix, others at root with full paths declared internally.

---

## 5. Authentication & authorization (three independent systems)

1. **Customer** — `Middleware/authmiddleware.js` `protect`, backed by `Models/User/user.js`, secret falls back to hardcoded `"roadshow_secret_key"` if `JWT_SECRET` unset. Used by `/auth/*`.
2. **Admin / staff / sales / operation** — `Middleware/rolemiddleware.js`: `protect` (re-reads live account `status`/`role`/`isAdmin` from DB on **every** request so deactivation is immediate), `authorizeRoles(...)`, `isAdmin`, `verifyAdminExists`, and `authorizeUserType(...)` for the numeric `userType` claim. Backed by `Models/MainLoginSchema.js`. No hardcoded secret fallback.
3. **Client/agency** — `Routes/ClientRequestRoutes/clientRequestAuth.js`: `protectClient`, `protectStaff`, `allowClientOrStaff`. Resolves the JWT against `Models/ClientLoginModel` (a `ClientUser`), re-checks live `status`, and lets `allowClientOrStaff` fall through to the staff guard so one route serves both audiences.

**Key fact:** JWT secrets between customer and admin/client flows differ and tokens are **not interchangeable**.

Also present but separate:
- **Employee** (`Routes/Employeeauthroutes`, `Models/Employeelogin`) — roles `employee`/`admin`, restricted to `@adinn.co.in` emails. **Not wired into `VehicleMain.js`** (its `require` is commented out) — dead-ish, confirm before assuming live.
- `login` for staff uses `username`/`password`; roles are `admin`/`staffAdmin`, plus newer `sales`/`operation` concept for menu permission.

---

## 6. Storage — multiple live backends chosen per code path

1. **Local disk** — inline disk uploader + fallback in `Middleware/spaceUpload.js` / `Middleware/vehicleDetailsUpload.js` when `STORAGE_TYPE !== "space"`.
2. **Cloudinary** — inline `/upload`, `/save-videos`, `/delete-video`; **credentials hardcoded in `VehicleMain.js`**.
3. **DigitalOcean Spaces** — `Middleware/spaceUpload.js`, `Middleware/vehicleDetailsUpload.js`, `Middleware/orderImageupload.js`, `config/spaces.js` (CJS), `config/digitalOceanSpaces.js` (ESM, quotation only); `Utils/uploadToSpaces.js`, `Utils/deleteFromSpaces.js`. Gated by `STORAGE_TYPE=space`, plus a dedicated `CLIENT_AGENCY_PO_DOCUMENTS_STORAGE` flag for agency PO docs.
4. **Raw AWS S3** — inline `/uploadaws`, separate `AWS_*` env vars.

Duplication to be aware of: `Middleware/spaceUpload.js` and `Middleware/vehicleDetailsUpload.js` are near-duplicates; `config/spaces.js` (CJS) and `config/digitalOceanSpaces.js` (ESM) are two separate Spaces clients. Do **not** add a fifth backend.

---

## 7. The Order aggregate (`Models/AdminorderModel/Adminorder.js`)

One large document per order — the central business object. **Two parallel pipelines** on the same document:

- **Ops pipeline** `pipelineStatus`: `todo → projectCodeCreation → projectExecution → onRoad → campaignRunning → vehicleUnavailable → clientClosure → invoiceGeneration → paymentStage2 → closedWon | closedLost`.
- **Sales pipeline** `salesPipelineStatus`: `enquiry → needAnalysis → proposalPriceQuote → negotiationReview → closedWon → projectCodeCreation → salesFinalClosedWon → invoiceGeneration → closedLost` (note: the enum has grown `salesFinalClosedWon` + `invoiceGeneration` beyond older docs).

Rich embedded arrays (many with full audit history):
- `bookingItems[]` — per line: dates, quantities, pricing breakdown, promoter add-ons, campaign metadata, media, `additionalFields[]` (mode `+`/`-`).
- `onRoadExecutionArray[]` — driver/vehicle assignment per booking item, with `entryStatus` (active/removed), `unavailableStatus`, and `replacesEntryId` chains for replacements.
- On-road sub-audits: `onRoadHistory`, `onRoadIssues`, `onRoadUnavailableHistory` (replacement linkage), `onRoadDriverHistory`.
- Billing: `onRoadExtraKm`, `extraKmDetailsArray`, `dailyHoursLogArray` (with client-facing day metrics: distance/activations/leads/engaged/photos), `campaignCompensationArray`.
- FOC / closure: `campaignClosureArray` (type closed/foc/paid, `focHistory`, `focChatMessages`), `orderClosedWonArray`, `orderClosedLostArray`, `clientFeedbackHistory`.
- PO docs: `poCommentsArray`, `poDocumentEditHistory`, and the newer `agencyPODocument` + `agencyPODocumentHistory` (versioned snapshots).
- Handler reassignment: `opsHandlerAssignmentHistory` / `handlerAssignmentHistory` (`previousHandler`/`newHandler`, `isTemporary`, leave window, status active/reverted/madePermanent).
- Project code: `projectCodeArray`, `projectMailLogs`, `projectCodeCommentsArray`. Pipeline logs: `pipelineLogs`, `salesPipelineLogs`, `negotiationLogs`.
- **Invoicing** is now on the ops side only: `invoiceData` (with **multi-row `discounts[]`**, `lineItems[]`, `isDraft` flag) + `invoiceHistory[]` with `changes[]`, `lineItemChanges[]`, `discountChanges[]` — **never overwritten silently**, every edit appends.

---

## 8. Client requests & the "booking becomes an Order" flow

`controllers/ClientRequestController/ClientRequestController.js` (~64 KB) is a major and **under-documented** module:

- `createClientRequest` — customer places a booking. When every line carries a resolvable `packageId`, it **raises a real `Order` automatically** (`createOrderForClientRequest`) so the public booking enters the ops pipeline instead of waiting to be re-typed. `ClientRequestOrder.orderRef`/`orderId` link back; both stay `null` if no package is available (admin then creates by hand).
- Tax breakdown on the request: `cgstAmount`/`sgstAmount`/`igstAmount` (always sum to `gstAmount`, derived from GSTIN state code).
- **Agency PO document** — optional, agency accounts only, its own multer pipeline (`Utils/agencyPoDocumentUpload.js`: extensions JPG/PNG/WEBP/PDF/DOC/DOCX, image ≤5MB / doc ≤10MB, storage via `CLIENT_AGENCY_PO_DOCUMENTS_STORAGE`).
- **Client tracking console** (client-safe): `getClientRequestTracking`, `getClientRequestLiveLocation`, `getClientRequestDrivingSummary`, `getClientRequestRouteTrack`, `getClientRequestVehicleHistory`. These intentionally exclude driver contact / internal fleet fields from the payload.
- **Order model fields `orderId`/`userId`/`name`/`phone`/etc.** mirror the admin Order.

**Client journey mapping** — `Utils/clientJourneyStages.js` collapses the two internal pipelines into a single 5-step client-facing funnel (`submitted → confirmed → prepared → onRoad → completed`, plus `cancelled`), derived from **live** status fields (authoritative, not log history), with milestone timestamps, a day-wise campaign report (`buildDayWiseReport` — only days actually logged are "completed"; never fabricates), `buildActivity`, `deriveOnRoadDay`, and `flattenPhotos` (capped at 24). Presentation layer only — internal stage renames don't break it as long as tier mapping stays correct.

---

## 9. Vamosys GPS integration (`Utils/vamosysClient.js`, `vamosysHistoryClient.js`)

A third-party fleet GPS provider, used by both admin and client-facing routes:

- `fetchVamosysApiKey` — cached 1h; short-lived key requests.
- `fetchAllVehicleLocations` / `getLiveLocationsForRegistrationNumbers` — live positions, mapped through a **client-safe allowlist** (lat/lng/address/speed/status/distance/stale flag, never driver contact or telemetry).
- `getDrivingSummaryForDay` — day-wise moving/parked/idle/no-data breakdown from a heavier history endpoint; cached 3min.
- `getRouteTrackId` — Vamosys public embed widget, cached 5min, so the public page never ships Vamosys account params.
- `vamosysHistoryClient.js` (~16 KB) — additional history access used by the admin vehicle-history view.
- Admin proxies: `GET /admin/vamosys/apikey`, `GET /admin/vamosys/vehicle-locations` (`Adminordercontroller.getVamosysApiKey`, `getVehicleLocationsProxy`).

---

## 10. Sales & ops controllers

**`Salesordercontroller.js`** (~39 KB): `getSalesPipeline`, `getSalesOrderById`, `updateSalesPipeline` (with sales document upload), `uploadStageDocument`, `sendProjectMail`, `saveProjectCode`, `saveEnquiryName`, `getDateConflicts` (uses `Utils/dateConflictChecker.js`), `reassignHandler` / `resolveHandlerHandover`, `updatePODocument`, `replaceAgencyPoDocument`. Several of these routes are **not role-guarded** (`send-project-mail`, `save-project-code`, `getDateConflicts`) — worth confirming intent.

**`Adminordercontroller.js`** (~186 KB, the largest file): pipeline guards (`updateOrderPipeline`), `createAdminOrder` (+ `createCustomer`), `updateAdminOrder`, `getAllOrders`/`getOrderById`/`getOrderByMongoId`/`getOrdersByPipeline`/`getProjectCodeOrders`, `getBookingSummaryPdfData` (internal secret-gated), on-road lifecycle (`submitOnRoadDetails`, `updateOnRoadDriver`, `addOnRoadIssue`, `resolveOnRoadIssue`, `markVehicleUnavailable`, `replaceOnRoadVehicle`, `markVehicleAvailable`, `releaseOnRoadVehicle`), billing (`addExtraKmDetails`, `addDailyHoursLog`, `setPurchasedPoolWindow`, `addCampaignCompensation`, `getCampaignCalculator`, `getDayByDayHistory`), closure (`submitClientFeedback`, `submitCampaignClosure`, `approveFocEntry`, `createAndApproveFocEntry`, `updateCampaignClosure`, `submitOrderClosedWon`, `submitOrderClosedLost`, `sendFocChatMessage`), invoicing (`saveInvoice`), handler reassignment (`reassignOpsHandler`, `resolveOpsHandlerHandover`), vamosys proxies.

---

## 11. Utilities (`Utils/`)

`agencyPoDocumentUpload.js`, `bookingSummaryPdfRenderer.js` (puppeteer → frontend print page → PDF → Spaces), `campaignMailer.js` (external PHP mail API), `clientJourneyStages.js`, `dateConflictChecker.js`, `deleteFromSpaces.js`, `focMailer.js` (`EXTERNAL_API_URL`), `gstVerification.js` (regex + Masters India API), `quotationUtils.js` (ESM), `response.js`, `sendotp.js`, `shortUrl.js`, `smsServices.js` (Nettyfish), `uploadToSpaces.js`, `vamosysClient.js`, `vamosysHistoryClient.js`, `vehicleAssignmentResolver.js`, `vehicleAvailability.js`. `ReusableComponents/reusableOfferLogic.js` — prorated discount math.

---

## 12. Environment variables actually consumed

Derived from a scan of the source (names only; values live in the gitignored `.env`). Notable: `.env` defines `MONGODB_URI`/`PORT`/`ALLOWED_ORIGINS`/`CLOUDINARY_*`/`MEON_*`/`AWS_*` but **many are ignored** (Mongo URI and PORT are hardcoded in `VehicleMain.js`; CORS is hardcoded in source). Env vars actually read by code:

`JWT_SECRET`, `JWT_EXPIRES_IN`, `NETTYFISH_API_KEY`/`SENDER_ID`/`TEMPLATE_ID`, `OTP_MODE`, `STORAGE_TYPE`, `CLIENT_AGENCY_PO_DOCUMENTS_STORAGE`, `LOCAL_UPLOAD_PATH`, `LOCAL_BASE_URL`, `PRODUCTION_BASE_URL`, `MAX_IMAGE_SIZE`/`MAX_VIDEO_SIZE`/`MAX_FILE_SIZE`, `FRONTEND_BASE_URL`, `DO_SPACES_KEY`/`SECRET`/`REGION`/`ENDPOINT`/`BUCKET`/`CDN_BASE`/`CDN_URL`, `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_BUCKET_NAME`, `GST_API_KEY`, `EXTERNAL_API_URL`, `CODECREATION_API_URL`, `INTERNAL_API_SECRET`, `DEFAULT_PROMOTER_CHARGE`, `GST_PERCENT`, `NEGOTIATION_DISCOUNT_PERCENT`, `MAX_DISCOUNT_PERCENT`, `CAMPAIGN_HOURS_PER_DAY`, `DEFAULT_WORK_START_HOUR`/`DEFAULT_WORK_END_HOUR`, `PROJECT_CODE_AUTO_MAIL_TO/CC`, `ROADSHOW_*` mail vars, `ROADSHOW_QUOTATION_APPROVAL_PASSWORD`, `DISABLE_ROADSHOW_SHORT_URL`, `ADMIN_PHONE_NUMBER`, `APP_BASE_URL`, `MEON_*`, `NODE_ENV`.

> ⚠ **Security finding:** Cloudinary credentials and the Mongo URI are **hardcoded in `VehicleMain.js`**, not env-driven. `ROADSHOW_QUOTATION_APPROVAL_PASSWORD` has a hardcoded fallback in the quotation controller. `authmiddleware` falls back to a hardcoded JWT secret. These should be moved/authenticated via env if this repo were to be changed.

---

## 13. Known issues / risks observed during the review

| # | Issue | Notes |
|---|---|---|
| 1 | **Shared production DB** — Mongo URI hardcoded in `VehicleMain.js`; `.env`'s `MONGODB_URI` ignored; no dev/staging DB. | Any write lands in live data. No `deleteMany`/`drop`/bulk without explicit confirmation. |
| 2 | **Customer cart flow stale** — `controllers/CartController/cart.js` reads legacy fields (`model`, `city`, `basePrice`, `mainImage`) off the current `Models/vehicleDetails.js` which doesn't have them. | Cart/checkout likely broken end-to-end. Untested. Flag, don't silently "fix". |
| 3 | **CORS configured three times** — `cors({origin:true})` at `VehicleMain.js:117` (reflects any origin) before the allowlist gate at 141, plus a trailing bare `cors()` at 384. | Intent is the allowlist; the first block reflects arbitrary origins into the response header before the gate runs, and the trailing block is largely redundant. Confirm which one should survive. |
| 4 | **Hardcoded secrets** — Cloudinary creds + Mongo URI in source; hardcoded JWT-secret fallback in customer `authmiddleware`; insecure hardcoded fallback for `ROADSHOW_QUOTATION_APPROVAL_PASSWORD`. | Rotation requires source edits. |
| 5 | **Case-sensitive `require()`** — `require("./Routes/vehicleTypeRoutes")` vs `Routes/VehicleTypeRoutes.js`. | Fine on Windows; breaks on a Linux deploy. |
| 6 | **Duplicate / near-duplicate upload middleware** — `Middleware/spaceUpload.js` vs `Middleware/vehicleDetailsUpload.js`; two Spaces clients. | Fixes may need applying in multiple places. |
| 7 | **Two out-of-sync vehicle models** — `vehicleDetails.js` (current, registration-based) vs `VehicleMainSchema.js` (legacy catalog). | Confirm which a new feature should read. |
| 8 | **Mixed CJS/ESM** — the quotation feature relies on `require(esm)` interop at runtime. | Perf warning on boot; needs modern Node. |
| 9 | **No tests / linter / build step** — `npm test` not configured. | Manual verification only. |
| 10 | **Unguarded sales routes** — `POST /sales/pipeline/:id/send-project-mail`, `save-project-code`, `getDateConflicts` have no `protect`. | Confirm intent; some may rely on sessions. |
| 11 | **`LoginMain.js` / `UserAdminLogin.js` / Employeeauthroutes** not wired into `VehicleMain.js`. | Likely dead; confirm before removing. |

---

## 14. Commands

```bash
npm install       # (-legacy-peer-deps if peer-dep errors)
npm run dev       # nodemon VehicleMain.js — hot reload
npm start         # node VehicleMain.js
npm run build     # legacy placeholder (ls), not a real build
```

No test/lint script. Verify by booting (`✅ Roadshow MongoDB Connected Successfully`) and exercising a route.

---

## 15. How to use this file

- **`OVERVIEW.md`** — this file: the current, complete, code-verified picture of the whole backend.
- `architecture.md` / `business-rules.md` / `context.md` / `todo.md` / `progress.md` — the pre-existing doc set (older; several sections now stale, e.g. route/collection tables missing RolePermission, ProjectSetting, CityRoutes, client-tracking, agency PO, vamosys).
- **Frontend counterpart:** `D:\Roadshow_Admin\CLAUDE.md` and its `src/app/admin`, `src/app/roadshow`, `src/lib`, `src/app/utils` describe the two frontends this API serves.
