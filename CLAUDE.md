# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
