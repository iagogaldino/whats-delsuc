import type { FastifyInstance } from "fastify";
import { loginController, signupController } from "../controllers/auth.controller.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", signupController);
  app.post("/auth/login", loginController);
}
