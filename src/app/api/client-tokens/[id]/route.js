import { NextResponse } from "next/server";
import { deleteClientToken, getClientTokenById, updateClientToken } from "@/lib/localDb";

export async function GET(_request, { params }) {
  const { id } = await params;
  const clientToken = await getClientTokenById(id);
  if (!clientToken) return NextResponse.json({ error: "Client token not found" }, { status: 404 });
  return NextResponse.json({ clientToken });
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.isActive !== undefined) updates.isActive = body.isActive === true;
    const clientToken = await updateClientToken(id, updates);
    if (!clientToken) return NextResponse.json({ error: "Client token not found" }, { status: 404 });
    return NextResponse.json({ clientToken });
  } catch (error) {
    const status = error.message === "name is required" ? 400 : 500;
    return NextResponse.json({ error: error.message || "Failed to update client token" }, { status });
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const deleted = await deleteClientToken(id);
  if (!deleted) return NextResponse.json({ error: "Client token not found" }, { status: 404 });
  return NextResponse.json({ message: "Client token deleted" });
}
