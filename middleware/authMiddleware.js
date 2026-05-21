import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET;
export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Token missing",
      });
    }

    const token = authHeader.split(" ")[1];

    const verifyToken = jwt.verify(token, JWT_SECRET);

    req.user = verifyToken;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};