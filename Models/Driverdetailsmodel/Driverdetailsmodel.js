const mongoose = require("mongoose");

const otherDocumentSchema = new mongoose.Schema(
  {
    key: { type: String },
    url: { type: String },
  },
  { _id: false }
);

const drivingDetailsSchema = new mongoose.Schema(
  {
  
    name: { type: String, trim: true },
    dob: { type: String },
    gender: { type: String },
    fatherName: { type: String, trim: true },
    country: { type: String, default: "India" },
    drivingLicenseNo: { type: String, trim: true ,  unique: true,
      sparse: true   },

    
    aadharNo: { type: String , unique: true,sparse: true},
    aadharAddress: { type: String },
    aadharFilename: { type: String },
    aadharImgFilename: { type: String },
    aadharXml: { type: String },
    aadharImg: { type: String },


    house: { type: String },
    locality: { type: String },
    dist: { type: String },
    state: { type: String },
    pincode: { type: String },


    panNumber: { type: String , unique: true,sparse: true  },
    nameOnPan: { type: String },
    panImagePath: { type: String },


    otherDocuments: { type: [otherDocumentSchema], default: [] },


    status: { type: String },
    dateTime: { type: String },

  
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Driverdetails", drivingDetailsSchema);