import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, loginUser, logoutUser } from "../server/auth.server";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  organizationId: z.string().uuid().optional(),
  entry: z.enum(["owner", "app"]).default("app"),
});

export const loginFn = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(({ data }) => loginUser(data.email, data.password, data.organizationId, data.entry));

export const logoutFn = createServerFn({ method: "POST" }).handler(() => logoutUser());

export const meFn = createServerFn({ method: "GET" }).handler(() => getCurrentUser());
