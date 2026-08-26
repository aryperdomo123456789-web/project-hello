import { useSession } from "@tanstack/react-start/server";

import { getServerEnv } from "./env.server";

export type AppSessionData = {
  userId?: string;
  organizationId?: string;
  issuedAt?: number;
};

export function getAppSession() {
  const env = getServerEnv();

  // TanStack Start expõe useSession como helper server-side de request, não como hook React de componente.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSession<AppSessionData>({
    name: "mago-bot-session",
    password: env.SESSION_SECRET,
    cookie: {
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    },
  });
}
