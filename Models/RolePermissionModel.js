const mongoose = require('mongoose');

// A doc with userId: null is the role-level DEFAULT (legacy behavior, one
// per role). A doc with userId set is a per-user OVERRIDE — takes priority
// over the role default for that specific admin user at login time.
const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['sales', 'operation'],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUserLogin',
      default: null,
    },
    allowedMenus: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// One role-level default doc per role (userId: null), and one override doc
// per user. Partial unique index so multiple userId:null docs across
// different roles don't collide, and each user can only have one override.
rolePermissionSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { userId: null } }
);
rolePermissionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
