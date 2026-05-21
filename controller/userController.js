import User from "../model/userModel.js"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv"
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { UPLOAD_DIR, UPLOAD_PUBLIC_PATH } from "../middleware/uploadMiddleware.js";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.EXPIRES_IN;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Best-effort delete; never throws so it can't break the request.
const safeUnlink = (filePath) => {
    if (!filePath) return;
    fs.unlink(filePath, () => {});
};
export const create = async (req, res) => {
    try {
        const userData = new User(req.body);

        const { email, password } = userData;
        if (!email || !password) {
            return res.status(400).json({
               message: "Email and password are required"
            });
         }
        const userExist = await User.findOne({ email });
        if (userExist) {
            return res.status(400).json({
                status:200,success:false,
                message: "User already exists",
                data:null
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        userData.password = hashedPassword;
        const saveUser = await userData.save();
        const userResponse = {
            id: saveUser._id,
            name: saveUser.name,
            email: saveUser.email,
            address: saveUser.address,
            createdAt: saveUser.createdAt,
            updatedAt: saveUser.updatedAt
         };

        res.status(200).json({status:200,success:true, message:"Users created successfully",data:userResponse});

    } catch (error) {
        res.status(500).json({
            status:500,success:false,
            message: "Internal server error",
            data:null
        });
    }
};

export const login = async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Check email exists
      const user = await User.findOne({ email });
   
      if (!user) {
        return res.status(401).json({
          status: 401,
          success: false,
          message: "User not found",
          data: null,
        });
      }
  
      // Compare password
      const isPasswordValid = await bcrypt.compare(
        password,
        user.password
      );
    
      if (!isPasswordValid) {
        return res.status(401).json({
          status: 401,
          success: false,
          message: "Invalid email or password",
          data: null,
        });
      }
  
      // Generate JWT Token
      const token = jwt.sign(
        { userId: user._id },
        JWT_SECRET,
        { expiresIn: EXPIRES_IN }
      );
      // User response without password
      const userResponse = {
        id: user._id,
        name: user.name,
        email: user.email,
        address: user.address,
      };
  
      // Success response
      return res.status(200).json({
        status: 200,
        success: true,
        message: "Login successfully",
        access_token: token,
        data: userResponse,
      });
  
    } catch (error) {
      return res.status(500).json({
        status: 500,
        success: false,
        message: "Internal server error",
        data: null,
      });
    }
  };
export const fetch =async (req,res)=>{
    try {
        const user= await User.find();
        if(user.length === 0){
            return res.status(404).json({message : "user not found"});
        }
        const userResponse =user.map(user => {
            return {
                id: user._id,
                name: user.name,
                email: user.email,
                address: user.address,
                profileImage: user.profileImage,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

        res.status(200).json({status:200,success:true, message:"fetch users successfully", User:userResponse })
    } catch (error) {
        res.status(500).json({error:"Internal server error"})
    }
}
export const fetchById = async (req, res) => {

    try {

        const id = req.params.id;

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            address: user.address,
            profileImage: user.profileImage,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
         };

        res.status(200).json({
            success: true,
            message: "User fetched successfully",
            user: userResponse
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};
export const update = async (req, res) => {
    try {

        const id = req.params.id;

        const userExist = await User.findOne({ _id: id });

        if (!userExist) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const updateUser = await User.findByIdAndUpdate(
            id,
            req.body,
            { new: true }
        );

        const userResponse = {
            id: updateUser ? updateUser._id : userExist._id,
             name: updateUser ? updateUser.name : userExist.name,
            email: updateUser ? updateUser.email : userExist.email,
            address: updateUser ? updateUser.address : userExist.address,
            profileImage: updateUser ? updateUser.profileImage : userExist.profileImage,
            createdAt: updateUser ? updateUser.createdAt : userExist.createdAt,
            updatedAt: updateUser ? updateUser.updatedAt : userExist.updatedAt
         };
        res.status(200).json({
            status: 200,
            success: true,
            message: "User updated successfully",
            user: userResponse
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Internal server error"
        });
    }
};

export const deleteUser = async (req, res) => {
    try {

        const id = req.params.id;

        const userExist = await User.findOne({ _id: id });

        if (!userExist) {
            return res.status(404).json({
                message: "User not found"
            });
        }

         await User.findByIdAndDelete(id);

        res.status(200).json({
            status: 200,
            success: true,
            message: "User deleted successfully",
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Internal server error"
        });
    }
};
export const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: 400,
                success: false,
                message: "No image file provided. Send the file in the 'image' field.",
                data: null,
            });
        }

        const id = req.params.id;
        const user = await User.findById(id);

        if (!user) {
            // Avoid leaving an orphan file on disk if the target user doesn't exist.
            safeUnlink(req.file.path);
            return res.status(404).json({
                status: 404,
                success: false,
                message: "User not found",
                data: null,
            });
        }

        // Build a public URL the browser can <img src="..."> directly.
        const base = `${req.protocol}://${req.get("host")}`;
        const publicUrl = `${base}${UPLOAD_PUBLIC_PATH}/${req.file.filename}`;

        // If the user had a previously uploaded local image, delete it from disk.
        // We leave the default placeholder alone since it's an external URL.
        const previous = user.profileImage;
        if (previous && previous.includes(`${UPLOAD_PUBLIC_PATH}/`)) {
            const previousFilename = previous.split(`${UPLOAD_PUBLIC_PATH}/`)[1];
            if (previousFilename) {
                safeUnlink(path.join(UPLOAD_DIR, previousFilename));
            }
        }

        user.profileImage = publicUrl;
        user.updatedAt = new Date();
        await user.save();

        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            address: user.address,
            profileImage: user.profileImage,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };

        return res.status(200).json({
            status: 200,
            success: true,
            message: "Profile image uploaded successfully",
            user: userResponse,
        });

    } catch (error) {
        console.log(error);
        // Clean up the just-uploaded file if anything failed after it landed on disk.
        if (req.file) safeUnlink(req.file.path);
        return res.status(500).json({
            status: 500,
            success: false,
            message: "Internal server error",
            data: null,
        });
    }
};
