const mongoose = require('mongoose');

const clientLoginModel = new mongoose.Schema(
    {
        name : {type:String, required:true, trim:true},
        email : {type:String, required:true, unique:true, lowercase:true},
        phone : {type:String, required:true, unique:true},

        /* Legacy misspelling — kept so existing documents keep validating.
           New code should read/write `userType` below. */
        userType : {type:Number, default:2},

        /* "agency" customers are GST-verified at signup and book on behalf of
           clients; "individual" customers book for themselves. */
        accountType : {
            type: String,
            enum: ["individual", "agency"],
            default: "individual"
        },

        /* Set for agencies only — the verified GST record backing this account.
           Stored as a reference (not a copy) so business detail corrections in
           GstDetail flow through automatically. */
        gstDetailId : {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GstDetail",
            default: null
        },

        status : {type:String, default:"active"},
        createdAt : {type:Date, default:Date.now}
    }
)

clientLoginModel.index({ accountType: 1 });

module.exports = mongoose.model("ClientUser", clientLoginModel)
