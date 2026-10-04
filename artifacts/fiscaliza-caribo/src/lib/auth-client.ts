const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export type AuthUser = {
  id: number;
  email: string;
  name: string;
};

export type AuthSession = {
  authenticated: boolean;
  user?: AuthUser;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function csrfCookie() {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrftoken="));
  return cookie ? decodeURIComponent(cookie.slice("csrftoken=".length)) : "";
}

async function ensureCsrfCookie() {
  if (csrfCookie()) return;
  const response = await fetch(`${basePath}/api/auth/csrf`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new ApiRequestError("Não foi possível iniciar uma sessão segura.", response.status);
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const unsafe = !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method);
  if (unsafe) await ensureCsrfCookie();

  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (unsafe) {
    const token = csrfCookie();
    if (token) headers.set("X-CSRFToken", token);
  }

  const response = await fetch(`${basePath}${path}`, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : "Não foi possível concluir o pedido. Tente novamente.";
    throw new ApiRequestError(message, response.status);
  }
  return body as T;
}