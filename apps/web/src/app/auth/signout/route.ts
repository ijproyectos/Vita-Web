import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { origenPublico } from "@/lib/email/origen";

export async function POST() {
  const supabase = await createClient();
  // scope "local": only ends this device's session. The default ("global")
  // revokes every session of the user, logging them out of all devices.
  await supabase.auth.signOut({ scope: "local" });

  // Public origin from the request headers (request.url can carry the
  // internal host behind a proxy or when the server listens on 0.0.0.0).
  return NextResponse.redirect(`${await origenPublico()}/login`, { status: 303 });
}
