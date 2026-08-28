import { MagoBotApiError } from "@/services/magoBotApi.types";

export function isOfflineChannelStatus(status: string | null | undefined) {
  return ["close", "closed", "disconnected", "offline", "error", "failed"].includes(
    status?.toLowerCase() ?? "",
  );
}

export function isFatalProviderError(error: unknown) {
  if (error instanceof MagoBotApiError) {
    return (
      [401, 403, 404, 410].includes(error.status) ||
      /channel|provider|connection|instance/i.test(error.code)
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return /(channel|provider|connection|instance).*(offline|closed|close|disconnected|not found|unauthorized|forbidden|fatal)/i.test(
    message,
  );
}

export function circuitReasonForChannel(status: string | null | undefined) {
  return `Canal indisponível: ${status || "status desconhecido"}`;
}
