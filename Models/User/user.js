const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,          
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^[0-9]{10,15}$/, "Please enter a valid phone number (10–15 digits)"],
    },
      address: {
      type: String,
      trim: true,
    },
    isVerified: {
  type: Boolean,
  default: false
},
  },
  {
    timestamps: true,        
  }
);

module.exports = mongoose.model("User", userSchema);