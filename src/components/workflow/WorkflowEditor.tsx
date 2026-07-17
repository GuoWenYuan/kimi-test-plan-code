"use client";

import { useCallback, useRef, useState } from "react";
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
import { NODE_DEFS, type NodeKind } from "./nodeDefs";

const nodeTypes = { work: WorkNodeView };

const STORAGE_KEY = "workbench.workflow.v1";

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

function loadGraph(): { nodes: WorkNode[]; edges: Edge[] } {
  if (typeof window === "undefined") return { nodes: DEFAULT_NODES, edges: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        return { nodes: parsed.nodes, edges: parsed.edges ?? [] };
      }
    }
  } catch {
    // 数据损坏时回退到默认图
  }
  return { nodes: DEFAULT_NODES, edges: [] };
}

function EditorCanvas() {
  const initial = useRef(loadGraph());
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkNodeData>>(initial.current.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.current.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const idRef = useRef(1);
  const { screenToFlowPosition } = useReactFlow();

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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/workbench-node") as NodeKind;
      if (!kind || !NODE_DEFS[kind]) return;
      addNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNode, screenToFlowPosition]
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

  const save = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
    setSavedAt(new Date().toLocaleTimeString());
  }, [nodes, edges]);

  const reset = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setNodes(DEFAULT_NODES);
    setEdges([]);
    setSelectedId(null);
    setSavedAt(null);
  }, [setNodes, setEdges]);

  const selectedNode = (nodes.find((n) => n.id === selectedId) as WorkNode | undefined) ?? null;

  return (
    <div className="flex h-full">
      <NodePalette onAdd={(kind) => addNode(kind)} />

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
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d4d4d4" />
          <Controls position="bottom-left" />
          <MiniMap position="bottom-right" pannable zoomable className="!h-28 !w-40" />
        </ReactFlow>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {savedAt && <span className="text-xs text-neutral-400">已保存 {savedAt}</span>}
          <button
            onClick={save}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-neutral-700"
          >
            保存
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
