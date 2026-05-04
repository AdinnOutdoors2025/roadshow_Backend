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
    secretCode: {
        type: String,
        required: true,
    },
    isAdmin: {
        type: Number,
        default: 1,
    },
    isStaffAdmin: {
        type: Number,
        default: 0,
    },
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

        if (this.isModified('secretCode')) {
            this.secretCode = await bcrypt.hash(this.secretCode, 10);
        }

        next();
    } catch (err) {
        next(err);
    }
});


adminUserSchema.methods.comparePassword = function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
};


adminUserSchema.methods.compareSecretCode = function (plainCode) {
    return bcrypt.compare(plainCode, this.secretCode);
};

adminUserSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.secretCode;
    return obj;
};

module.exports = mongoose.model('AdminUserLogin', adminUserSchema);