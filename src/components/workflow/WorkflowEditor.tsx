"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import WorkNodeView, { type WorkNode, type WorkNodeData } from "./WorkNodeView";
import NodePalette from "./NodePalette";
import ConfigPanel from "./ConfigPanel";
import RunPanel, { type RunLogItem } from "./RunPanel";
import KnowledgePanel from "./KnowledgePanel";
import TemplatesPanel from "./TemplatesPanel";
import AiGeneratePanel from "./AiGeneratePanel";
import { NODE_DEFS, type NodeKind } from "./nodeDefs";
import type { NodeStatus } from "@/lib/workflow-engine";
import type { CustomNodeDef } from "@/lib/custom-nodes-store";

const nodeTypes = { work: WorkNodeView };

const STORAGE_KEY = "workbench.workflow.v1";
const STORAGE_RUN_KEY = "workbench.workflow.run.v1";

function makeNode(kind: NodeKind, position: { x: number; y: number }, id: string): WorkNode {
  return {
    id,
    type: "work",
    position,
    data: { kind, label: NODE_DEFS[kind].title, config: {} },
  };
}

const DEFAULT_NODES: WorkNode[] = [
  makeNode("start", { x: 80, y: 200 }, "start"),
  makeNode("end", { x: 620, y: 200 }, "end"),
];

function loadGraph(): { nodes: WorkNode[]; edges: Edge[]; knowledge: string } {
  if (typeof window === "undefined") return { nodes: DEFAULT_NODES, edges: [], knowledge: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return {
          nodes: parsed.nodes.map((n: WorkNode) =>
            n.data?.runStatus === "running"
              ? { ...n, data: { ...n.data, runStatus: undefined } }
              : n
          ),
          edges: parsed.edges ?? [],
          knowledge: typeof parsed.knowledge === "string" ? parsed.knowledge : "",
        };
      }
    }
  } catch {
    // 数据损坏时回退到默认图
  }
  return { nodes: DEFAULT_NODES, edges: [], knowledge: "" };
}

interface PersistedRun {
  log: RunLogItem[];
  final?: string;
  error?: string;
  success: boolean;
  open: boolean;
  input: string;
}

function loadRun(): PersistedRun {
  const empty: PersistedRun = { log: [], success: false, open: false, input: "" };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_RUN_KEY);
    if (raw) {
      const parsed = { ...empty, ...(JSON.parse(raw) as Partial<PersistedRun>) };
      // 上次若在运行中离开，状态标记为中断而非永远"运行中"
      parsed.log = parsed.log.map((item) =>
        item.result.status === "running"
          ? { ...item, result: { status: "error" as const, error: "页面切换，运行中断" } }
          : item
      );
      return parsed;
    }
  } catch {
    // 数据损坏时忽略
  }
  return empty;
}

