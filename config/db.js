import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGOURL = process.env.MONGO_URL;

// Cache the mongoose connection promise across warm invocations.
// In serverless, the module is reused while the container is hot, so we
// only want to dial the DB once instead of on every request.
let connectionPromise = null;
export const connectToDatabase = () => {
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