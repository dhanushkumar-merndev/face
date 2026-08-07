import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy (formerly middleware):
 *  - Redirects unauthenticated visitors away from admin pages (checked server-side
 *    again in each route, this is a UX layer).
 *  - Adds security headers.
 * The scan session cookie is HttpOnly and never read here.
 */
const ADMIN_PATH = "/admin";
const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security headers.
  const headers = new Headers(request.headers);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), interest-cohort=()"
  );

  // Admin guard (UX only; real authorization happens in route handlers).
  if (pathname.startsWith(ADMIN_PATH) && !PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    // @supabase/ssr names the cookie `sb-<project-ref>-auth-token`, and chunks
    // it into `...auth-token.0`, `...auth-token.1` once the token gets large.
    // An exact-name lookup never matches, which bounced every signed-in admin
    // straight back to the login page.
    const hasSession = request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/((?!_next/static|_next/image|favicon.ico|mediapipe|models|api).*)"],
};
