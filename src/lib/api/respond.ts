import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; fieldErrors?: Record<string, string[]> };
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiSuccess<T> = { success: true, data };
  return NextResponse.json(body, init);
}

export function fail(
  code: string,
  message: string,
  status = 400,
  fieldErrors?: Record<string, string[]>
): NextResponse {
  const body: ApiFailure = { success: false, error: { code, message, fieldErrors } };
  return NextResponse.json(body, { status });
}

export function fromZodError(err: ZodError): NextResponse {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fail("validation_error", "Request validation failed.", 422, fieldErrors);
}

export function unauthorized(message = "Unauthorized."): NextResponse {
  return fail("unauthorized", message, 401);
}

export function forbidden(message = "Forbidden."): NextResponse {
  return fail("forbidden", message, 403);
}

export function notFound(message = "Not found."): NextResponse {
  return fail("not_found", message, 404);
}

export function internalError(message = "Something went wrong."): NextResponse {
  return fail("internal_error", message, 500);
}
