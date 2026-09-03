/**
 * Daily deduplication helpers for enquiry / newsletter submissions.
 *
 * Business rule: one person (identified by phone number OR email address)
 * may only submit ONE enquiry per calendar day (Asia/Kolkata). If either the
 * phone number or the email already has an entry created today, the submission
 * is rejected with a 409 and a professionally worded message.
 */

/**
 * Compute the start/end of today in Asia/Kolkata timezone and return them as
 * Date objects. This is used to scope the "created today" query correctly for
 * the business's local day boundary.
 */
function getTodayRangeIST() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Kolkata",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    ).formatToParts(
      new Date()
    );


  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
            "literal"
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    );


  const dateKey =
    `${values.year}-${values.month}-${values.day}`;


  const start =
    new Date(
      `${dateKey}T00:00:00+05:30`
    );


  const end =
    new Date(
      start.getTime() +
      24 * 60 * 60 * 1000
    );


  return {
    start,
    end,
  };
}

/**
 * Normalise a phone number so lookups are consistent regardless of a leading
 * country code. Returns the last 10 digits string, or the input trimmed if it
 * is shorter than 10 digits.
 */
function normalizePhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Normalise an email for comparison (lowercase + trim).
 */
function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

/**
 * Build the $or clause used to detect whether either phone or email (or both)
 * already submitted today against the given model.
 *
 * @param {object} opts
 * @param {string} opts.phone             phone number value (raw)
 * @param {string} [opts.email]           email value (raw)
 * @param {string} [opts.phoneField]      field name storing the phone (default "userContactNumber")
 * @param {string} [opts.emailField]      field name storing the email (default "userEnquiryEmail")
 */
function buildContactOrClause({
  phone,
  email,
  phoneField = "userContactNumber",
  emailField = "userEnquiryEmail",
}) {
  const clauses = [];

  const phoneNorm = normalizePhone(phone);
  if (phoneNorm) {
    clauses.push({ [phoneField]: phoneNorm });
  }

  const emailNorm = normalizeEmail(email);
  if (emailNorm) {
    clauses.push({
      [emailField]: { $regex: new RegExp(`^${emailNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
  }

  return clauses;
}

/**
 * Check whether an existing enquiry already exists today for the given phone
 * and/or email, using the supplied Mongoose model. Returns the matched
 * document (or null).
 */
async function findExistingToday(Model, { phone, email, phoneField, emailField }) {
  const clauses = buildContactOrClause({ phone, email, phoneField, emailField });

  if (clauses.length === 0) {
    return null;
  }

  const { start, end } = getTodayRangeIST();

  return Model.findOne({
    $and: [{ createdAt: { $gte: start, $lt: end } }, { $or: clauses }],
  });
}

const ALREADY_ENQUIRED_MESSAGE =
  "You have already submitted an enquiry today. Please try again tomorrow.";

module.exports = {
  getTodayRangeIST,
  normalizePhone,
  normalizeEmail,
  buildContactOrClause,
  findExistingToday,
  ALREADY_ENQUIRED_MESSAGE,
};
