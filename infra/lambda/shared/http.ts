/** The parts of an HTTP API (payload v2) event the handlers read. */
export interface HttpEvent {
  routeKey?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext?: {
    http?: { sourceIp?: string; method?: string; path?: string };
    authorizer?: { jwt?: { claims?: Record<string, string | number | boolean | undefined> } };
  };
}

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): HttpResult {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
    body: JSON.stringify(body),
  };
}

/** The request body parsed as JSON, or undefined when it isn't JSON. */
export function jsonBody(event: HttpEvent): unknown {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
