import { NextResponse } from "next/server";
import { getClientAccountBindings, getClientTokenById } from "@/lib/localDb";

export async function GET(_request, { params }) {
  const { id } = await params;
  const clientToken = await getClientTokenById(id);
  if (!clientToken) return NextResponse.json({ error: "Client token not found" }, { status: 404 });
  const bindings = await getClientAccountBindings(id);
  return NextResponse.json({ bindings });
}
