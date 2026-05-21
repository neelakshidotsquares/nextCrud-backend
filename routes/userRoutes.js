import express from "express";
import { fetch, create ,update, deleteUser,fetchById,login,uploadImage} from "../controller/userController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { uploadSingle } from "../middleware/uploadMiddleware.js";
const routes=express.Router();

routes.post("/create",create);
routes.post("/login",login);
routes.get("/getAllUser",authMiddleware,fetch);
routes.get("/getUserById/:id",authMiddleware,fetchById)
routes.put("/updateUser/:id",authMiddleware,update);
routes.delete("/deleteUser/:id",authMiddleware,deleteUser);
routes.post("/uploadAvatar/:id",authMiddleware,uploadSingle("image"),uploadImage);

export default routes;