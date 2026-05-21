import mongoose, { Types } from "mongoose";

const userSchema =new mongoose.Schema({
    name:{
        type:String,
        require:true
    },
    email:{
        type:String,
        require:true,
        unique:true
    },
    address:{
        type:String,
        require:true
    },
    password:{
        type:String,
        require:true
    },
    profileImage:{
        type:String,
        require:false,
        default:"http://localhost:8000/uploads/6a0c40b6cee6f805ac069f42-1779188714519avatar-photo-default-user-icon-picture-face-vector-48139643.webp"
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    updatedAt:{
        type:Date,
        default:Date.now
    }
})

export default mongoose.model("user",userSchema);