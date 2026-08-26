import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "@/server/auth.server";
import { buildAssistSuggestions } from "@/services/assistiveEngine.server";

const assistSchema = z.object({
  contactName: z.string().trim().max(160).default(""),
  messages: z
    .array(
      z.object({
        sender: z.enum(["me", "contact"]),
        text: z.string().max(4000),
      }),
    )
    .max(20),
});

export const suggestAssistFn = createServerFn({ method: "POST" })
  .validator(assistSchema)
  .handler(async ({ data }) => {
    await requireUser();
    return buildAssistSuggestions(data.contactName, data.messages);
  });
