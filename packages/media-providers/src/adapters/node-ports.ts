/**
 * Adapter-layer port implementations: Node env access and fetch-backed HTTP.
 * Credential VALUES are read once per call and never logged or persisted.
 */
import type { EnvPort, HttpPort, HttpRequest, HttpResponse } from "../app/ports.js";

export class NodeEnvPort implements EnvPort {
  get(name: string): string | undefined {
    return process.env[name];
  }
}

export class FetchHttpPort implements HttpPort {
  async request(request: HttpRequest): Promise<HttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return { status: response.status, body: await response.text() };
  }
}

export class SystemClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }
}
