/* -------------------------------------------------------------------------- */
/*                     AUTH GUARDS FOR THE CLIENT REQUESTS API                */
/* -------------------------------------------------------------------------- */
/*  Every route in this folder used to be wide open. A client request holds     */
/*  the customer's name, email, phone, GSTIN, PAN, company, every campaign      */
/*  they booked and the full price breakdown — so an unauthenticated            */
/*  GET client-requests/:id handed all of that to anyone with the id, and       */
/*  GET client-requests handed over EVERY customer's, all at once.              */
/*                                                                            */
/*  Two audiences reach these routes, holding two different tokens signed       */
/*  with the same secret:                                                       */
/*                                                                            */
/*    • customers  — OTP sign-in on the public site, token issued for a         */
/*                   ClientUser (Models/ClientLoginModel)                       */
/*    • staff      — admin panel sign-in, token issued for an AdminUser         */
/*                   (Models/MainLoginSchema), already validated by             */
/*                   Middleware/rolemiddleware's protect                        */
/*                                                                            */
/*  The existing Middleware/authmiddleware protect cannot be reused for         */
/*  customers: it resolves the token against the User model, and a customer     */
/*  token carries a ClientUser id, so it rejects every genuine customer.        */

const jwt = require("jsonwebtoken");

const ClientUser = require("../../Models/ClientLoginModel/ClientLoginSchema");
const { protect: protectStaff } = require("../../Middleware/rolemiddleware");

const JWT_SECRET = process.env.JWT_SECRET;

const readBearerToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;

  if (!header || !String(header).startsWith("Bearer ")) return null;

  return String(header).split(" ")[1] || null;
};

/**
 * The signed-in customer behind this request, or null.
 *
 * Never throws and never responds — callers decide what an absent customer
 * means, which is what lets allowClientOrStaff fall through to the staff
 * guard instead of rejecting an admin outright.
 *
 * The account's live `status` is re-read on every request rather than
 * trusted from the token, so deactivating a customer takes effect at once
 * instead of whenever their 7-day token happens to expire.
 */
const resolveClient = async (req) => {
  const token = readBearerToken(req);

  if (!token) return null;

  let decoded;

  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }

  if (!decoded || !decoded.id) return null;

  const client = await ClientUser.findById(decoded.id).catch(() => null);

  if (!client) return null;
  if (client.status && client.status !== "active") return null;

  return client;
};

/** Customer-only. Sets req.clientUser. */
const protectClient = async (req, res, next) => {
  try {
    const client = await resolveClient(req);

    if (!client) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to continue.",
      });
    }

    req.clientUser = client;

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

/**
 * Either audience.
 *
 * A customer is admitted with req.clientUser set, which the controller uses
 * to narrow the response to their own records. Anything else is handed to
 * the staff guard, so an admin token still works and a bad token still gets
 * that guard's existing 401 rather than a second, differently-worded one.
 */
const allowClientOrStaff = async (req, res, next) => {
  try {
    const client = await resolveClient(req);

    if (client) {
      req.clientUser = client;

      return next();
    }

    return protectStaff(req, res, next);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

module.exports = {
  protectClient,
  protectStaff,
  allowClientOrStaff,
};
