"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  BaseEdge,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Card from "@/shared/components/Card";
import ProviderIcon from "@/shared/components/ProviderIcon";

const CODEX_PROVIDER = "codex";
const REFRESH_INTERVAL_MS = 30_000;
const UNASSIGNED_ACCOUNT_ID = "__unassigned_codex_account__";

function getAccountLabel(account, binding) {
  return account?.displayName
    || account?.name
    || account?.email
    || binding?.account?.name
    || binding?.accountId
    || "Unknown Codex account";
}

function getAccountSecondaryLabel(account, binding) {
  const label = getAccountLabel(account, binding);
  const secondary = account?.email || account?.displayName || binding?.account?.name;
  return secondary && secondary !== label ? secondary : null;
}

function getStatus(row) {
  if (!row.binding) return { label: "Not assigned", tone: "muted", dot: "#64748b" };
  if (row.token.isActive === false) return { label: "API key disabled", tone: "muted", dot: "#64748b" };
  if (row.account?.isActive === false) return { label: "Account disabled", tone: "danger", dot: "#ef4444" };
  if (row.activeCount > 0) return { label: "In use", tone: "success", dot: "#34d399" };
  return { label: "Ready", tone: "primary", dot: "#60a5fa" };
}

const STATUS_TONE_CLASSES = {
  muted: "border-border-subtle bg-surface-2 text-text-muted",
  danger: "border-red-500/20 bg-red-500/10 text-red-400",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  primary: "border-primary/20 bg-primary/10 text-primary",
};

function NodeHandle({ type, position }) {
  return (
    <Handle
      type={type}
      position={position}
      className="!h-1.5 !w-1.5 !border-0 !bg-border-subtle"
    />
  );
}

NodeHandle.propTypes = {
  type: PropTypes.string.isRequired,
  position: PropTypes.string.isRequired,
};

function ApiKeyNode({ data }) {
  const status = data.status;
  return (
    <div
      className={`relative w-[228px] rounded-xl border bg-bg px-3 py-2.5 shadow-sm transition-all ${
        status.tone === "success"
          ? "border-emerald-400/80 shadow-emerald-500/20 shadow-lg"
          : status.tone === "danger"
            ? "border-red-400/60"
            : "border-border"
      }`}
    >
      <NodeHandle type="source" position={Position.Right} />
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[18px] text-primary"
          aria-hidden="true"
        >
          key
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-main" title={data.name}>{data.name}</p>
          <p className="truncate font-mono text-[10px] text-text-muted" title={data.prefix}>{data.prefix}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE_CLASSES[status.tone]}`}>
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${status.tone === "success" ? "animate-pulse" : ""}`} style={{ backgroundColor: status.dot }} />
            {status.label}
          </span>
        </span>
      </div>
      {data.activeCount > 0 && (
        <p className="mt-1.5 pl-10 text-[10px] text-emerald-400">{data.activeCount} active request{data.activeCount === 1 ? "" : "s"}</p>
      )}
    </div>
  );
}

ApiKeyNode.propTypes = { data: PropTypes.object.isRequired };

function CodexAccountNode({ data }) {
  const isUnassigned = data.id === UNASSIGNED_ACCOUNT_ID;
  const linkedInUse = data.inUseCount > 0;
  return (
    <div
      className={`relative w-[250px] rounded-xl border bg-bg px-3 py-3 shadow-sm transition-all ${
        isUnassigned
          ? "border-border-subtle border-dashed"
          : linkedInUse
            ? "border-emerald-400/70 shadow-emerald-500/15 shadow-lg"
            : data.account?.isActive === false
              ? "border-red-400/60"
              : "border-border"
      }`}
    >
      <NodeHandle type="target" position={Position.Left} />
      <div className="flex min-w-0 items-center gap-2.5">
        <ProviderIcon
          src="/providers/codex.png"
          alt="Codex"
          size={32}
          className="size-8 shrink-0 rounded-lg object-contain"
          fallbackText="CX"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-main" title={data.label}>{data.label}</p>
          {data.secondary && <p className="truncate text-[10px] text-text-muted" title={data.secondary}>{data.secondary}</p>}
        </div>
        {linkedInUse && (
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative size-2.5 rounded-full bg-emerald-400" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
        <span>{data.tokenCount} API key{data.tokenCount === 1 ? "" : "s"} linked</span>
        {data.inUseCount > 0 && <span className="font-semibold text-emerald-400">{data.inUseCount} in use</span>}
      </div>
    </div>
  );
}

CodexAccountNode.propTypes = { data: PropTypes.object.isRequired };

function RoutingEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data }) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const active = data?.active;
  return (
    <g>
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, strokeWidth: active ? 2.8 : 1.5, strokeDasharray: active ? "none" : "5 5" }}
      />
      {active && (
        <circle r="3.5" fill="#34d399" style={{ filter: "drop-shadow(0 0 4px #34d399)" }}>
          <animateMotion dur="1.15s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </g>
  );
}

