export type DiagnosticSource = "render" | "async" | "network" | "resource" | "manual" | "server";

export type DiagnosticLocation = {
  file?: string;
  line?: number;
  column?: number;
  component?: string;
};

export type DiagnosticRecord = {
  id: string;
  timestamp: string;
  source: DiagnosticSource;
  message: string;
  name: string;
  stack: string;
  route?: string;
  location: DiagnosticLocation;
  state: unknown;
  payload: unknown;
  actionPlan: string[];
  handled: boolean;
  recoverable: boolean;
};

export type CaptureDiagnosticOptions = {
  source: DiagnosticSource;
  component?: string;
  route?: string;
  state?: unknown;
  payload?: unknown;
  handled?: boolean;
  recoverable?: boolean;
  actionPlan?: string[];
};

const MAX_RECORDS = 100;
const MAX_DEPTH = 5;
const MAX_KEYS = 80;
const MAX_ARRAY = 80;
const MAX_STRING = 6_000;
const SENSITIVE_KEY =
  /(password|passwd|token|secret|authorization|cookie|session|csrf|api[-_]?key|private[-_]?key|license)/i;

const records: DiagnosticRecord[] = [];
const retryHandlers = new Map<string, () => void>();
const listeners = new Set<(items: DiagnosticRecord[]) => void>();
let interceptorsInstalled = false;
let originalFetch: typeof window.fetch | undefined;

function safeString(value: unknown) {
  return String(value).slice(0, MAX_STRING);
}

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function getErrorParts(error: unknown) {
  if (isError(error)) {
    return {
      name: error.name || "Error",
      message: error.message || safeString(error),
      stack: error.stack || `${error.name || "Error"}: ${error.message || "Erro sem stack"}`,
    };
  }
  if (typeof Response !== "undefined" && error instanceof Response) {
    return {
      name: "ResponseError",
      message: `HTTP ${error.status}${error.url ? ` em ${error.url}` : ""}`,
      stack: "",
    };
  }
  if (typeof error === "string") return { name: "Error", message: error, stack: error };
  return { name: "UnknownError", message: safeString(error), stack: safeString(error) };
}

function redact(value: unknown, depth = 0, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return redact(
      { name: value.name, message: value.message, stack: value.stack, cause: value.cause },
      depth + 1,
      key,
    );
  }
  if (typeof Response !== "undefined" && value instanceof Response) {
    return { status: value.status, url: value.url, type: value.type };
  }
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_KEYS)) {
      output[childKey] = redact(childValue, depth + 1, childKey);
    }
    return output;
  }
  return safeString(value);
}

function parseLocation(stack: string, component?: string): DiagnosticLocation {
  const lines = stack.split("\n");
  const match = lines
    .map((line) =>
      line.match(
        /(?:at\s+.*?\s+\()?((?:https?:\/\/|file:\/\/|\/|[A-Za-z]:\\)[^():\s]+):?(\d+)? :(\d+)?\)?$/,
      ),
    )
    .find(Boolean);
  if (!match) return component ? { component } : {};
  return {
    ...(match[1] ? { file: match[1] } : {}),
    ...(match[2] ? { line: Number(match[2]) } : {}),
    ...(match[3] ? { column: Number(match[3]) } : {}),
    ...(component ? { component } : {}),
  };
}

function defaultActionPlan(source: DiagnosticSource, message: string) {
  const plan = [
    "Reproduzir a ação usando o mesmo caminho e dados sanitizados.",
    "Verificar o primeiro arquivo/linha informado na stack, antes dos frames de framework.",
  ];
  if (source === "network") {
    plan.push(
      "Confirmar status HTTP, endpoint, autenticação e disponibilidade do serviço externo.",
    );
    plan.push(
      "Repetir a operação com retry controlado; não reenviar ações não idempotentes sem confirmar o resultado.",
    );
  } else if (source === "async") {
    plan.push(
      "Localizar a Promise sem tratamento e adicionar estado de loading, erro e recuperação.",
    );
  } else if (source === "render") {
    plan.push(
      "Isolar a propriedade nula ou o componente que falhou e fornecer fallback para estado vazio.",
    );
  } else {
    plan.push(
      "Consultar os logs do servidor usando o ID de diagnóstico para correlacionar o evento.",
    );
  }
  plan.push(`Classificar a causa raiz de: ${message.slice(0, 180)}`);
  return plan;
}