function EditorCanvas() {
  const initial = useRef(loadGraph());
  const initialRun = useRef(loadRun());
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkNodeData>>(initial.current.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.current.edges);
  const [knowledge, setKnowledge] = useState(initial.current.knowledge);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(initialRun.current.open);
  const [runInput, setRunInput] = useState(initialRun.current.input);
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState<RunLogItem[]>(initialRun.current.log);
  const [runFinal, setRunFinal] = useState<string | undefined>(initialRun.current.final);
  const [runError, setRunError] = useState<string | undefined>(initialRun.current.error);
  const [runSuccess, setRunSuccess] = useState(initialRun.current.success);
  const [streamText, setStreamText] = useState<Record<string, string>>({});
  const idRef = useRef(1);
  const { screenToFlowPosition } = useReactFlow();

  // 运行状态持久化：切换页面后回来可恢复运行结果
  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_RUN_KEY,
      JSON.stringify({ log: runLog, final: runFinal, error: runError, success: runSuccess, open: runOpen, input: runInput } satisfies PersistedRun)
    );
  }, [runLog, runFinal, runError, runSuccess, runOpen, runInput]);

  // 编辑后自动持久化（防抖 500ms），切换页面/刷新不丢
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, knowledge }));
      setSavedAt(new Date().toLocaleTimeString());
    }, 500);
    return () => clearTimeout(t);
  }, [nodes, edges, knowledge]);

  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, animated: false }, eds)),
    [setEdges]
  );

  const addNode = useCallback(
    (kind: NodeKind, position?: { x: number; y: number }) => {
      const pos =
        position ??
        screenToFlowPosition({
          x: window.innerWidth / 2 + (idRef.current % 5) * 30,
          y: window.innerHeight / 2 + (idRef.current % 5) * 30,
        });
      const id = `${kind}-${Date.now().toString(36)}-${idRef.current++}`;
      setNodes((nds) => [...nds, makeNode(kind, pos, id)]);
    },
    [screenToFlowPosition, setNodes]
  );

  // 自定义节点定义（供拖放解析与添加）
  const [customDefs, setCustomDefs] = useState<CustomNodeDef[]>([]);
  useEffect(() => {
    fetch("/api/custom-nodes")
      .then((r) => r.json())
      .then((data) => setCustomDefs(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const addCustomNode = useCallback(
    (def: CustomNodeDef, position?: { x: number; y: number }) => {
      const pos =
        position ??
        screenToFlowPosition({
          x: window.innerWidth / 2 + (idRef.current % 5) * 30,
          y: window.innerHeight / 2 + (idRef.current % 5) * 30,
        });
      const id = `custom-${Date.now().toString(36)}-${idRef.current++}`;
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "work",
          position: pos,
          data: { kind: "custom", label: def.name, config: { customId: def.id }, description: def.description },
        },
      ]);
    },
    [screenToFlowPosition, setNodes]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const payload = e.dataTransfer.getData("application/workbench-node");
      if (!payload) return;
      if (payload.startsWith("custom:")) {
        const def = customDefs.find((d) => d.id === payload.slice(7));
        if (def) addCustomNode(def, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        return;
      }
      const kind = payload as NodeKind;
      if (!NODE_DEFS[kind]) return;
      addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNode, addCustomNode, customDefs, screenToFlowPosition]
  );

  const updateNode = useCallback(
    (id: string, patch: { label?: string; config?: Record<string, string> }) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
        )
      );
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId((sel) => (sel === id ? null : sel));
    },
    [setNodes, setEdges]
  );

  const reset = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setNodes(DEFAULT_NODES);
    setEdges([]);
    setKnowledge("");
    setSelectedId(null);
    setSavedAt(null);
  }, [setNodes, setEdges]);

  const importGraph = useCallback(
    (graph: { nodes: unknown[]; edges: unknown[]; knowledge: string }) => {
      const ns = graph.nodes as WorkNode[];
      const es = graph.edges as Edge[];
      const kn = graph.knowledge ?? "";
      setNodes(ns);
      setEdges(es);
      setKnowledge(kn);
      setSelectedId(null);
      setTemplatesOpen(false);
      setAiOpen(false);
      // 导入后立即持久化，刷新不丢失
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: ns, edges: es, knowledge: kn }));
    },
    [setNodes, setEdges]
  );

  /** AI 生成完成：应用画布；有标签时同时存为模板 */
  const applyGenerated = useCallback(
    (graph: { nodes: unknown[]; edges: unknown[] }, tag: string) => {
      importGraph({ nodes: graph.nodes, edges: graph.edges, knowledge });
      if (tag) {
        fetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `AI 生成 ${new Date().toLocaleString()}`,
            tag,
            graph: { nodes: graph.nodes, edges: graph.edges, knowledge },
          }),
        }).catch(() => {});
      }
    },
    [importGraph, knowledge]
  );

  const clearRun = useCallback(() => {
    setRunLog([]);
    setRunFinal(undefined);
    setRunError(undefined);
    setRunSuccess(false);
    setStreamText({});
    window.localStorage.removeItem(STORAGE_RUN_KEY);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, runStatus: undefined } })));
  }, [setNodes]);

  const run = useCallback(async () => {
    setRunning(true);
    setRunError(undefined);
    setRunFinal(undefined);
    setRunSuccess(false);
    setRunLog([]);
    setStreamText({});
    setSelectedId(null);
    try {
      const res = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: runInput,
          knowledge,
          nodes: nodes.map((n) => ({ id: n.id, data: n.data })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
          })),
        }),
      });
      if (!res.ok || !res.body) {
        setRunError((await res.json().catch(() => ({}))).error ?? "运行失败");
        return;
      }

      // 解析 SSE 流，逐事件更新界面
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (e: {
        type: string;
        nodeId?: string;
        label?: string;
        delta?: string;
        result?: { status: NodeStatus; output?: string; error?: string };
        results?: Record<string, NodeStatus>;
        finalOutput?: string;
        error?: string;
      }) => {
        if (e.type === "node_start" && e.nodeId) {
          const id = e.nodeId;
          setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, runStatus: "running" as const } } : n)));
          setRunLog((log) => [...log, { nodeId: id, label: e.label ?? id, result: { status: "running" } }]);
        } else if (e.type === "node_delta" && e.nodeId && e.delta) {
          const id = e.nodeId;
          setStreamText((m) => ({ ...m, [id]: (m[id] ?? "") + e.delta }));
        } else if (e.type === "node_end" && e.nodeId && e.result) {
          const id = e.nodeId;
          const result = e.result;
          setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, runStatus: result.status as WorkNodeData["runStatus"] } } : n)));
          setRunLog((log) => log.map((item) => (item.nodeId === id ? { ...item, result } : item)));
          setStreamText((m) => {
            const next = { ...m };
            delete next[id];
            return next;
          });
        } else if (e.type === "done") {
          setRunFinal(e.finalOutput);
          const hasError = Object.values(e.results ?? {}).some((s) => s === "error");
          setRunSuccess(!hasError);
        } else if (e.type === "fatal") {
          setRunError(e.error ?? "运行失败");
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          try {
            handle(JSON.parse(line.slice(5)));
          } catch {
            // 忽略无法解析的事件
          }
        }
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [nodes, edges, runInput, knowledge, setNodes]);

  const selectedNode = (nodes.find((n) => n.id === selectedId) as WorkNode | undefined) ?? null;

  return (
    <div className="flex h-full">
      <NodePalette onAdd={(kind) => addNode(kind)} onAddCustom={(def) => addCustomNode(def)} />

      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
          deleteKeyCode={["Backspace", "Delete"]}
          connectionRadius={40}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d4d4d4" />
          <Controls position="bottom-left" />
          <MiniMap position="bottom-right" pannable zoomable className="!h-28 !w-40" />
        </ReactFlow>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {savedAt && <span className="text-xs text-neutral-400">已自动保存 {savedAt}</span>}
          <button
            onClick={() => setRunOpen((v) => !v)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500"
          >
            ▶ 试运行
          </button>
          <button
            onClick={() => setAiOpen((v) => !v)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            ✨ AI 生成
          </button>
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            📦 模板
          </button>
          <button
            onClick={() => setKnowledgeOpen((v) => !v)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            📚 知识库
          </button>
          <button
            onClick={reset}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            重置
          </button>
        </div>
      </div>

      {selectedNode && (
        <ConfigPanel
          node={selectedNode}
          onChange={updateNode}
          onDelete={deleteNode}
          onClose={() => setSelectedId(null)}
        />
      )}

      {runOpen && !selectedNode && (
        <RunPanel
          running={running}
          input={runInput}
          onInputChange={setRunInput}
          onRun={run}
          log={runLog}
          streamText={streamText}
          finalOutput={runFinal}
          success={runSuccess}
          error={runError}
          onClear={clearRun}
          onClose={() => setRunOpen(false)}
        />
      )}

      {knowledgeOpen && !selectedNode && !runOpen && !templatesOpen && !aiOpen && (
        <KnowledgePanel
          value={knowledge}
          onChange={setKnowledge}
          onClose={() => setKnowledgeOpen(false)}
        />
      )}

      {templatesOpen && !selectedNode && !runOpen && !knowledgeOpen && !aiOpen && (
        <TemplatesPanel
          getGraph={() => ({ nodes, edges, knowledge })}
          onImport={importGraph}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {aiOpen && !selectedNode && !runOpen && !knowledgeOpen && !templatesOpen && (
        <AiGeneratePanel onApply={applyGenerated} onClose={() => setAiOpen(false)} />
      )}
    </div>
  );
}

export default function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
