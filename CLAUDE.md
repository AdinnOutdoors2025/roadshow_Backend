# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠ Strict Commands (read first)

- **Do not change any file without asking first.** Propose the change, wait for explicit approval, and only then edit. This applies to every file in the repo, including config, `.env`-adjacent files, and this CLAUDE.md itself.
- Never touch `.env`, hardcoded credentials, or the MongoDB connection string without explicit sign-off — this backend talks to a **shared production database** (see [Environment Setup](#environment-setup)); there is no separate dev/staging DB to experiment against.
- Never run destructive Mongo operations (`deleteMany`, `drop`, bulk updates) against the live data without confirmation.

## 1. Project Overview

**Roadshow** (product of **Adinn Outdoors**) is the backend for an outdoor-advertising vehicle booking and campaign-management platform — think branded LED vans/vehicles booked for roadshow marketing campaigns across Indian cities. This repo is a single Express + Mongoose REST API. There is no frontend, template engine, or SSR here; it exclusively serves JSON to separate frontend app(s) (customer site, admin dashboard) hosted elsewhere (Vercel/Netlify origins are hardcoded into CORS — see below).

The system serves three audiences with distinct login flows:
- **Customers** — browse vehicles, add to cart, place booking enquiries (phone OTP auth).
- **Clients** (a lighter "request a vehicle" flow, `userType: 2`) — separate OTP auth, submit vehicle requests.
- **Admin / Staff-Admin / Sales / Employees** — run the entire order lifecycle: quotations, vehicle assignment, on-road execution, driver management, invoicing, campaign closure. This is where most of the business complexity and active development lives (`Adminordercontroller.js` alone is 2000+ lines).

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (developed against v24) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 8 (single shared Atlas cluster) |
| Auth | `jsonwebtoken` (JWT) + `bcryptjs` (password/secret hashing) |
| File storage | Multer, with **three parallel backends**: local disk, Cloudinary, DigitalOcean Spaces (`@aws-sdk/client-s3` + `multer-s3`), plus a one-off raw AWS S3 endpoint |
| SMS/OTP | Nettyfish SMS gateway via `axios` |
| Email | `nodemailer` (legacy `LoginMain.js`) and an external PHP mail API (`axios` POST to `adinndigital.com`) for quotation approval / FOC mail |
| Short links | Custom short-URL service (`Utils/shortUrl.js`, `Models/ShortUrlModel.js`) |
| Process manager (dev) | `nodemon` |

No ORM query builder beyond Mongoose, no GraphQL, no message queue, no Redis/cache layer, no test framework, no linter/formatter config.

## 3. Folder Structure

```
VehicleMain.js              ← the real entrypoint (boots everything, see Architecture)
LoginMain.js                ← legacy/unused standalone employee auth file, not wired in
UserAdminLogin.js           ← legacy, entirely commented out, not wired in
.env                        ← secrets (gitignored) — see Environment Setup
package.json                ← "start"/"dev" scripts only, no test/lint scripts

Routes/<Feature>/*.js        ← Express routers, one folder per feature
controllers/<Feature>/*.js   ← business logic + Mongoose calls, one folder per feature
Models/<Feature>/*.js        ← Mongoose schemas (inconsistent: some in subfolders, some bare files at Models/ root)
Middleware/                  ← authmiddleware.js, rolemiddleware.js, upload middleware (multer configs)
Utils/                       ← stateless helpers (OTP send, GST verify, SMS, availability/conflict checking, quotation numbering, short URLs, response helpers)
ReusableComponents/          ← shared business-logic helpers (currently just offer/discount calculation)
config/                      ← DigitalOcean Spaces S3 client configs (two overlapping versions, see Architecture)
public/uploads/, uploads/    ← local file storage targets when STORAGE_TYPE=local
```

Route and controller folder names are **not** consistently cased or pluralized (`Adminauthroutes` vs `AdminorderRoutes` vs `cartRoutes`) — always resolve the exact path with a search rather than guessing it from the feature name.

## 4. Coding Standards

- **Module system:** CommonJS (`require`/`module.exports`) everywhere **except** the roadshow-quotation feature, which is ESM (`import`/`export`) — see Architecture §6. Match whichever style the file you're editing already uses; never mix `require` and `import` in one file.
- **Response shape:** the dominant convention is `{ success: boolean, message, data }` on success and `{ success: false, message, error }` on failure. `Utils/response.js` exports `successResponse`/`errorResponse` helpers for this, but usage is inconsistent — many controllers inline the same shape by hand instead. Follow whatever the surrounding controller in that file already does.
- **Error handling:** per-handler `try/catch`, no centralized Express error-handling middleware. Mongoose `ValidationError` and duplicate-key (`error.code === 11000`) are the two error shapes handled explicitly in most auth/CRUD controllers.
- **Validation:** done by hand inside controllers (manual required-field checks) plus Mongoose schema-level `required`/`match`/custom `validate` functions. There is no request-validation middleware (no Joi/Zod/express-validator).
- **Audit trails:** a recurring pattern across the `Order` schema is arrays of sub-documents named `*History`, `*Array`, or `*Logs` (e.g. `onRoadHistory`, `pipelineLogs`, `focHistory`) that record who changed what and when — when adding a new mutable field to an order, follow this pattern for traceability rather than just overwriting the value.
- **Numeric vs string enums:** role/type fields are inconsistently modeled — some are string enums (`role: ['admin','staffAdmin']`), others are bare numbers with a comment explaining the meaning (`customerType: 0|1` for individual/organization, `userType: 2` for client users, `status: [0,1,2]` for todo/inprogress/completed). Check the surrounding comment/usage before assuming a value's meaning.
- **Timestamps:** virtually every schema uses `{ timestamps: true }` — keep this on any new schema.
- Indentation, quoting, and semicolon style vary file-to-file (this codebase has evidently had several different contributors/eras) — match the local file's style rather than reformatting wholesale.

## 5. Architecture

**Single entrypoint.** `VehicleMain.js` is the only file that boots the app: CORS, body parsing, static file serving, the MongoDB connection, and every route module are all wired here. It also defines several inline upload/delete endpoints directly in the file (`/upload`, `/save-videos`, `/delete-video`, `/api/update-vehicles-json`, `/uploadaws`) rather than through a Routes/controller pair — check here first when tracing how a request reaches a handler.

**Feature-folder pattern, loosely enforced.** Each feature has a matching `Routes/<Feature>/` + `controllers/<Feature>/` pair, plus a model somewhere under `Models/`. Some routers are mounted with an explicit prefix (`app.use("/vehicles", vehicleRoutes)`); others are mounted at root and define their full paths internally (`app.use(cartRoutes)` where the router itself declares `/addToCart`) — **always read the route file itself** to know the real path; don't infer it from the `app.use()` call.

**Two independent auth/role systems coexist and are not interchangeable:**
- `Middleware/authmiddleware.js` → `protect`, backed by `Models/User/user.js` (customer phone/OTP JWT). Used by `/auth/*`.
- `Middleware/rolemiddleware.js` → `protect`, `authorizeRoles`, `isAdmin`, `verifyAdminExists`, `authorizeUserType`, backed by `Models/MainLoginSchema.js` (admin/staff). `authorizeUserType(2)` gates the separate client-user flow (`/api/client-auth/*`) by a numeric `userType` claim.

A JWT issued by one flow will be rejected by a route protected with the other flow's `protect`.

**Three file-storage backends are live simultaneously**, chosen per code path rather than a single global switch:
1. Local disk (`multer.diskStorage`) — the inline uploader in `VehicleMain.js`, and the fallback in `Middleware/vehicleDetailsUpload.js` / `Middleware/spaceUpload.js` when `STORAGE_TYPE !== "space"`.
2. Cloudinary — `/upload`, `/save-videos`, `/delete-video` in `VehicleMain.js`, with **credentials hardcoded in source**, not read from `.env`.
3. DigitalOcean Spaces (`@aws-sdk/client-s3` + `multer-s3`) — `Middleware/spaceUpload.js`, `Middleware/vehicleDetailsUpload.js`, `config/spaces.js`, `config/digitalOceanSpaces.js`; gated by `STORAGE_TYPE=space`.
4. Raw AWS S3 — the standalone `/uploadaws` endpoint, separate `AWS_*` env vars.

`Middleware/spaceUpload.js` and `Middleware/vehicleDetailsUpload.js` are near-duplicates (same field config, same DO Spaces logic) — a fix to vehicle image/video upload behavior often needs to be applied to both. `config/spaces.js` (CommonJS) and `config/digitalOceanSpaces.js` (ESM) are also two separate DO Spaces client configs used by different features.

**Mixed CommonJS/ESM.** The roadshow-quotation feature — `controllers/roadshowQuotation/roadshowQuotationController.js`, `Utils/quotationUtils.js`, `Models/RoadshowQuotationModel.js`, `Models/CounterModel.js`, `config/digitalOceanSpaces.js` — is ESM despite `package.json` having no `"type": "module"`. It works only via Node's `require(esm)` interop (reparses at runtime, prints a perf warning on boot); this needs a reasonably modern Node.

**Case-sensitive path mismatches.** A couple of `require()` calls in `VehicleMain.js` don't match on-disk casing (`require("./routes/shortUrl.routes.js")` vs. actual `Routes/`; `require("./Routes/vehicleTypeRoutes")` vs. actual `Routes/VehicleTypeRoutes.js`). Silently fine on Windows, will break on a case-sensitive Linux deploy target — fix casing if you touch these files.

**CORS** is an explicit allowlist in `VehicleMain.js` plus a wildcard for any `*.vercel.app` origin (preview deployments). Add new frontend domains there, not to `.env`'s unused `ALLOWED_ORIGINS`.

**Two data models for "vehicles" that are out of sync (important):**
- `Models/vehicleDetails.js` (`vehicleDetails` collection) — the **current/actively developed** model: a vehicle is grouped by `basicInfo`/`techSpecs`/`mediaFiles`, with an array of individually tracked `registrationVehicles` (real number-plated vehicles, each with its own `statusAvailability`, `maintenance`, `driverDetails`). This is what the admin vehicle-management UI (`vehicleDetailsRoutes`), the availability engine (`Utils/vehicleAvailability.js`), and the order date-conflict checker (`Utils/dateConflictChecker.js`) all use.
- `Models/VehicleMainSchema.js` (`Vehicle` collection, `vehicleDetails: { vehicleID, name, amount, image, vehicleCount... }`) — an **older, flatter** shape still used by the customer-facing catalog (`Vehicleroutes`/`VehiclesController`).
- The customer **cart flow** (`controllers/CartController/cart.js`) queries `Models/vehicleDetails` (the new schema) for fields that don't exist on it (`model`, `city`, `basePrice`, `mainImage`) — this lookup will not match current data. Treat the customer cart/checkout path as **stale/likely broken** until it's reconciled with the current vehicle schema; don't assume it works end-to-end without testing it first.
- `Models/orderModel.js` is entirely commented out — the live `Order` model is `Models/AdminorderModel/Adminorder.js`.

## 6. Business Rules

**Order pipeline (admin operations, `Models/AdminorderModel/Adminorder.js`).** An order moves through `pipelineStatus`:
`todo → projectCodeCreation → projectExecution → onRoad → campaignRunning → vehicleUnavailable → clientClosure → invoiceGeneration → paymentStage2 → closedWon | closedLost`.
- `closedLost` is a terminal, one-way stage (`controllers/Adminordercontroller/Adminordercontroller.js`) — an order already `closedLost` cannot transition further.
- `LOCKED_STAGES = ["closedWon", "projectCodeCreation", "closedLost"]` and `LOCKED_BACK_STAGES = ["todo", "projectExecution"]` restrict which stage-to-stage moves are permitted; every transition is appended to `pipelineLogs` for audit.
- A parallel `salesPipelineStatus` (`enquiry → needAnalysis → proposalPriceQuote → negotiationReview → closedWon/closedLost → projectCodeCreation`) tracks the pre-sales side independently of the operational pipeline above.
- Moving an order to `closedLost` from `projectExecution`, `onRoad`, or `clientClosure` releases the vehicle back to availability (`RELEASE_VEHICLE_FROM_STAGES`).

**Vehicle availability & booking conflicts** (`Utils/vehicleAvailability.js`, `Utils/dateConflictChecker.js`): availability for a `vehicleType` is computed as *currently-`Available` registration vehicles* + *`Booked` vehicles whose existing booking ends before the new request starts*. When an order's date range overlaps another order for the same vehicle type, both orders are surfaced with a ranked list (`rank`, ordered by `createdAt`) so staff can see who has priority — the system does not auto-block conflicting bookings, it only flags them for a human decision.

**Discount/offer pricing** (`ReusableComponents/reusableOfferLogic.js`): looked up per `vehicleModel` where an active `VehicleOffer` date range overlaps the requested booking range. Only the **overlapping days** get the discount percentage; the remaining days in the booking are billed at full price — days are prorated, not all-or-nothing.

**OTP auth** (customer + client flows): 6-digit numeric OTP via Nettyfish SMS. `OTP_EXPIRY_MIN = 30` in `controllers/UserController/userController.js` — note the code comment says "OTP valid for 5 minutes" but the actual value is 30; trust the value, not the stale comment. Requesting a new OTP deletes all prior OTPs for that phone number.

**Roadshow quotations / estimates** (`controllers/roadshowQuotation/`, ESM):
- Quotation numbers follow `EST-#####`, sequential starting at `EST-30001`, generated via `Utils/quotationUtils.js` (also backed by a `Counter` model for the alternate incrementing path).
- Lifecycle: `saved → pdf_uploaded → waiting_for_approval → approved` (or `failed`).
- Approval is gated by a shared password compared against `ROADSHOW_QUOTATION_APPROVAL_PASSWORD`, **with an insecure hardcoded fallback if that env var is unset** — always set this env var explicitly in any environment that matters; never rely on the built-in default.
- On reaching `waiting_for_approval`, an email is sent to `ROADSHOW_APPROVAL_MAIL_TO`/`_CC` via an external PHP API (`ROADSHOW_RATECARD_MAIL_API_URL`).

**GST validation:** GSTIN format is validated with a regex (`Utils/gstVerification.js`, `Models/GstDetailsModel/gstdetails.js`) both client-supplied and against an external verification API (`GST_API_KEY`). PAN format is separately regex-validated.

**Driver KYC** (`Models/Driverdetailsmodel/Driverdetailsmodel.js`): `drivingLicenseNo`, `aadharNo`, and `panNumber` are each independently unique-and-sparse — a driver record can be created with any subset of these documents, but whichever ones are supplied must be globally unique.

**Roles:**
- Admin side: `admin` / `staffAdmin` (`Models/MainLoginSchema.js`), plus a separate `Employee` model with `employee`/`admin` roles gated to `@adinn.co.in` email addresses only.
- Customer side: implicit (any registered+verified `User`).
- Client side: `userType: 2` on `ClientUser` (`Models/ClientLoginModel/ClientLoginSchema.js`).

## 7. Environment Setup

1. Install dependencies: `npm install`.
2. Copy/create `.env` in the repo root (gitignored) — **critical caveat:** `VehicleMain.js` currently connects to MongoDB using a **hardcoded connection string in source**, not the `.env` `MONGODB_URI` value, and always points at the **same shared Atlas cluster** regardless of what you put in `.env`. There is currently no way to point this app at a local/throwaway database purely via `.env` — be deliberate about what you write, since it lands in shared data. (Ask before changing this.)
3. Similarly, `PORT` in `.env` is not read — the port is hardcoded to `3001` in `VehicleMain.js`.
4. Populate the remaining env vars actually consumed by the app (names only — see `.env` for the current values, never hardcode secrets in code you write):
   - `JWT_SECRET`, `JWT_EXPIRES_IN`
   - `NETTYFISH_API_KEY`, `NETTYFISH_SENDER_ID`, `NETTYFISH_TEMPLATE_ID` (OTP SMS)
   - `OTP_MODE` (local vs production OTP behavior)
   - `STORAGE_TYPE`, `LOCAL_UPLOAD_PATH`, `LOCAL_BASE_URL`, `PRODUCTION_BASE_URL`, `MAX_IMAGE_SIZE`, `MAX_VIDEO_SIZE`, `MAX_FILE_SIZE`
   - `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_REGION`, `DO_SPACES_ENDPOINT`, `DO_SPACES_BUCKET`, `DO_SPACES_CDN_BASE`/`DO_SPACES_CDN_URL`
   - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME` (raw S3 endpoint only)
   - `GST_API_KEY`
   - `MEON_COMPANY_NAME`, `MEON_SECRET_TOKEN`, `MEON_COMPANY_ID`, `MEON_EMAIL`, `MEON_PASSWORD`
   - `DISABLE_ROADSHOW_SHORT_URL`, `FRONTEND_BASE_URL`, `ROADSHOW_RATECARD_MAIL_API_URL`, `ROADSHOW_APPROVAL_MAIL_TO`, `ROADSHOW_APPROVAL_MAIL_CC`, `ROADSHOW_APPROVAL_MAIL_TEST_ONLY`
   - `ROADSHOW_QUOTATION_APPROVAL_PASSWORD` (**set this explicitly** — see Business Rules)
   - `APP_BASE_URL` (used to build absolute document URLs for FOC mail)
5. Cloudinary credentials for `/upload`/`/save-videos` are **not** environment-driven — they're hardcoded in `VehicleMain.js`. Rotating that key means editing source, not `.env`.

## 8. Commands to Run the Project

```bash
npm install       # install dependencies
npm run dev       # nodemon VehicleMain.js — hot-reload dev server (use this day-to-day)
npm start         # node VehicleMain.js — plain run, no reload
```

There is no build step (plain Node/CommonJS+ESM-interop, no bundler/transpiler) and **no test or lint script** — `npm test` is not configured. Verify changes by running the server and exercising the affected route directly (curl/Postman/frontend), and watch the console for `✅ Roadshow MongoDB Connected Successfully` to confirm the DB connection came up.

## 9. Important APIs

Mount points are declared in `VehicleMain.js`; the router file itself is the source of truth for the exact sub-path.

| Base path | Router file | Controller | Domain |
|---|---|---|---|
| `/auth` | `Routes/Userroutes/authroutes.js` | `UserController` | Customer register/OTP/login |
| `/api/client-auth` | `Routes/ClientAuthRoutes/ClientAuthRoutes.js` | `ClientAuthController` | Client-user OTP auth (`userType: 2`) |
| (root) | `Routes/Adminauthroutes/adminroutes.js` | `Adminauthcontroller` | Admin/staff-admin auth (`/register-admin`, `/admin`, `/staff-admins`, `/me`) |
| `/vehicles` | `Routes/Vehicleroutes/vehicleroutes.js` | `VehiclesController` | Legacy customer-facing vehicle catalog |
| `/api` | `Routes/vehicleDetailsRoutes/vehicleDetails.js` | `VehicleDetailsController` | Current vehicle/registration CRUD, availability check, vehicle ID generation |
| `/api` | `Routes/VehicleTypeRoutes.js` | inline | Vehicle type master (`/vehicle-types`) |
| (root) | `Routes/EntryVehiclesRoutes/entryVehicles.js` | `EntryVehiclesController` | Fleet entry (`/entryVehicles`, `/getVehicles`) |
| (root) | `Routes/VehiclesAvailabilityRoutes/vehiclesavailability.js` | `VehiclesAvailabilityController` | Per-location availability toggling |
| (root) | `Routes/cartRoutes/cart.js` | `CartController` | Customer cart (see Architecture — likely stale) |
| (root) | `Routes/OrderRoutes/orderRoutes.js` | `OrderController` | Customer order creation (legacy path) |
| `/admin` | `Routes/AdminorderRoutes/AdminorderRoutes.js` | `Adminordercontroller` | **Core operations engine**: pipeline stages, on-road execution, driver assignment, extra-km billing, campaign closure, FOC, vamosys GPS proxy |
| `/sales` | `Routes/Salesorderroutes/salesorderRoutes.js` | `Salesordercontroller` | Sales pipeline, stage documents, date-conflict lookup |
| `/api/roadshow-quotations` | `Routes/roadshowQuotation/roadshowQuotationRoute.js` | `roadshowQuotationController` (ESM) | Quotation generation, PDF upload, approval |
| `/packages` | `Routes/PackageManagementRoutes/packagemanagement.js` | `PackageManagementcontroller` | Rate-card packages per vehicle type/model |
| `/vehicleoffers` | `Routes/vehicleOfferRoutes/vehicleOffer.js` | `vehicleOfferController` | Time-boxed discount campaigns |
| `/gstdetails` | `Routes/GstDetailRoutes/gstDetailRoutes.js` | `gstDetailController` | GST master + `/verify` |
| `/promoters` | `Routes/Promoterroutes/Promoterroutes.js` | `Promotercontroller` | Promoter roster |
| `/drivers` | `Routes/DriverdetailsRoutes/Driverdetailsroute.js` | `Driverdetailscontroller` | Driver KYC docs |
| `/api/orders` | `Routes/driverlocationRoutes/driverlocationroutes.js` | `driverlocationcontroller` | Live driver GPS pings per order |
| `/locations` | `Routes/locationRoutes/locationRoutes.js` | `locationController` | State/city master |
| `/client-requests` | `Routes/ClientRequestRoutes/ClientRequestRoutes.js` | `ClientRequestController` | Client-submitted vehicle requests |
| (root) | `Routes/Dashboard/dashboard.js` | `Dashboardcontroller` | Admin dashboard aggregate stats |
| (root) | `Routes/shortUrl.routes.js` | `shortUrl.controller.js` | `/:code` short-link redirect |
| (root, inline) | `VehicleMain.js` | — | `/upload`, `/save-videos`, `/delete-video` (Cloudinary), `/uploadaws` (raw S3), `/api/update-vehicles-json` (DO Spaces JSON overwrite) |

## 10. Database Collections

MongoDB, no formal migrations — schema evolves in place via Mongoose model edits.

| Collection (model) | File | Purpose |
|---|---|---|
| `User` | `Models/User/user.js` | Customer accounts (phone/email, OTP-verified) |
| `AdminUserLogin` (`MainLoginSchema`) | `Models/MainLoginSchema.js` | Admin/staff-admin accounts, bcrypt password |
| `Employee` | `Models/Employeelogin/employeelogin.js` | Employee accounts, `@adinn.co.in`-only, bcrypt secret code |
| `ClientUser` | `Models/ClientLoginModel/ClientLoginSchema.js` | Client-user accounts (`userType: 2`) |
| `OTP` | `Models/otp/otpmodel.js` | Short-lived OTP codes for customer/client auth |
| `Vehicle` | `Models/VehicleMainSchema.js` | Legacy flat vehicle catalog (customer-facing) |
| `vehicleDetails` | `Models/vehicleDetails.js` | **Current** vehicle model: grouped `basicInfo`/`techSpecs`/`mediaFiles` + array of `registrationVehicles` (real plates, status, maintenance, driver) |
| `entryVehicles` | `Models/entryVehicles.js` | Simple fleet entry record (reg number, model, images, speaker/generator) |
| `VehiclesAvailability` | `Models/vehiclesAvailability.js` | Per-vehicle, per-location availability flag |
| `VehicleModel` | `Models/VehicleModel.js` | Vehicle model name master |
| `VehicleModelElection` / `VehicleAvailabilityElection` | `Models/VehicleModelElection.js`, `Models/VehiclesAvailabilityElection.js` | Parallel/alternate model+availability master data (election-style counts) |
| `VehicleType` | `Models/VehicleTypeSchema.js` | Vehicle type master |
| `CampaignType` | `Models/CampaignTypeModel/campaigntype.js` | Campaign type master |
| `Package` | `Models/PackageManagementModel/packagemanagement.js` | Rate-card package per vehicle type + model |
| `VehicleOffer` (`vehicleoffer`) | `Models/VehicleOffer/VehicleOffer.js` | Date-ranged discount offers per vehicle model |
| `Cart` | `Models/Cartmodel/cart.js` | Customer cart, one doc per `userId` |
| `Order` | `Models/AdminorderModel/Adminorder.js` | **The core business object** — booking items, GST, admin pipeline (with on-road/driver/extra-km/closure sub-arrays), sales pipeline, all audit logs |
| `Promoter` | `Models/Promotermodel/Promotermodel.js` | Promoter roster (language, gender, charge/day) |
| `Driverdetails` | `Models/Driverdetailsmodel/Driverdetailsmodel.js` | Driver KYC (Aadhar, PAN, DL — each unique+sparse) |
| `GstDetail` | `Models/GstDetailsModel/gstdetails.js` | GST-registered business master with PAN/GSTIN regex validation |
| `ClientRequestOrder` | `Models/ClientRequestModel/Clientrequestmodel.js` | Client-submitted vehicle requests (`status: 0/1/2`) |
| `Location` | `Models/Location/location.js` | Schemaless (`strict: false`) state→cities map |
| `RoadshowQuotation` | `Models/RoadshowQuotationModel.js` | Full quotation/estimate document (pricing, client, PDF, approval) — ESM model |
| `Counter` | `Models/CounterModel.js` | Sequence counter, used by alternate quotation-numbering path — ESM model |
| `ShortUrl` | `Models/ShortUrlModel.js` | Short-code → long URL map, click tracking |
| `emailenquiry` | `Models/Enquiry/enquirymodel.js` | Vehicle rental enquiry via email form |
| `contactenquiry` | `Models/contactEnquiryModel/contactEnquiryModel.js` | General contact-us form |
| `ProductEnquiry` | `Models/Productenquiry/enquiry.js` | Phone-number-only quick enquiry |

## 11. Development Guidelines

- **Ask before editing** (see Strict Commands) — this is the standing rule for this repo, not a one-time preference.
- Grep for a model/controller/route by name before assuming its path — the folder layout is not fully consistent (see Coding Standards).
- When touching `Order`/`Adminordercontroller.js`, read the relevant pipeline-stage guard clauses first (`LOCKED_STAGES`, `LOCKED_BACK_STAGES`, `RELEASE_VEHICLE_FROM_STAGES`) — this file is large and stage transitions have specific, non-obvious guard conditions.
- When touching anything under `controllers/roadshowQuotation/`, `Utils/quotationUtils.js`, or `config/digitalOceanSpaces.js`, stay in ESM syntax to match the rest of that feature.
- When adding a vehicle-facing feature, confirm whether it should read from `Models/vehicleDetails.js` (current, registration-based) or `Models/VehicleMainSchema.js` (legacy, customer catalog) — don't assume they're interchangeable or in sync.
- New endpoints should follow the existing `Routes/<Feature>/` + `controllers/<Feature>/` + `Models/<Feature>/` split, and reuse the `{ success, message, data }` / `{ success, message, error }` response shape already dominant in the codebase.
- Any new mutable field on `Order` intended to be audited should follow the existing `*History`/`*Array`/`*Logs` sub-document pattern rather than being silently overwritten.

## 12. Do's and Don'ts

**Do:**
- Confirm with the user before modifying any file (standing rule).
- Match the module system (CJS vs ESM) and response shape already used in the file you're editing.
- Verify a route's real path by reading the router file, not by guessing from `VehicleMain.js`'s `app.use()` prefix.
- Treat `ROADSHOW_QUOTATION_APPROVAL_PASSWORD` and all other secrets as values to be set via env var, never as literals to copy into new code.
- Test any change to cart/order/vehicle flows against the *current* `vehicleDetails` schema, since the customer cart path is known to reference stale fields.

**Don't:**
- Don't run destructive Mongo operations against this database without explicit confirmation — there's no isolated dev database.
- Don't assume `.env`'s `MONGODB_URI` or `PORT` do anything — both are currently overridden by hardcoded values in `VehicleMain.js`.
- Don't add a fourth file-storage backend or a third DO Spaces client config — consolidate into the existing ones if you're touching upload logic.
- Don't "clean up" the two auth middlewares into one without discussing it first — customer and admin/client tokens are intentionally on separate secrets/flows in the current design (as far as can be told from the code; confirm intent before merging).
- Don't introduce a test framework, linter, or build step unless asked — none currently exists and it's a repo-wide decision, not a drive-by addition.
- Don't rely on code comments over actual values when they conflict (e.g. the OTP-expiry comment) — read the literal value being used.

## 13. Future Contributors Guidelines

- This codebase has visibly passed through multiple contributors/eras (mixed casing conventions, commented-out schema versions kept in file history, duplicate upload middleware, two vehicle models). When extending a feature, prefer matching its existing local convention over unifying it with the rest of the app — a repo-wide consistency pass is a separate, explicitly-scoped task, not a side effect of a feature change.
- Before deleting anything that looks unused (`LoginMain.js`, `UserAdminLogin.js`, `VehicleModelElection`/`VehiclesAvailabilityElection`, the commented-out `orderModel.js`), confirm it's actually dead — some "legacy-looking" files or duplicate models may still be read by a frontend or reporting query elsewhere.
- If you find a stale/broken flow (like the cart's field mismatch), flag it and ask rather than silently "fixing" business logic you don't have full context on — this is an actively used production system.
- Keep this file up to date when you learn something a fresh Claude session would otherwise have to rediscover by reading the whole codebase again — especially anything that looks fine on the surface but silently misbehaves (env vars that aren't wired up, schema drift, casing gotchas).
## What this is

Express/MongoDB backend for "Roadshow" — a vehicle (LED van / promotional vehicle) rental and campaign management platform. It covers the full lifecycle: vehicle fleet registration → customer ordering/quotations → admin operations pipeline (project code, on-road execution, driver assignment) → sales pipeline (enquiry → negotiation → closed won/lost) → invoicing.

## Commands

```bash
npm start   # node VehicleMain.js  (production)
npm run dev # nodemon VehicleMain.js (auto-restart on change)
```

There is no test suite, lint config, or build step in this repo.

## Entry point and dead files

- **`VehicleMain.js`** is the real, single entry point (per `package.json`'s `start` script). It wires up CORS, MongoDB, all routers, and several inline upload/S3 endpoints directly in this file (not moved to routes/controllers).
- **`LoginMain.js`** and **`UserAdminLogin.js`** exist at the repo root but are **not required anywhere** in `VehicleMain.js` — they're legacy/orphaned files (largely commented-out code). Don't assume they run; check `VehicleMain.js`'s `require()` list before assuming a file is live.
- Route/controller/model files with heavy commented-out blocks (e.g. `Models/orderModel.js`, which is 100% commented out) are superseded by newer counterparts — e.g. `Models/AdminorderModel/Adminorder.js` is the actual live Order model.

## Architecture

**Pattern:** `Routes/*` (thin, just wires HTTP verbs to controller functions) → `controllers/*` (business logic, `exports.fnName = async (req,res) => {...}`) → `Models/*` (Mongoose schemas). Utility logic that's reused across controllers lives in `Utils/` and `ReusableComponents/`.

Naming is inconsistent (mixed casing, folder names don't always match file names, e.g. `Routes/Adminauthroutes/adminroutes.js`, `Routes/Employeeauthroutes/employeeauthroutes.js`) — when looking for a route's implementation, grep for the route path string in `VehicleMain.js` first to find which router file owns it, then trace into its `controllers/` counterpart.

### Module system inconsistency (important)

Almost the entire codebase is **CommonJS** (`require`/`module.exports`). The **Roadshow Quotation** feature is the one exception — it's written in **ESM** (`import`/`export`, `.js` extensions in imports):
- `controllers/roadshowQuotation/roadshowQuotationController.js`
- `Utils/quotationUtils.js`
- `config/digitalOceanSpaces.js`

These are `require()`-d from CJS route files despite there being no `"type": "module"` anywhere in `package.json`. If you touch this feature, match the existing ESM style in those specific files; don't convert the surrounding CJS files to match.

### Two DigitalOcean Spaces (S3-compatible) client configs

- `config/spaces.js` and `Middleware/spaceUpload.js` (CJS) — used by most of the app, including the ad-hoc upload endpoints in `VehicleMain.js`.
- `config/digitalOceanSpaces.js` (ESM) — used only by the Roadshow Quotation feature; throws at import time if `DO_SPACES_KEY`/`SECRET`/`BUCKET` env vars are missing.

`STORAGE_TYPE` env var (`"local"` vs `"space"`) toggles whether uploads/statics are served from local disk (`public/uploads`) or DigitalOcean Spaces — see `Middleware/spaceUpload.js`'s `getFileUrl`/storage selection logic.

### Vehicle fleet model

`Models/vehicleDetails.js` groups vehicles by `basicInfo.vehicleType`/model, with an embedded array `registrationVehicles[]` — each entry is one physical vehicle (unique `registrationNumber`) carrying its own `statusAvailability` (current status, booked date range, linked `orderId`), driver details, and maintenance dates. Availability logic (`Utils/vehicleAvailability.js`) counts vehicles that are `"Available"` now or `"Booked"` but freeing before the requested `fromDate`.

### Order model is the central aggregate

`Models/AdminorderModel/Adminorder.js` is a large, single-document-per-order schema (this is the live model; `Models/orderModel.js` is dead/commented out). One order holds:
- `bookingItems[]` — the line items being rented (vehicle type/model, dates, pricing breakdown, promoter add-ons).
- **Two parallel pipelines** on the same order: `pipelineStatus` (admin/ops pipeline: `todo → projectCodeCreation → projectExecution → onRoad → campaignRunning → ... → closedWon/closedLost`) and `salesPipelineStatus` (sales pipeline: `enquiry → needAnalysis → proposalPriceQuote → negotiationReview → closedWon/closedLost`), each with its own log array (`pipelineLogs`, `salesPipelineLogs`) recording stage transitions.
- `onRoadExecutionArray[]` — driver/vehicle assignments per `bookingItems` index (linked by `vehicleIndex`), with its own history/issue/unavailability sub-arrays (`onRoadHistory`, `onRoadIssues`, `onRoadUnavailableHistory`, `onRoadDriverHistory`).
- Many parallel `*Array`/`*History` sub-documents for stage-specific comments/document uploads (`projectExecutionArray`, `todoArray`, `clientClosureCommentsArray`, `closedWonCommentsArray`, `campaignClosureArray`, etc.) — each following the same `{ document, notes, uploadedBy, uploadedAt }` shape. When adding a new stage artifact, follow this existing shape rather than inventing a new one.

Date-conflict detection across orders for the same vehicle type (`Utils/dateConflictChecker.js`) queries `Order.find` for overlapping `bookingItems` date ranges directly — there's no separate booking/reservation table, so any change to booking date semantics must be reflected here too.

### Auth

Two independent JWT-based auth systems, not shared:
- **Customer auth**: `Middleware/authmiddleware.js` (`protect`) — verifies JWT against `Models/User/user.js`, secret falls back to a hardcoded default if `JWT_SECRET` env var is unset.
- **Admin/employee auth**: `Middleware/rolemiddleware.js` (`protect`, `authorizeRoles`, `isAdmin`, `verifyAdminExists`) — verifies JWT against `Models/MainLoginSchema.js` (`AdminUserLogin`, roles `admin`/`staffAdmin`), no hardcoded secret fallback (requires `JWT_SECRET`).

### File uploads

Multiple, overlapping multer configs exist for different purposes — check which one a route actually uses before adding new upload fields:
- `Middleware/vehicleDetailsUpload.js` — vehicle onboarding images/video, storage backend switches on `STORAGE_TYPE`.
- `Middleware/orderImageupload.js` — order-related document uploads.
- Cloudinary storage configured inline in `VehicleMain.js` (`/upload`, `/save-videos`, `/delete-video` endpoints) — a third, independent image pipeline used for ad-hoc vehicle image/video uploads, unrelated to the Spaces-based ones above.

### Offers/pricing

`ReusableComponents/reusableOfferLogic.js` computes per-booking pricing: total days × quantity × `pricePerDay`, then looks up `Models/VehicleOffer/VehicleOffer.js` for a date-overlapping discount on that vehicle model and splits the total into discounted/non-discounted day buckets.

### GST verification

`Utils/gstVerification.js` validates GSTIN format locally via regex, then calls the Masters India GST API (`GST_API_KEY` env var) for business details.

## Environment

Config is via `.env` (gitignored, not committed). Relevant vars seen in code: `JWT_SECRET`, `STORAGE_TYPE`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `DO_SPACES_CDN_BASE`/`DO_SPACES_CDN_URL`, `LOCAL_UPLOAD_PATH`, `LOCAL_BASE_URL`, `PRODUCTION_BASE_URL`, `MAX_FILE_SIZE`/`MAX_IMAGE_SIZE`/`MAX_VIDEO_SIZE`, `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_BUCKET_NAME`, `GST_API_KEY`. The MongoDB connection string in `VehicleMain.js` is currently hardcoded (not read from env) — be aware of this if changing databases.

The server listens on a hardcoded port (`PORT = 3001` in `VehicleMain.js`), not read from env.
