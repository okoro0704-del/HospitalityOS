/** Read infrastructure origins at call time so tests can point at disposable servers. */
export function digiCoreBaseUrl() {
  return (process.env.DIGI_CORE_BASE_URL ?? "").replace(/\/$/, "");
}

export function ddiBaseUrl() {
  return (process.env.DDI_BASE_URL ?? "").replace(/\/$/, "");
}

export class InfrastructureError extends Error {
  code: string;
  statusCode: number;
  constructor(code: string, message: string, statusCode = 503) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
