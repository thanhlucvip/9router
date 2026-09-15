"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardSkeleton, ConfirmModal, Input, Modal, Toggle } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useNotificationStore } from "@/store/notificationStore";

function providerLabel(provider) {
  if (!provider) return "Provider";
  return provider.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function accountLabel(account) {
  return account.displayName || account.name || account.email || account.id;
}

export default function ClientRoutingPage() {
  const [clientTokens, setClientTokens] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("codex");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createdToken, setCreatedToken] = useState(null);
  const [tokenSecrets, setTokenSecrets] = useState({});
  const [editingRoute, setEditingRoute] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [renamingToken, setRenamingToken] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [saving, setSaving] = useState(false);
  const notify = useNotificationStore();
  const { copied, copy } = useCopyToClipboard();

  const fetchData = useCallback(async () => {
    try {
      const [tokensResponse, accountsResponse] = await Promise.all([
        fetch("/api/client-tokens", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
      ]);
      const [tokensData, accountsData] = await Promise.all([tokensResponse.json(), accountsResponse.json()]);
      if (!tokensResponse.ok) throw new Error(tokensData.error || "Failed to fetch client tokens");
      if (!accountsResponse.ok) throw new Error(accountsData.error || "Failed to fetch accounts");
      setClientTokens(tokensData.clientTokens || []);
      setAccounts(accountsData.connections || []);
    } catch (error) {
      notify.error(error.message || "Failed to load client routing");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const providers = useMemo(
    () => Array.from(new Set(accounts.map((account) => account.provider))).sort(),
    [accounts],
  );
  const selectedProvider = providers.includes(provider) ? provider : (providers[0] || "codex");
  const providerAccounts = useMemo(
    () => accounts.filter((account) => account.provider === selectedProvider),
    [accounts, selectedProvider],
  );

  const getBinding = (token) => token.bindings?.find((binding) => binding.provider === selectedProvider && binding.enabled);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/client-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create client token");
      setCreatedToken({ ...data.clientToken, rotated: false });
      setTokenSecrets((current) => ({ ...current, [data.clientToken.id]: data.clientToken.token }));
      setCreateName("");
      setCreateOpen(false);
      await fetchData();
    } catch (error) {
      notify.error(error.message || "Failed to create client token");
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = (token) => setConfirmState({
    title: "Regenerate Client Token",
    message: `Regenerating "${token.name}" immediately invalidates the current token. The new full token will be shown once for copying.`,
    confirmText: "Regenerate",
    onConfirm: async () => {
      setConfirmState(null);
      setSaving(true);
      try {
        const response = await fetch(`/api/client-tokens/${token.id}/rotate`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to regenerate client token");
        setCreatedToken({ ...data.clientToken, rotated: true });
        setTokenSecrets((current) => ({ ...current, [data.clientToken.id]: data.clientToken.token }));
        await fetchData();
      } catch (error) {
        notify.error(error.message || "Failed to regenerate client token");
      } finally {
        setSaving(false);
      }
    },
  });

  const handleRename = async () => {
    if (!renamingToken || !renameValue.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/client-tokens/${renamingToken.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to rename client token");
      setRenamingToken(null);
      await fetchData();
      notify.success("Client token renamed");
    } catch (error) {
      notify.error(error.message || "Failed to rename client token");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (token, isActive) => {
    const response = await fetch(`/api/client-tokens/${token.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      notify.error(data.error || "Failed to update client token");
      return;
    }
    setClientTokens((current) => current.map((item) => item.id === token.id ? { ...item, isActive } : item));
  };

  const openRouteEditor = (token) => {
    const binding = getBinding(token);
    setEditingRoute(token);
    setSelectedAccountId(binding?.accountId || "");
  };

  const handleSaveRoute = async () => {
    if (!editingRoute) return;
    setSaving(true);
    try {
      const endpoint = `/api/client-tokens/${editingRoute.id}/bindings/${selectedProvider}`;
      const response = await fetch(endpoint, selectedAccountId ? {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selectedAccountId }),
      } : { method: "DELETE" });
      if (!response.ok && !(response.status === 404 && !selectedAccountId)) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update route");
      }
      setEditingRoute(null);
      await fetchData();
      notify.success(selectedAccountId ? "Client route updated" : "Client now uses legacy routing");
    } catch (error) {
      notify.error(error.message || "Failed to update route");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (token) => setConfirmState({
    title: "Delete Client Token",
    message: `Delete client token "${token.name}"? Its provider bindings will also be removed.`,
    onConfirm: async () => {
      setConfirmState(null);
      const response = await fetch(`/api/client-tokens/${token.id}`, { method: "DELETE" });
      if (response.ok) {
        setClientTokens((current) => current.filter((item) => item.id !== token.id));
        notify.success("Client token deleted");
      } else {
        notify.error("Failed to delete client token");
      }
    },
  });

  if (loading) {
    return <div className="mx-auto flex w-full max-w-6xl flex-col gap-6"><CardSkeleton /><CardSkeleton /></div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-main">Client Routing</h1>
          <p className="mt-1 text-sm text-text-muted">Keep one VSCode token and switch its provider account here.</p>
        </div>
        <Button icon="add" onClick={() => setCreateOpen(true)}>Create Client Token</Button>
      </div>

      <Card>
        <div className="mb-5 flex flex-col gap-3 border-b border-border-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold text-text-main">Account affinity</h2>
            <p className="mt-1 text-sm text-text-muted">Bound clients never fall back to another account.</p>
          </div>
          <label className="flex min-w-52 flex-col gap-1.5 text-sm font-medium">
            Provider
            <select
              value={selectedProvider}
              onChange={(event) => setProvider(event.target.value)}
              className="rounded-[10px] border border-transparent bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
            >
              {providers.map((item) => <option key={item} value={item}>{providerLabel(item)}</option>)}
              {providers.length === 0 && <option value="codex">Codex</option>}
            </select>
          </label>
        </div>

        {clientTokens.length === 0 ? (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined text-5xl text-primary/30">route</span>
            <p className="mt-3 font-medium">No client tokens yet</p>
            <p className="mt-1 text-sm text-text-muted">Create one for each VSCode machine.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Token</th>
                  <th className="px-3 py-3 font-medium">Provider</th>
                  <th className="px-3 py-3 font-medium">Assigned account</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clientTokens.map((token) => {
                  const binding = getBinding(token);
                  const account = providerAccounts.find((item) => item.id === binding?.accountId);
                  return (
                    <tr key={token.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-3 py-4 font-medium text-text-main">{token.name}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-text-muted">{token.tokenPrefix}</span>
                          <button
                            type="button"
                            onClick={() => tokenSecrets[token.id]
                              ? copy(tokenSecrets[token.id], `client-token-${token.id}`)
                              : handleRotate(token)}
                            className="rounded p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-primary"
                            title={tokenSecrets[token.id] ? "Copy full token" : "Regenerate token to copy the full value"}
                            aria-label={tokenSecrets[token.id] ? `Copy full token for ${token.name}` : `Regenerate token for ${token.name}`}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {copied === `client-token-${token.id}` ? "check" : tokenSecrets[token.id] ? "content_copy" : "key"}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-4">{providerLabel(selectedProvider)}</td>
                      <td className="px-3 py-4">
                        {binding ? (
                          <div>
                            <p className="font-medium">{account ? accountLabel(account) : binding.account?.name || binding.accountId}</p>
                            {account?.isActive === false && <p className="text-xs text-red-500">Account disabled</p>}
                          </div>
                        ) : <span className="text-text-muted">Legacy routing</span>}
                      </td>
                      <td className="px-3 py-4">
                        <Badge variant={token.isActive ? "success" : "default"} size="sm">{token.isActive ? "Active" : "Disabled"}</Badge>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Toggle size="sm" checked={token.isActive} onChange={(value) => handleToggle(token, value)} />
                          <button onClick={() => openRouteEditor(token)} className="rounded-lg p-2 text-text-muted hover:bg-surface-2 hover:text-primary" title="Edit route">
                            <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                          </button>
                          <button onClick={() => { setRenamingToken(token); setRenameValue(token.name); }} className="rounded-lg p-2 text-text-muted hover:bg-surface-2 hover:text-primary" title="Rename">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button onClick={() => handleDelete(token)} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10" title="Delete">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Full tokens are never stored. For an existing token, use the key icon to invalidate it and generate a new copyable token.
            </p>
          </>
        )}
      </Card>

      <Modal isOpen={createOpen} title="Create Client Token" onClose={() => setCreateOpen(false)}>
        <div className="flex flex-col gap-4">
          <Input label="Name" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="PC Office 1" autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleCreate} loading={saving} disabled={!createName.trim()}>Create</Button>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(createdToken)}
        title={createdToken?.rotated ? "Client Token Regenerated" : "Client Token Created"}
        onClose={() => setCreatedToken(null)}
        closeOnOverlay={false}
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            {createdToken?.rotated ? "The previous token is no longer valid. " : "This token is shown once. "}
            Copy the full token now; only its SHA-256 hash is stored.
          </div>
          <div className="flex gap-2">
            <Input value={createdToken?.token || ""} readOnly className="flex-1" inputClassName="font-mono" />
            <Button variant="secondary" icon={copied === "client-token" ? "check" : "content_copy"} onClick={() => copy(createdToken?.token || "", "client-token")}>
              {copied === "client-token" ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setCreatedToken(null)}>Done</Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(editingRoute)} title="Edit Client Routing" onClose={() => setEditingRoute(null)}>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-surface-2 p-4 text-sm">
            <p className="font-medium">{editingRoute?.name}</p>
            <p className="mt-1 font-mono text-xs text-text-muted">{editingRoute?.tokenPrefix}</p>
            <p className="mt-2 text-text-muted">Provider: {providerLabel(selectedProvider)}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Assigned account
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="rounded-[10px] border border-transparent bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand-500/40 focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="">No binding (legacy routing)</option>
              {providerAccounts.map((account) => (
                <option key={account.id} value={account.id}>{accountLabel(account)}{account.isActive === false ? " (disabled)" : ""}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text-muted">Changes apply to the next request. A bound account error is returned to the client without round-robin fallback.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleSaveRoute} loading={saving}>Save</Button>
            <Button variant="ghost" onClick={() => setEditingRoute(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(renamingToken)} title="Rename Client Token" onClose={() => setRenamingToken(null)}>
        <div className="flex flex-col gap-4">
          <Input label="Name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleRename} loading={saving} disabled={!renameValue.trim()}>Save</Button>
            <Button variant="ghost" onClick={() => setRenamingToken(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(confirmState)}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmText={confirmState?.confirmText}
        loading={saving}
      />
    </div>
  );
}
