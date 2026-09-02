import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { convertPendingInviteByToken } from "@/lib/invites";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    const callbackUrl = encodeURIComponent(`/api/invite/${token}`);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, req.url),
    );
  }

  const result = await convertPendingInviteByToken(
    session.user.id,
    session.user.email,
    token,
  );

  if (result.status === "invalid") {
    return NextResponse.redirect(
      new URL("/invite-error?reason=invalid", req.url),
    );
  }

  if (result.status === "expired") {
    return NextResponse.redirect(
      new URL("/invite-error?reason=expired", req.url),
    );
  }

  if (result.status === "mismatch") {
    return NextResponse.redirect(
      new URL("/invite-error?reason=mismatch", req.url),
    );
  }

  return NextResponse.redirect(new URL(`/editor/${result.mindMapId}`, req.url));
}
