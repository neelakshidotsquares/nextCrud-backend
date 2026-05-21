import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import routes from "../routes/userRoutes.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(cors());

const MONGOURL = process.env.MONGO_URL;

// Cache the mongoose connection promise across warm invocations.
// In serverless, the module is reused while the container is hot, so we
// only want to dial the DB once instead of on every request.
let connectionPromise = null;
const connectToDatabase = () => {
  if (!MONGOURL) {
    return Promise.reject(
      new Error("MONGO_URL environment variable is not set")
    );
  }
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(MONGOURL)
      .then((conn) => {
        console.log("Database connected successfully.");
        return conn;
      })
      .catch((err) => {
        // Allow retry on the next request instead of permanently caching a failure.
        connectionPromise = null;
        throw err;
      });
  }
  return connectionPromise;
};

// Gate every request on the DB being ready so handlers don't crash on cold start.
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error("DB connection failed:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Database connection failed",
      data: null,
    });
  }
});

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use("/api/user", routes);

// Local dev only: Vercel never enters this branch because it invokes the
// exported handler directly instead of running this file as a server.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`server is running on port ${PORT}`));
}

export default app;
