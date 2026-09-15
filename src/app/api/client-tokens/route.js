import { NextResponse } from "next/server";
import { createClientToken, getClientAccountBindings, getClientTokens } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokens = await getClientTokens();
    const clientTokens = await Promise.all(tokens.map(async (token) => ({
      ...token,
      bindings: await getClientAccountBindings(token.id),
    })));
    return NextResponse.json({ clientTokens });
  } catch (error) {
    console.error("Error fetching client tokens:", error);
    return NextResponse.json({ error: "Failed to fetch client tokens" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const clientToken = await createClientToken(name);
    return NextResponse.json({ clientToken }, { status: 201 });
  } catch (error) {
    console.error("Error creating client token:", error);
    return NextResponse.json({ error: "Failed to create client token" }, { status: 500 });
  }
}
