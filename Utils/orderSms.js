// Utils/orderSms.js
/* -------------------------------------------------------------------------- */
/*                       ORDER-CREATED SMS NOTIFICATIONS                      */
/* -------------------------------------------------------------------------- */
/*  Builds the two DLT-approved order messages and sends them via the shared   */
/*  Utils/nettyfishSms.js utility — one call site for every place an order    */
/*  gets created (admin-created, or the mirrored order behind a client        */
/*  campaign request). Deliberately fires once, at order-creation time only:  */
/*  it is NOT called again for Agency PO upload/replace/remove, booking       */
/*  summary PDF generation, or campaign-mail retries — see the call sites in  */
/*  Adminordercontroller.js and ClientRequestController.js.                    */

require("dotenv").config();
const { sendNettyfishSms } = require("./nettyfishSms");

const ORDER_ADMIN_TEMPLATE_ID = process.env.NETTYFISH_ORDER_ADMIN_TEMPLATE_ID || "";
const ORDER_USER_TEMPLATE_ID = process.env.NETTYFISH_ORDER_USER_TEMPLATE_ID || "";

const parseAdminSmsNumbers = () =>
  String(process.env.ADMIN_SMS_NUMBERS || "")
    .split(",")
    .map((number) => number.trim())
    .filter(Boolean);

/* Must match the approved DLT content verbatim except for the order id:
   "Adinn Outdoors - New order received! Order ID: {#alphanumeric#}. Please
   review the order details and take action in the admin panel." */
const buildAdminOrderMessage = (orderId) =>
  `Adinn Outdoors - New order received! Order ID: ${orderId}. Please review the order details and take action in the admin panel.`;

/* Must match the approved DLT content verbatim: "Thank you for your order
   with Adinn Outdoors! We've received it successfully. Your order ID is
   US{#var#}." — the {#var#} placeholder is filled with the order id AS-IS
   (e.g. "20260831CRO#4"); "US" is part of the fixed template text, not a
   prefix to add to the id before interpolating, or the result doubles into
   "USUS20260831CRO#4". */
const buildCustomerOrderMessage = (orderId) =>
  `Thank you for your order with Adinn Outdoors! We've received it successfully. Your order ID is US${orderId}.`;

/**
 * Sends the order-created SMS to every configured admin number and to the
 * customer. Never throws — each send is independently non-fatal (see
 * sendNettyfishSms), and a missing customer phone or empty ADMIN_SMS_NUMBERS
 * just skips that side rather than failing. Callers should still wrap this
 * in their own try/catch per the "SMS must never fail an already-saved
 * order" requirement — this only guards against sendNettyfishSms itself,
 * not against a caller passing bad arguments.
 */
async function sendOrderCreatedSms({ orderId, customerPhone }) {
  if (!orderId) {
    throw new Error("sendOrderCreatedSms requires orderId");
  }

  const adminNumbers = parseAdminSmsNumbers();
  const adminMessage = buildAdminOrderMessage(orderId);
  const customerMessage = buildCustomerOrderMessage(orderId);

  if (!adminNumbers.length) {
    console.warn(`[SMS ORDER_ADMIN] Skipped — ADMIN_SMS_NUMBERS is not configured (order ${orderId}).`);
  }

  const adminResults = await Promise.all(
    adminNumbers.map((number) =>
      sendNettyfishSms({
        type: "ORDER_ADMIN",
        phoneNumber: number,
        templateId: ORDER_ADMIN_TEMPLATE_ID,
        message: adminMessage,
      })
    )
  );

  let customerResult = null;

  if (customerPhone) {
    customerResult = await sendNettyfishSms({
      type: "ORDER_USER",
      phoneNumber: customerPhone,
      templateId: ORDER_USER_TEMPLATE_ID,
      message: customerMessage,
    });
  } else {
    console.warn(`[SMS ORDER_USER] Skipped — order ${orderId} has no customer phone number.`);
  }

  return { adminResults, customerResult };
}

module.exports = {
  sendOrderCreatedSms,
  buildAdminOrderMessage,
  buildCustomerOrderMessage,
};
