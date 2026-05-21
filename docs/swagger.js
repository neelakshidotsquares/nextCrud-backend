import swaggerJSDoc from "swagger-jsdoc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Adding a new endpoint? You DON'T need to touch this file.
 *
 *   1. Define your route in backend/routes/*.js as usual.
 *   2. Add a JSDoc block right above the route line, starting with `@openapi`.
 *   3. Save. Nodemon restarts. Open /api-docs and your endpoint is there.
 *
 * Example (copy / adapt above any new route line):
 *
 *   /**
 *    * @openapi
 *    * /api/user/example/{id}:
 *    *   get:
 *    *     tags: [Users]
 *    *     summary: One-line description
 *    *     security: [{ bearerAuth: [] }]
 *    *     parameters:
 *    *       - $ref: '#/components/parameters/UserIdParam'
 *    *     responses:
 *    *       200:
 *    *         description: OK
 *    *       401: { $ref: '#/components/responses/Unauthorized' }
 *    *       404: { $ref: '#/components/responses/NotFound' }
 *    *       500: { $ref: '#/components/responses/ServerError' }
 *    *\/
 *   routes.get("/example/:id", authMiddleware, exampleController);
 *
 * Shared schemas, parameters, and responses live in `components` below —
 * reference them via $ref instead of copy-pasting.
 */

const PORT = process.env.PORT || 8000;
const LOCAL_URL = `http://localhost:${PORT}`;
const VERCEL_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;

const servers = [{ url: LOCAL_URL, description: "Local development" }];
if (VERCEL_URL) {
  servers.unshift({ url: VERCEL_URL, description: "Vercel deployment" });
}

const definition = {
  openapi: "3.0.3",
  info: {
    title: "User CRUD API",
    version: "1.0.0",
    description:
      "Authentication, profile management, and avatar upload endpoints.\n\n" +
      "**How to test protected routes:**\n" +
      "1. Call `POST /api/user/login` and copy the `access_token` from the response.\n" +
      "2. Click the **Authorize** button (top right) and paste the token.\n" +
      "3. All padlocked endpoints are now executable from this UI.",
  },
  servers,
  tags: [
    { name: "Auth", description: "Account creation and login" },
    { name: "Users", description: "User CRUD operations (JWT required)" },
    { name: "Uploads", description: "Profile image upload (JWT required)" },
    { name: "Misc", description: "Miscellaneous endpoints" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Paste the `access_token` returned by `POST /api/user/login`.",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string", example: "6a0ed550569e07b629ec6a78" },
          name: { type: "string", example: "Jane Doe" },
          email: {
            type: "string",
            format: "email",
            example: "jane@example.com",
          },
          address: { type: "string", example: "221B Baker Street, London" },
          profileImage: {
            type: "string",
            format: "uri",
            example:
              "http://localhost:8000/uploads/6a0ed550569e07b629ec6a78-1779188714519.webp",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateUserRequest: {
        type: "object",
        required: ["name", "email", "password", "address"],
        properties: {
          name: { type: "string", example: "Jane Doe" },
          email: {
            type: "string",
            format: "email",
            example: "jane@example.com",
          },
          password: {
            type: "string",
            format: "password",
            minLength: 6,
            example: "S3cret!",
          },
          address: { type: "string", example: "221B Baker Street, London" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: {
            type: "string",
            format: "email",
            example: "jane@example.com",
          },
          password: {
            type: "string",
            format: "password",
            example: "S3cret!",
          },
        },
      },
      UpdateUserRequest: {
        type: "object",
        description: "Any subset of the editable user fields.",
        properties: {
          name: { type: "string", example: "Jane D." },
          email: {
            type: "string",
            format: "email",
            example: "jane.d@example.com",
          },
          address: { type: "string", example: "10 Downing Street, London" },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          status: { type: "integer", example: 200 },
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Login successfully" },
          access_token: {
            type: "string",
            example:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIuLi4ifQ...",
          },
          data: { $ref: "#/components/schemas/User" },
        },
      },
      SuccessEnvelope: {
        type: "object",
        properties: {
          status: { type: "integer", example: 200 },
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operation successful" },
          data: { $ref: "#/components/schemas/User" },
        },
      },
      UserListEnvelope: {
        type: "object",
        properties: {
          status: { type: "integer", example: 200 },
          success: { type: "boolean", example: true },
          message: { type: "string", example: "fetch users successfully" },
          User: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
          },
        },
      },
      ErrorEnvelope: {
        type: "object",
        properties: {
          status: { type: "integer", example: 400 },
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Something went wrong" },
          data: { type: "object", nullable: true, example: null },
        },
      },
    },
    parameters: {
      UserIdParam: {
        name: "id",
        in: "path",
        required: true,
        description: "Mongo ObjectId of the target user.",
        schema: { type: "string", example: "6a0ed550569e07b629ec6a78" },
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing or invalid JWT.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            example: {
              status: 401,
              success: false,
              message: "Invalid token",
              data: null,
            },
          },
        },
      },
      NotFound: {
        description: "Resource not found.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            example: {
              status: 404,
              success: false,
              message: "User not found",
              data: null,
            },
          },
        },
      },
      BadRequest: {
        description: "Validation or input error.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            example: {
              status: 400,
              success: false,
              message: "Invalid ID format",
              data: null,
            },
          },
        },
      },
      ServerError: {
        description: "Unhandled server error.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
            example: {
              status: 500,
              success: false,
              message: "Internal server error",
              data: null,
            },
          },
        },
      },
    },
  },
};

/**
 * `apis` is the glob list swagger-jsdoc walks at startup. Anything matching
 * these patterns is parsed for `@openapi` / `@swagger` JSDoc blocks. Add a
 * new pattern here only if you start putting annotations in a new folder.
 */
const swaggerSpec = swaggerJSDoc({
  definition,
  apis: [
    path.join(__dirname, "..", "routes", "*.js"),
    path.join(__dirname, "..", "controller", "*.js"),
  ],
});

export default swaggerSpec;
