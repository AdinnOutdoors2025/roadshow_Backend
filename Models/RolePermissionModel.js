const mongoose = require('mongoose');

const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['sales', 'operation'],
      required: true,
      unique: true,
    },
    allowedMenus: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
