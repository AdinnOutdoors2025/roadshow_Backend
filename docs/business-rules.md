# Business Rules

> Domain rules that are **not** obvious from reading the code. Read before touching orders, pricing, availability, or auth.

---

## 1. Order pipelines — two, running in parallel on one document

A single `Order` (`Models/AdminorderModel/Adminorder.js`) carries **both** pipelines simultaneously.

**Admin / operations pipeline** — `pipelineStatus`:

```
todo → projectCodeCreation → projectExecution → onRoad → campaignRunning
     → vehicleUnavailable → clientClosure → invoiceGeneration → paymentStage2
     → closedWon | closedLost
```

**Sales pipeline** — `salesPipelineStatus`:

```
enquiry → needAnalysis → proposalPriceQuote → negotiationReview
        → closedWon | closedLost → projectCodeCreation
```

Each has its own audit log: `pipelineLogs` and `salesPipelineLogs`. **Every** transition must be appended — never mutate the status alone.

### Transition guards (`controllers/Adminordercontroller/Adminordercontroller.js`)

| Guard | Meaning |
|---|---|
| `LOCKED_STAGES = ["closedWon", "projectCodeCreation", "closedLost"]` | Cannot be moved out of freely |
| `LOCKED_BACK_STAGES = ["todo", "projectExecution"]` | Cannot be moved backwards into |
| `RELEASE_VEHICLE_FROM_STAGES` | Moving to `closedLost` from `projectExecution`, `onRoad`, or `clientClosure` **releases the vehicle back to availability** |

`closedLost` is **terminal and one-way** — an order already at `closedLost` cannot transition further.

---

## 2. Vehicle availability & booking conflicts

`Utils/vehicleAvailability.js`, `Utils/dateConflictChecker.js`

Availability for a `vehicleType` = *currently-`Available` registration vehicles* **+** *`Booked` vehicles whose existing booking ends before the new request starts*.

**The system does not auto-block conflicting bookings.** When two orders overlap on the same vehicle type, both are surfaced with a `rank` (ordered by `createdAt`) so a human decides priority.

There is **no separate booking/reservation table** — conflict detection queries `Order.find` against `bookingItems` date ranges directly. Any change to booking date semantics must be mirrored in `dateConflictChecker.js`.

---

## 3. Discount / offer pricing — prorated, not all-or-nothing

`ReusableComponents/reusableOfferLogic.js`

Base = `totalDays × quantity × pricePerDay`. An active `VehicleOffer` is looked up per `vehicleModel` where its date range overlaps the requested booking range.

**Only the overlapping days receive the discount percentage. The remaining days are billed at full price.**

---

## 4. Invoice generation

Lives on the **admin/ops** side only (removed from sales in commit `6ccb134`).

- `Order.invoiceData` — `{ invoiceNumber, invoiceDate, lineItems[] }`
- `Order.invoiceHistory[]` — every edit recorded as `changes[]` plus `lineItemChanges[].fieldChanges[]`

Invoice values are **never silently overwritten** — always append to `invoiceHistory`.

---

## 5. Roles & permissions

**Admin side** (`Models/MainLoginSchema.js`, collection `AdminUserLogin`): `admin` / `staffAdmin`.

**Menu-level permissions** (`Models/RolePermissionModel.js`) are data-driven:

```js
{ role: 'sales' | 'operation',   // unique
  allowedMenus: [String] }
```

Menus can be changed without a deploy — edit the document, not the code.

**Employee side** (`Models/Employeelogin/`): roles `employee` / `admin`, restricted to `@adinn.co.in` email addresses only.

**Client side** (`Models/ClientLoginModel/`): `userType: 2`.

**Customer side**: implicit — any registered + OTP-verified `User`.

---

## 6. Auth — two independent, non-interchangeable systems

| System | Middleware | Backing model | Used by |
|---|---|---|---|
| Customer | `Middleware/authmiddleware.js` | `Models/User/user.js` | `/auth/*` |
| Admin / staff / client | `Middleware/rolemiddleware.js` | `Models/MainLoginSchema.js` | admin routes, `/api/client-auth/*` via `authorizeUserType(2)` |

**A JWT issued by one flow is rejected by the other.** The customer middleware falls back to a hardcoded secret if `JWT_SECRET` is unset; the admin one does not.

---

## 7. OTP auth

6-digit numeric OTP via the Nettyfish SMS gateway.

`OTP_EXPIRY_MIN = 30` in `controllers/UserController/userController.js` — **the code comment says "5 minutes" and is wrong.** Trust the value, not the comment.

Requesting a new OTP **deletes all prior OTPs** for that phone number.

---

## 8. Roadshow quotations / estimates

`controllers/roadshowQuotation/` — **this feature is ESM**, unlike the rest of the repo.

- Quotation numbers: `EST-#####`, sequential, starting at `EST-30001` (`Utils/quotationUtils.js`, backed by the `Counter` model on the alternate path).
- Lifecycle: `saved → pdf_uploaded → waiting_for_approval → approved` (or `failed`).
- Approval is gated by a shared password compared against `ROADSHOW_QUOTATION_APPROVAL_PASSWORD` — **there is an insecure hardcoded fallback if that env var is unset. Always set it explicitly.**
- On reaching `waiting_for_approval`, mail goes to `ROADSHOW_APPROVAL_MAIL_TO` / `_CC` via an external PHP API (`ROADSHOW_RATECARD_MAIL_API_URL`).

---

## 9. GST & PAN validation

`Utils/gstVerification.js`, `Models/GstDetailsModel/gstdetails.js`

GSTIN is regex-validated locally **and** verified against the Masters India external API (`GST_API_KEY`). PAN format is validated by a separate regex.

---

## 10. Driver KYC

`Models/Driverdetailsmodel/Driverdetailsmodel.js`

`drivingLicenseNo`, `aadharNo`, and `panNumber` are each **independently unique + sparse** — a driver can be created with any subset of these documents, but whichever ones are supplied must be globally unique.

---

## 11. Audit-trail convention (applies everywhere)

Any new mutable field on `Order` that matters must follow the existing sub-document pattern rather than being overwritten:

- Naming: `*History`, `*Array`, or `*Logs` (e.g. `onRoadHistory`, `pipelineLogs`, `focHistory`, `invoiceHistory`)
- Shape: `{ document, notes, uploadedBy, uploadedAt }` for stage artifacts

---

## 12. Numeric enum meanings (inconsistently modelled — check before assuming)

| Field | Values |
|---|---|
| `customerType` | `0` = individual, `1` = organization |
| `userType` | `2` = client user |
| `ClientRequestOrder.status` | `0` = todo, `1` = in progress, `2` = completed |
| `role` (admin) | string enum: `'admin'`, `'staffAdmin'` |
| `role` (permissions) | string enum: `'sales'`, `'operation'` |
