import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { createSelfServeAccount } from "@/services/account.server";

const signupSchema = z.object({
  organizationName: z.string().trim().min(2).max(100),
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  plan: z.enum(["starter", "growth", "scale"]).default("starter"),
});

export const signupFn = createServerFn({ method: "POST" })
  .validator(signupSchema)
  .handler(({ data }) => createSelfServeAccount(data));