RoutingEdge.propTypes = {
  id: PropTypes.string,
  sourceX: PropTypes.number,
  sourceY: PropTypes.number,
  targetX: PropTypes.number,
  targetY: PropTypes.number,
  sourcePosition: PropTypes.string,
  targetPosition: PropTypes.string,
  style: PropTypes.object,
  data: PropTypes.object,
};

const nodeTypes = { apiKey: ApiKeyNode, codexAccount: CodexAccountNode };
const edgeTypes = { routing: RoutingEdge };

function buildGraph(rows, accounts) {
  const groups = new Map();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  rows.forEach((row, index) => {
    const accountId = row.binding?.accountId || UNASSIGNED_ACCOUNT_ID;
    if (!groups.has(accountId)) groups.set(accountId, []);
    groups.get(accountId).push({ ...row, index });
  });

  const tokenGap = 102;
  const accountGap = 132;
  const tokenX = 36;
  const accountX = 430;
  const nodes = [];
  const edges = [];
  const tokenY = new Map();

  rows.forEach((row, index) => {
    const y = 30 + index * tokenGap;
    tokenY.set(row.token.id, y);
    const status = getStatus(row);
    nodes.push({
      id: `token-${row.token.id}`,
      type: "apiKey",
      position: { x: tokenX, y },
      data: {
        name: row.token.name || "Unnamed API key",
        prefix: row.token.tokenPrefix || row.token.id,
        status,
        activeCount: row.activeCount,
      },
      draggable: false,
    });
  });

  const accountPositions = [];
  [...groups.entries()].forEach(([accountId, group], groupIndex) => {
    const account = accountMap.get(accountId) || null;
    const isUnassigned = accountId === UNASSIGNED_ACCOUNT_ID;
    const label = isUnassigned ? "No Codex account linked" : getAccountLabel(account, group[0]?.binding);
    const secondary = isUnassigned ? "Assign this key in Quota Tracker" : getAccountSecondaryLabel(account, group[0]?.binding);
    const desiredY = group.length
      ? group.reduce((sum, row) => sum + (tokenY.get(row.token.id) || 30), 0) / group.length
      : 30 + rows.length * tokenGap + groupIndex * accountGap;
    const previous = accountPositions[accountPositions.length - 1];
    const y = Math.max(desiredY, previous ? previous.y + accountGap : 30);
    const inUseCount = group.filter((row) => row.activeCount > 0).length;
    accountPositions.push({ accountId, y });
    nodes.push({
      id: `account-${accountId}`,
      type: "codexAccount",
      position: { x: accountX, y },
      data: {
        id: accountId,
        account,
        label,
        secondary,
        tokenCount: group.length,
        inUseCount,
      },
      draggable: false,
    });

    group.forEach((row) => {
      const status = getStatus(row);
      edges.push({
        id: `edge-${row.token.id}`,
        type: "routing",
        source: `token-${row.token.id}`,
        target: `account-${accountId}`,
        data: { active: status.tone === "success" },
        style: {
          stroke: status.tone === "success" ? "#34d399" : status.tone === "danger" ? "#ef4444" : status.tone === "primary" ? "#60a5fa" : "#64748b",
          opacity: status.tone === "muted" ? 0.45 : 0.85,
        },
      });
    });
  });

  return { nodes, edges, height: Math.max(390, Math.min(780, 120 + Math.max(rows.length, groups.size) * 102)) };
}