function notify() {
  const snapshot = [...records];
  for (const listener of listeners) listener(snapshot);
}

export function captureDiagnostic(
  error: unknown,
  options: CaptureDiagnosticOptions,
): DiagnosticRecord {
  const parts = getErrorParts(error);
  const route =
    options.route ?? (typeof window !== "undefined" ? window.location.pathname : undefined);
  const record: DiagnosticRecord = {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `diag-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    source: options.source,
    message: parts.message,
    name: parts.name,
    stack: parts.stack.slice(0, MAX_STRING),
    ...(route ? { route } : {}),
    location: parseLocation(parts.stack, options.component),
    state: redact(options.state),
    payload: redact(options.payload),
    actionPlan: options.actionPlan ?? defaultActionPlan(options.source, parts.message),
    handled: options.handled ?? true,
    recoverable: options.recoverable ?? true,
  };
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
  notify();
  return record;
}

export function getDiagnostics() {
  return [...records];
}

export function subscribeDiagnostics(listener: (items: DiagnosticRecord[]) => void) {
  listeners.add(listener);
  listener([...records]);
  return () => listeners.delete(listener);
}

export function clearDiagnostics() {
  records.length = 0;
  notify();
}

export function registerDiagnosticRetry(id: string, retry: (() => void) | undefined) {
  if (retry) retryHandlers.set(id, retry);
  else retryHandlers.delete(id);
}

export function requestDiagnosticRetry(id: string) {
  retryHandlers.get(id)?.();
}

export function isDiagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  return import.meta.env.DEV || window.localStorage.getItem("mago:debug") === "1";
}

export function installGlobalDiagnosticInterceptors() {
  if (interceptorsInstalled || typeof window === "undefined") return;
  interceptorsInstalled = true;

  window.addEventListener("error", (event) => {
    if (event.error) {
      captureDiagnostic(event.error, { source: "async", handled: false, recoverable: true });
    } else if (event.message) {
      captureDiagnostic(new Error(event.message), {
        source: "resource",
        payload: { filename: event.filename, line: event.lineno, column: event.colno },
        handled: false,
        recoverable: true,
      });
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureDiagnostic(event.reason, {
      source: "async",
      payload: { promise: "unhandledrejection" },
      handled: false,
      recoverable: true,
    });
  });

  originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const request = args[0];
    const requestInit = args[1];
    const url =
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.toString()
          : request.url;
    const method =
      requestInit?.method ??
      (typeof request !== "string" && !(request instanceof URL) ? request.method : "GET");
    try {
      const response = await originalFetch!(...args);
      if (!response.ok) {
        captureDiagnostic(new Error(`HTTP ${response.status} em ${method} ${url}`), {
          source: "network",
          payload: { url, method, status: response.status, statusText: response.statusText },
          handled: true,
          recoverable: true,
        });
      }
      return response;
    } catch (error) {
      captureDiagnostic(error, {
        source: "network",
        payload: { url, method },
        handled: false,
        recoverable: true,
      });
      throw error;
    }
  };
}

export function uninstallGlobalDiagnosticInterceptors() {
  if (typeof window === "undefined" || !interceptorsInstalled) return;
  if (originalFetch) window.fetch = originalFetch;
  originalFetch = undefined;
  interceptorsInstalled = false;
}

declare global {
  interface Window {
    __magoCaptureDiagnostic?: typeof captureDiagnostic;
    __magoClearDiagnostics?: typeof clearDiagnostics;
    __magoEnableDiagnostics?: () => void;
  }
}

if (typeof window !== "undefined") {
  window.__magoCaptureDiagnostic = captureDiagnostic;
  window.__magoClearDiagnostics = clearDiagnostics;
  window.__magoEnableDiagnostics = () => window.localStorage.setItem("mago:debug", "1");
}
