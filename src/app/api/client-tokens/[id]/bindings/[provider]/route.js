import { NextResponse } from "next/server";
import { deleteClientAccountBinding, getClientAccountBinding, setClientAccountBinding } from "@/lib/localDb";
import { resolveProviderId } from "@/shared/constants/providers.js";

export async function PUT(request, { params }) {
  try {
    const { id, provider: providerInput } = await params;
    const provider = resolveProviderId(providerInput);
    const body = await request.json();
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

    const previous = await getClientAccountBinding(id, provider);
    const binding = await setClientAccountBinding(id, provider, accountId);
    console.info("[CLIENT_ROUTING] binding changed", {
      clientTokenId: id,
      provider,
      from: previous?.accountId || null,
      to: accountId,
    });
    return NextResponse.json(binding);
  } catch (error) {
    const message = error.message || "Failed to update binding";
    const status = /not found|does not belong/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request, { params }) {
  const { id, provider: providerInput } = await params;
  const provider = resolveProviderId(providerInput);
  const deleted = await deleteClientAccountBinding(id, provider);
  if (!deleted) return NextResponse.json({ error: "Binding not found" }, { status: 404 });
  console.info("[CLIENT_ROUTING] binding removed", { clientTokenId: id, provider });
  return NextResponse.json({ message: "Binding removed" });
}