export default function ClientApiKeyStatus({ activeRequests = [], activeClientTokens = [] }) {
  const [tokens, setTokens] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rfInstance = useRef(null);
  const containerRef = useRef(null);

  const loadBindings = useCallback(async () => {
    try {
      const [tokensResponse, accountsResponse] = await Promise.all([
        fetch("/api/client-tokens", { cache: "no-store" }),
        fetch("/api/providers/client?provider=codex&page=1&pageSize=500&accountStatus=all", { cache: "no-store" }),
      ]);
      const [tokensData, accountsData] = await Promise.all([
        tokensResponse.json().catch(() => ({})),
        accountsResponse.json().catch(() => ({})),
      ]);
      if (!tokensResponse.ok) throw new Error(tokensData.error || "Failed to load API key bindings");
      if (!accountsResponse.ok) throw new Error(accountsData.error || "Failed to load Codex accounts");
      setTokens(Array.isArray(tokensData.clientTokens) ? tokensData.clientTokens : []);
      setAccounts(Array.isArray(accountsData.connections) ? accountsData.connections : []);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Failed to load API key bindings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await loadBindings();
    };
    run();
    const timer = setInterval(run, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadBindings]);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const activeByToken = useMemo(() => {
    const byId = {};
    const requests = activeClientTokens.length ? activeClientTokens : activeRequests;
    for (const request of requests) {
      if (request.provider?.toLowerCase() !== CODEX_PROVIDER || !request.clientTokenId) continue;
      byId[request.clientTokenId] = (byId[request.clientTokenId] || 0) + (request.count || 1);
    }
    return byId;
  }, [activeClientTokens, activeRequests]);

  const rows = useMemo(() => tokens
    .map((token) => {
      const binding = token.bindings?.find((item) => item.provider === CODEX_PROVIDER && item.enabled) || null;
      const account = binding ? (accountMap.get(binding.accountId) || binding.account || null) : null;
      return { token, binding, account, activeCount: activeByToken[token.id] || 0 };
    })
    .sort((a, b) => {
      const activeOrder = Number(b.activeCount > 0) - Number(a.activeCount > 0);
      if (activeOrder) return activeOrder;
      const assignedOrder = Number(Boolean(b.binding)) - Number(Boolean(a.binding));
      if (assignedOrder) return assignedOrder;
      return (a.token.name || "").localeCompare(b.token.name || "");
    }), [accountMap, activeByToken, tokens]);

  const graph = useMemo(() => buildGraph(rows, accounts), [accounts, rows]);

  useEffect(() => {
    if (rfInstance.current) {
      const id = setTimeout(() => rfInstance.current.fitView({ padding: 0.18, duration: 180 }), 40);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [graph.nodes.length, graph.edges.length]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => rfInstance.current?.fitView({ padding: 0.18, duration: 180 }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Card padding="none" className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-primary">account_tree</span>
            <h3 className="text-sm font-semibold text-text-main">API Key Routing</h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">Each API key is shown as its own link, so keys sharing one Codex account keep independent live status.</p>
        </div>
        <button
          type="button"
          onClick={loadBindings}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          title="Refresh API key routing"
        >
          <span className={`material-symbols-outlined text-[16px] ${loading ? "animate-spin" : ""}`}>refresh</span>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-text-muted">
          <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
          Loading API key routing...
        </div>
      ) : error ? (
        <div className="m-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-text-muted">No client API keys found. Create one in Client Routing to track its Codex account.</div>
      ) : (
        <div ref={containerRef} className="relative w-full border-b border-border-subtle bg-bg-subtle/30" style={{ height: graph.height }}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.18, duration: 180 }}
            minZoom={0.2}
            maxZoom={1.6}
            onInit={(instance) => {
              rfInstance.current = instance;
              setTimeout(() => instance.fitView({ padding: 0.18, duration: 180 }), 50);
            }}
            proOptions={{ hideAttribution: true }}
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick
            preventScrolling={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background variant={BackgroundVariant.Lines} gap={34} size={1} color="var(--color-border)" />
            <Controls showInteractive={false} className="react-flow-controls-custom" />
          </ReactFlow>
          <div className="pointer-events-none absolute left-4 top-3 z-10 rounded-md bg-bg/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted backdrop-blur-sm">Client API keys</div>
          <div className="pointer-events-none absolute right-4 top-3 z-10 rounded-md bg-bg/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted backdrop-blur-sm">Codex accounts</div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" /> In use</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" /> Ready</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-text-muted" /> Not assigned / disabled</span>
        <span className="ml-auto">Bindings refresh automatically every 30s.</span>
      </div>
    </Card>
  );
}

ClientApiKeyStatus.propTypes = {
  activeRequests: PropTypes.arrayOf(PropTypes.object),
  activeClientTokens: PropTypes.arrayOf(PropTypes.object),
};
