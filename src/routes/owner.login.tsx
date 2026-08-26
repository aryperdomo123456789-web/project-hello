import { createFileRoute } from "@tanstack/react-router";

import { LoginScreen } from "@/components/auth/LoginScreen";

export const Route = createFileRoute("/owner/login")({
  component: () => <LoginScreen mode="owner" />,
});
