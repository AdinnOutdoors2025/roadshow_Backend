require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Order = mongoose.connection.collection("orders");
  const orders = await Order.find({ orderId: { $regex: "CRO#8$" } }).toArray();
  orders.forEach((order) => {
    console.log("_id:", order._id.toString(), "| orderId:", order.orderId, "| bookingSummaryPdfUrl:", order.bookingSummaryPdfUrl, "| campaignMailSent:", order.campaignMailSent, "| updatedAt:", order.updatedAt);
  });

  const VehicleDetails = mongoose.connection.collection("vehicledetails");
  const matches = await VehicleDetails.find({ "basicInfo.vehicleType": "69fdccce8be668385f1ddd02" }).toArray();
  console.log(`vehicleDetails docs for type 69fdccce8be668385f1ddd02: ${matches.length}`);
  matches.forEach(m => console.log(" -", m._id.toString(), "| name:", m.basicInfo?.vehicleName, "| frontViewImage:", m.mediaFiles?.frontViewImage));

  // also check by string vs ObjectId type
  const mongoose2 = mongoose;
  const asObjId = await VehicleDetails.find({ "basicInfo.vehicleType": new mongoose2.Types.ObjectId("69fdccce8be668385f1ddd02") }).toArray();
  console.log(`as ObjectId: ${asObjId.length}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
