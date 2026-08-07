# TODO

> Open work only. Completed items move to [progress.md](progress.md) and are removed from here by `/bye`.

---

## In progress

_(nothing claimed yet for this session)_

---

## Next up

- [ ] **Decide the next feature task** — role permission continuation, invoice generation follow-up, or something new. Not yet chosen.

---

## Technical debt / cleanup

Ordered roughly by risk. None of these are started.

- [ ] **Fix case-sensitive `require()` paths in `VehicleMain.js`** — `./routes/shortUrl.routes.js` and `./Routes/vehicleTypeRoutes`. Will break a Linux deploy. Low effort, real risk.
- [ ] **Reconcile the customer cart flow** — `controllers/CartController/cart.js` reads `model`, `city`, `basePrice`, `mainImage` off `Models/vehicleDetails.js`, which has none of them. Flag before "fixing": this is live business logic and needs product context.
- [ ] **Move Cloudinary credentials out of `VehicleMain.js`** into `.env`. Requires a key rotation plan.
- [ ] **Remove the hardcoded fallback for `ROADSHOW_QUOTATION_APPROVAL_PASSWORD`** and fail loudly if the env var is unset.
- [ ] **Update `CLAUDE.md` §9 / §10 tables** — missing entries:
  - `Models/RolePermissionModel.js` + `Routes/RolePermissionRoutes` + `controllers/RolePermissionController`
  - `Models/ProjectSettingModel/` + `Routes/ProjectSettingRoutes` + `controllers/ProjectSettingController`
  - `Routes/CityRoutes`, `Routes/VehicleModelRoutes`, `Routes/Employeeauthroutes`, `Routes/EnquiryRoutes`, `Routes/ContactEnquiryRoute`, `Routes/Productenquiry`
  - `Routes/VehicleModelElectionRoutes`, `Routes/VehiclesAvailabilityElectionRoutes`
- [ ] **Deduplicate `CLAUDE.md`** — the file is 37 KB and holds two merged copies of the same architecture doc (formal §1–§13, then a second informal doc starting at "## What this is"). Loads into context every session.
- [ ] **Deduplicate the two upload middlewares** — `Middleware/spaceUpload.js` and `Middleware/vehicleDetailsUpload.js` are near-identical; fixes currently need applying twice.
- [ ] **Confirm dead files are actually dead** before removing: `LoginMain.js`, `UserAdminLogin.js`, `Models/orderModel.js`, `VehicleModelElection`, `VehiclesAvailabilityElection`. A frontend or reporting query may still read them.

---

## Housekeeping

- [ ] **Tidy `.claude/commands/hi.md`** — steps 5 and 8 request the same summary twice; lines 34–35 repeat "Keep the startup summary concise."

---

## Blocked / needs a decision

- [ ] **No dev or staging database exists.** Every run writes to the shared production Atlas cluster (URI hardcoded in `VehicleMain.js`, `.env`'s `MONGODB_URI` ignored). Needs an owner decision before any risky data work.
