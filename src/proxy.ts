import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 乐观检查（Next.js 16 中 middleware 已更名为 proxy，仅支持 Node.js runtime）：
 * 只判断 session cookie 是否存在，真正的 session 校验在各页面与 Route Handler 内完成。
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has("session");

  if (pathname.startsWith("/login")) {
    // 已持有 cookie 的用户访问登录页时，交给登录页自身做有效性强校验后跳转
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
