import express from "express";
import {
  fetch,
  create,
  update,
  deleteUser,
  fetchById,
  login,
  uploadImage,
 
} from "../controller/userController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { uploadSingle } from "../middleware/uploadMiddleware.js";
import { loginLimiter } from "../middleware/rateLimiter.js";

const routes = express.Router();

/**
 * @openapi
 * /api/user/create:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       200:
 *         description: User created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessEnvelope'
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.post("/create", create);

/**
 * @openapi
 * /api/user/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive a JWT
 *     description: |
 *       Rate-limited to **5 failed attempts per 10 minutes per IP** to slow
 *       down brute-force attacks. Successful logins do not count toward the
 *       limit.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Bad credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 *       429:
 *         description: Too many failed login attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.post("/login", loginLimiter, login);

/**
 * @openapi
 * /api/user/getAllUser:
 *   get:
 *     tags: [Users]
 *     summary: List users (paginated)
 *     description: Returns a page of users plus pagination metadata (`page`, `limit`, `total`, `totalPages`). Sorted by newest first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Users fetched.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedUsersEnvelope'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.get("/getAllUser", authMiddleware, fetch);


/**
 * @openapi
 * /api/user/getUserById/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a single user by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     responses:
 *       200:
 *         description: User fetched.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: User fetched successfully }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.get("/getUserById/:id", authMiddleware, fetchById);

/**
 * @openapi
 * /api/user/updateUser/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update an existing user's profile fields
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserRequest'
 *     responses:
 *       200:
 *         description: User updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: integer, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: User updated successfully }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.put("/updateUser/:id", authMiddleware, update);

/**
 * @openapi
 * /api/user/deleteUser/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     responses:
 *       200:
 *         description: User deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: integer, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: User deleted successfully }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.delete("/deleteUser/:id", authMiddleware, deleteUser);

/**
 * @openapi
 * /api/user/uploadAvatar/{id}:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload (or replace) a user's profile image
 *     description: Send the image binary in the `image` form field. Allowed types JPG, PNG, GIF, WEBP. Max 5MB.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: The image file to upload.
 *     responses:
 *       200:
 *         description: Avatar updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: integer, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Profile image uploaded successfully }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: No file, wrong field name, wrong file type, or file too large.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       500: { $ref: '#/components/responses/ServerError' }
 */
routes.post(
  "/uploadAvatar/:id",
  authMiddleware,
  uploadSingle("image"),
  uploadImage
);
   
export default routes;
