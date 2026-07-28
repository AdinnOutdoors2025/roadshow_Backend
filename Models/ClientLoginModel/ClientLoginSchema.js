const mongoose = require('mongoose');
const clientLoginModel = new mongoose.Schema(
    {
        name : {type:String, required:true, trim:true},
        email : {type:String, required:true, unique:true, lowercase:true},
        phone : {type:String, required:true, unique:true},
        userTyepe :{type:Number, default:2},
        status : {type:String, default:"active"},
        createdAt : {type:Date, default:Date.now}
    }
)
module.exports = mongoose.model("ClientUser", clientLoginModel)