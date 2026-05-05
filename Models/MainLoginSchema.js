const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: 4,
      maxlength: 20,
      match: [/^[a-zA-Z0-9]+$/, 'Only letters & numbers'],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    isAdmin: { type: Number, default: 1 },
    isStaffAdmin: { type: Number, default: 0 },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'admin',
    },
  },
  { timestamps: true }
);

adminUserSchema.pre('save', async function (next) {
  try {
    if (this.isModified('password')) {
      this.password = await bcrypt.hash(this.password, 10);
    }
    next();
  } catch (err) {
    next(err);
  }
});

adminUserSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

adminUserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('AdminUserLogin', adminUserSchema);