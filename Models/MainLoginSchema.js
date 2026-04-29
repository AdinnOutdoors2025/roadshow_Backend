// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//     username: {
//         type: String,
//         required: true,
//         unique: true,
//          trim: true,
//         minlength: [4, 'Username must be at least 4 characters'],
//         maxlength: [20, 'Username cannot exceed 20 characters'],
//         match: [/^[a-zA-Z0-9]+$/, 'Username can only contain letters and numbers']

//     },
//     password: {
//         type: String,
//         required: true,
//                 minlength: [6, 'Password must be at least 6 characters']

//     },
//       secretCode: {  // Add this field to store hashed secret code
//         type: String,
//         required: true
//     },
//     role: {
//         type: String,
//         enum: ['user', 'admin'],
//         default: 'user'
//     },
//     createdAt: {
//         type: Date,
//         default: Date.now
//     }
// });

// module.exports = mongoose.model('AdminUserLogin', userSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminUserSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            unique: true,
            trim: true,
            minlength: [4, 'Username must be at least 4 characters'],
            maxlength: [20, 'Username cannot exceed 20 characters'],
            match: [/^[a-zA-Z0-9]+$/, 'Username can only contain letters and numbers'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
        },
        secretCode: {
            type: String,
            required: [true, 'Secret code is required'],
        },
        role: {
            type: String,
            enum: ['user', 'admin'],
            default: 'admin',
        },
    },
    { timestamps: true }
);

// Hash password & secretCode before saving
adminUserSchema.pre('save', async function (next) {
    try {
        if (this.isModified('password')) {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        }
        if (this.isModified('secretCode')) {
            const salt = await bcrypt.genSalt(10);
            this.secretCode = await bcrypt.hash(this.secretCode, salt);
        }
        next();
    } catch (err) {
        next(err);
    }
});

// Compare plain password with hashed
adminUserSchema.methods.comparePassword = async function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
};

// Compare plain secretCode with hashed
adminUserSchema.methods.compareSecretCode = async function (plainCode) {
    return bcrypt.compare(plainCode, this.secretCode);
};

// Strip sensitive fields from JSON response
adminUserSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.secretCode;
    return obj;
};

module.exports = mongoose.model('AdminUserLogin', adminUserSchema);