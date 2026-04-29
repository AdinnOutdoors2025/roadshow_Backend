const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const employeeSchema = new mongoose.Schema(
    {
        employeeName: {
            type: String,
            required: [true, 'Employee name is required'],
            trim: true,
        },
        employeeEmail: {
            type: String,
            required: [true, 'Employee email is required'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^[^\s@]+@adinn\.co\.in$/, 'Only @adinn.co.in emails are allowed'],
        },
        secretCode: {
            type: String,
            required: [true, 'Secret code is required'],
        },
        employeeId: {
            type: String,
            required: true,
            unique: true,
        },
        role: {
            type: String,
            enum: ['employee', 'admin'],
            default: 'employee',
        },
        createdAt: { type: Date, default: Date.now },
        lastLogin: {
            type: Date,
        },
    },
    { timestamps: true }
);

// ── Hash secretCode before saving ────────────────────────────────────────────
employeeSchema.pre('save', async function (next) {
    try {
        if (this.isModified('secretCode')) {
            const salt = await bcrypt.genSalt(10);
            this.secretCode = await bcrypt.hash(this.secretCode, salt);
        }
        next();
    } catch (err) {
        next(err);
    }
});

// ── Compare plain secretCode with stored hash ────────────────────────────────
employeeSchema.methods.compareSecretCode = async function (plainCode) {
    return bcrypt.compare(plainCode, this.secretCode);
};

// ── Strip secretCode from JSON responses ─────────────────────────────────────
employeeSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.secretCode;
    return obj;
};

module.exports = mongoose.model('Employee', employeeSchema);