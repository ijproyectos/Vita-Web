import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  // scope "local": only ends this device's session. The default ("global")
  // revokes every session of the user, logging them out of all devices.
  await supabase.auth.signOut({ scope: "local" });

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
