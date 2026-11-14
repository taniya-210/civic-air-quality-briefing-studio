export class ApiRequestError extends Error {
  statusCode?: number;
  code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function readApiJson<T>(res: Response, fallbackError: string): Promise<T> {
  const status = res.status;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  const looksLikeHtml =
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    (contentType.includes('text/html') && trimmed.startsWith('<'));

  if (looksLikeHtml) {
    throw new ApiRequestError(
      `API returned an HTML page (HTTP ${status || 'unknown'}) instead of JSON. Ensure the backend server is running and /api routes are reachable.`,
      status || 502,
      'UPSTREAM_HTML_RESPONSE'
    );
  }

  if (!trimmed) {
    if (!res.ok) {
      throw new ApiRequestError(`${fallbackError} (HTTP ${status}).`, status, 'HTTP_ERROR');
    }
    throw new ApiRequestError(`API returned an empty response (HTTP ${status}).`, status, 'EMPTY_RESPONSE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    if (!res.ok) {
      throw new ApiRequestError(
        `${fallbackError} (HTTP ${status}): ${trimmed.slice(0, 160)}`,
        status,
        'NON_JSON_ERROR'
      );
    }
    throw new ApiRequestError(
      `API returned non-JSON content (HTTP ${status}, content-type: ${contentType || 'unknown'}).`,
      status,
      'INVALID_JSON_RESPONSE'
    );
  }

  if (!res.ok) {
    const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const errorMessage =
      obj && typeof obj.error === 'string' ? obj.error : fallbackError;
    const errorCode = obj && typeof obj.code === 'string' ? obj.code : 'HTTP_ERROR';
    throw new ApiRequestError(errorMessage, status, errorCode);
  }

  return parsed as T;
}
