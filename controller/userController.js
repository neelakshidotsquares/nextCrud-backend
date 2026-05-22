import User from "../model/userModel.js"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv"
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import validator from "validator";
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
/**
 * Layered defense for create():
 *
 *   1. Global sanitizeRequest middleware has already stripped Mongo-operator
 *      keys ($ne, …) and HTML/script tags from req.body. So req.body.email
 *      is guaranteed to be a plain string at this point — never an object,
 *      never `<script>...`.
 *
 *   2. Field-level validation below uses `validator` to check email shape,
 *      enforce password length, and escape any remaining unsafe characters
 *      in human-readable text fields (name, address) before they go to
 *      Mongo / get rendered in HTML somewhere.
 *
 *   3. Mongoose's typed schema is the third layer — it would already reject
 *      a non-string email at .save() time even if the first two failed.
 *
 * Each layer is independently sufficient; together they make a class of
 * bug nearly impossible.
 */
export const create = async (req, res) => {
    try {
        // The global sanitizer trimmed and stripped HTML; here we ALSO
        // type-check (defense in depth — never trust upstream layers fully).
        const name = typeof req.body.name === "string" ? req.body.name : "";
        const address = typeof req.body.address === "string" ? req.body.address : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const rawEmail = typeof req.body.email === "string" ? req.body.email : "";

        if (!rawEmail || !password) {
            return res.status(400).json({
                status: 400, success: false,
                message: "Email and password are required",
                data: null,
            });
        }

        // Email validation + canonicalization.
        // - isEmail() rejects "foo", "foo@", "foo@bar"
        // - normalizeEmail() lowercases the domain and (by default for gmail)
        //   strips dots and +tags so "Foo+spam@Gmail.COM" -> "foo@gmail.com".
        //   This means the same person can't register twice with cosmetic
        //   variations of their email.
        if (!validator.isEmail(rawEmail)) {
            return res.status(400).json({
                status: 400, success: false,
                message: "Invalid email address",
                data: null,
            });
        }
        const email = validator.normalizeEmail(rawEmail) || rawEmail.toLowerCase();

        // Password length policy (don't escape — bcrypt hashes any bytes).
        if (!validator.isLength(password, { min: 6, max: 128 })) {
            return res.status(400).json({
                status: 400, success: false,
                message: "Password must be 6–128 characters",
                data: null,
            });
        }

        // Escape user-rendered text fields. validator.escape() converts
        //   <  >  &  '  "  /
        // to their HTML-entity equivalents so even if a downstream consumer
        // forgets to escape on render, the stored value is harmless.
        // (Belt and braces: the global sanitizer already stripped <tags>;
        // this catches lone unsafe chars like "Bob & Co. <foo>".)
        const safeName = validator.isLength(name, { min: 1, max: 100 })
            ? validator.escape(name)
            : null;
        if (!safeName) {
            return res.status(400).json({
                status: 400, success: false,
                message: "Name is required (1–100 characters)",
                data: null,
            });
        }
        const safeAddress = validator.isLength(address, { min: 0, max: 300 })
            ? validator.escape(address)
            : "";

        const userExist = await User.findOne({ email });
        if (userExist) {
            return res.status(409).json({
                status: 409, success: false,
                message: "User already exists",
                data: null,
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const saveUser = await new User({
            name: safeName,
            email,
            address: safeAddress,
            password: hashedPassword,
        }).save();

        const userResponse = {
            id: saveUser._id,
            name: saveUser.name,
            email: saveUser.email,
            address: saveUser.address,
            createdAt: saveUser.createdAt,
            updatedAt: saveUser.updatedAt,
        };

        return res.status(200).json({
            status: 200, success: true,
            message: "Users created successfully",
            data: userResponse,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 500, success: false,
            message: "Internal server error",
            data: null,
        });
    }
};

/**
 * Without sanitization, a payload like
 *     { "email": { "$ne": null }, "password": { "$ne": null } }
 * would let `User.findOne({ email })` match the FIRST user in the database
 * — a classic NoSQL injection that returns someone else's account.
 *
 * Two layers protect us:
 *   1. Global sanitizeRequest already stripped any `$`-prefixed keys, so
 *      `req.body.email` cannot be an operator object.
 *   2. The explicit `typeof === "string"` guard below double-checks even
 *      if a future refactor accidentally disabled the global sanitizer.
 */
export const login = async (req, res) => {
    try {
        const rawEmail = typeof req.body.email === "string" ? req.body.email : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";

        if (!rawEmail || !password) {
            return res.status(400).json({
                status: 400, success: false,
                message: "Email and password are required",
                data: null,
            });
        }

        if (!validator.isEmail(rawEmail)) {
            return res.status(400).json({
                status: 400, success: false,
                message: "Invalid email address",
                data: null,
            });
        }
        // Same canonicalization as create(), so users can log in with
        // "Foo@Gmail.com" even if they registered as "foo@gmail.com".
        const email = validator.normalizeEmail(rawEmail) || rawEmail.toLowerCase();

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                status: 401, success: false,
                message: "User not found",
                data: null,
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 401, success: false,
                message: "Invalid email or password",
                data: null,
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            JWT_SECRET,
            { expiresIn: EXPIRES_IN }
        );

        const userResponse = {
            id: user._id,
            name: user.name,
            email: user.email,
            address: user.address,
        };

        return res.status(200).json({
            status: 200, success: true,
            message: "Login successfully",
            access_token: token,
            data: userResponse,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            status: 500, success: false,
            message: "Internal server error",
            data: null,
        });
    }
};
export const fetch = async (req, res) => {
    try {
        // Clamp page >= 1 and limit between 1 and 100 to prevent abusive
        // requests like ?limit=999999 from doing an unbounded scan.
        const pageNumber = Math.max(1, Number(req.query.page) || 1);
        const limitNumber = Math.min(
            100,
            Math.max(1, Number(req.query.limit) || 10)
        );
        const skip = (pageNumber - 1) * limitNumber;

        // Run the page query and the total-count query in parallel.
        const [users, total] = await Promise.all([
            User.find().sort({ createdAt: -1 }).skip(skip).limit(limitNumber),
            User.countDocuments(),
        ]);

        const totalPages = total === 0 ? 0 : Math.ceil(total / limitNumber);

        const userResponse = users.map((user) => ({
            id: user._id,
            name: user.name,
            email: user.email,
            address: user.address,
            profileImage: user.profileImage,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        }));

        // Always 200, even when the page is empty — pagination clients rely
        // on `total` / `totalPages` to know there's nothing more, not on a 404.
        return res.status(200).json({
            status: 200,
            success: true,
            message: "fetch users successfully",
            User: userResponse,
            page: pageNumber,
            limit: limitNumber,
            total,
            totalPages,
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
