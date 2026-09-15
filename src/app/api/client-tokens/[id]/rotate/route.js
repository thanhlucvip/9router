import { NextResponse } from "next/server";
import { rotateClientToken } from "@/lib/localDb";

export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    const clientToken = await rotateClientToken(id);
    if (!clientToken) return NextResponse.json({ error: "Client token not found" }, { status: 404 });
    return NextResponse.json({ clientToken });
  } catch (error) {
    console.error("Error rotating client token:", error);
    return NextResponse.json({ error: "Failed to regenerate client token" }, { status: 500 });
  }
}
