# Architecture

> Stable structural facts. Changes rarely. For live task state see [context.md](context.md).

---

## 1. Shape

Single Express 5 + Mongoose 8 JSON REST API. No frontend, no template engine, no SSR, no GraphQL, no queue, no cache layer, no build step.

```
Routes/<Feature>/*.js        → thin, wires HTTP verbs to controller fns
controllers/<Feature>/*.js   → business logic + Mongoose calls
Models/<Feature>/*.js        → schemas (some in subfolders, some bare at Models/ root)
Middleware/                  → auth, role, multer upload configs
Utils/                       → stateless helpers
ReusableComponents/          → shared business logic (offer/discount calc)
config/                      → DO Spaces S3 clients (two overlapping versions)
```

**Folder names are not consistently cased or pluralized** (`Adminauthroutes` vs `AdminorderRoutes` vs `cartRoutes`). Always grep for the exact path — never guess it from the feature name.

---

## 2. Entry point

**`VehicleMain.js` is the only file that boots the app.** CORS, body parsing, static serving, the Mongo connection, and every router mount live here.

It also defines several **inline endpoints** directly in the file, not via a Routes/controller pair:

- `/upload`, `/save-videos`, `/delete-video` → Cloudinary (credentials **hardcoded in source**)
- `/uploadaws` → raw AWS S3
- `/api/update-vehicles-json` → DO Spaces JSON overwrite

Hardcoded, **not** read from `.env`:
- MongoDB connection string (always the shared production Atlas cluster)
- `PORT = 3001`
- Cloudinary credentials

CORS is an explicit allowlist in `VehicleMain.js` plus a wildcard for `*.vercel.app`. Add new frontend domains **there**, not to `.env`'s unused `ALLOWED_ORIGINS`.

### Route mounting is inconsistent

Some routers are mounted with a prefix (`app.use("/vehicles", vehicleRoutes)`); others at root with the full path declared internally (`app.use(cartRoutes)` where the router itself declares `/addToCart`).

**Always read the router file to know the real path.**

---

## 3. Dead / legacy files — do not assume they run

| File | State |
|---|---|
| `LoginMain.js` | Not required anywhere. Legacy standalone employee auth. |
| `UserAdminLogin.js` | Entirely commented out. Not wired in. |
| `Models/orderModel.js` | 100% commented out. Superseded by `Models/AdminorderModel/Adminorder.js`. |

Check `VehicleMain.js`'s `require()` list before assuming a file is live. Before deleting anything that *looks* unused (`VehicleModelElection`, `VehiclesAvailabilityElection`), confirm no frontend or reporting query still reads it.

---

## 4. Module system — mixed CJS / ESM

Almost everything is **CommonJS**. The **roadshow-quotation feature is ESM**, despite no `"type": "module"` in `package.json`:

- `controllers/roadshowQuotation/roadshowQuotationController.js`
- `Utils/quotationUtils.js`
- `Models/RoadshowQuotationModel.js`
- `Models/CounterModel.js`
- `config/digitalOceanSpaces.js`

Works only via Node's `require(esm)` interop — reparses at runtime and prints a perf warning on boot. Needs a reasonably modern Node (developed against v24).

**Never mix `require` and `import` in one file.** Match whatever the file already uses.

---

## 5. Two vehicle models, out of sync

| Model | Collection | Status |
|---|---|---|
| `Models/vehicleDetails.js` | `vehicleDetails` | **Current.** Grouped `basicInfo` / `techSpecs` / `mediaFiles` + `registrationVehicles[]` — each entry is one physical plated vehicle with its own `statusAvailability`, `maintenance`, `driverDetails`. |
| `Models/VehicleMainSchema.js` | `Vehicle` | **Legacy**, flat shape. Still serves the customer-facing catalog (`Vehicleroutes` / `VehiclesController`). |

Used by the current model: `vehicleDetailsRoutes`, `Utils/vehicleAvailability.js`, `Utils/dateConflictChecker.js`.

⚠ The customer cart (`controllers/CartController/cart.js`) queries the **new** schema for **old** fields (`model`, `city`, `basePrice`, `mainImage`) — see known issue #2 in [context.md](context.md).

---

## 6. The Order aggregate

`Models/AdminorderModel/Adminorder.js` — one large document per order. This is the central business object.

- `bookingItems[]` — line items (vehicle type/model, dates, pricing breakdown, promoter add-ons)
- `pipelineStatus` + `pipelineLogs` — ops pipeline
- `salesPipelineStatus` + `salesPipelineLogs` — sales pipeline
- `onRoadExecutionArray[]` — driver/vehicle assignment per booking item (linked by `vehicleIndex`), with `onRoadHistory`, `onRoadIssues`, `onRoadUnavailableHistory`, `onRoadDriverHistory`
- `invoiceData` + `invoiceHistory[]` — invoice generation (line ~576-678)
- Stage artifact arrays — `projectExecutionArray`, `todoArray`, `clientClosureCommentsArray`, `closedWonCommentsArray`, `campaignClosureArray`, `focHistory` — all sharing `{ document, notes, uploadedBy, uploadedAt }`

---

## 7. File storage — four live backends, chosen per code path

1. **Local disk** — `multer.diskStorage`; the inline uploader in `VehicleMain.js`, and the fallback in `Middleware/vehicleDetailsUpload.js` / `Middleware/spaceUpload.js` when `STORAGE_TYPE !== "space"`
2. **Cloudinary** — `/upload`, `/save-videos`, `/delete-video`; credentials hardcoded
3. **DigitalOcean Spaces** — `Middleware/spaceUpload.js`, `Middleware/vehicleDetailsUpload.js`, `config/spaces.js`, `config/digitalOceanSpaces.js`; gated by `STORAGE_TYPE=space`
4. **Raw AWS S3** — the standalone `/uploadaws` endpoint, separate `AWS_*` env vars

**Duplication to watch:** `Middleware/spaceUpload.js` and `Middleware/vehicleDetailsUpload.js` are near-duplicates — a fix to vehicle image/video upload usually needs applying to **both**. `config/spaces.js` (CJS) and `config/digitalOceanSpaces.js` (ESM) are two separate DO Spaces clients used by different features.

Do **not** add a fifth backend or a third Spaces config.

---

## 8. Conventions

- **Response shape:** `{ success, message, data }` / `{ success: false, message, error }`. `Utils/response.js` exports helpers, but usage is inconsistent — match the surrounding controller.
- **Error handling:** per-handler `try/catch`. No centralized error middleware. `ValidationError` and `error.code === 11000` are the two shapes explicitly handled.
- **Validation:** manual checks inside controllers + Mongoose schema `required`/`match`/`validate`. No Joi/Zod/express-validator.
- **Timestamps:** `{ timestamps: true }` on virtually every schema — keep it on new ones.
- **Formatting:** indentation, quoting, semicolons vary file to file. Match the local file; do not reformat wholesale.

---

## 9. Known casing bugs

`VehicleMain.js` has `require()` calls that don't match on-disk casing:

- `require("./routes/shortUrl.routes.js")` → actual `Routes/`
- `require("./Routes/vehicleTypeRoutes")` → actual `Routes/VehicleTypeRoutes.js`

Silently fine on Windows. **Breaks on a case-sensitive Linux deploy.** Fix if you touch these lines.

---

## 10. Commands

```bash
npm install
npm run dev   # nodemon VehicleMain.js — use day to day
npm start     # node VehicleMain.js
```

No test script, no lint script, no build step. Verify by running the server and exercising the route (curl/Postman/frontend), and watch for `✅ Roadshow MongoDB Connected Successfully` on boot.
