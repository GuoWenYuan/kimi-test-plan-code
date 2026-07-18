"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { NODE_DEFS, type NodeKind } from "./nodeDefs";

export type WorkNodeData = {
  kind: NodeKind;
  label: string;
  config: Record<string, string>;
  /** 自定义节点的描述（来自节点定义） */
  description?: string;
  /** 最近一次运行的状态，用于节点高亮 */
  runStatus?: "running" | "success" | "error" | "skipped";
};

export type WorkNode = Node<WorkNodeData, "work">;

const RUN_STYLE: Record<NonNullable<WorkNodeData["runStatus"]>, string> = {
  running: "border-blue-400 shadow-md animate-pulse",
  success: "border-emerald-500 shadow-md",
  error: "border-rose-500 shadow-md",
  skipped: "border-neutral-200 opacity-50",
};

export default function WorkNodeView({ data, selected }: NodeProps<WorkNode>) {
  const def = NODE_DEFS[data.kind];
  const isCondition = data.kind === "condition";

  return (
    <div
      className={`w-52 rounded-lg border bg-white shadow-sm transition-shadow ${
        data.runStatus
          ? RUN_STYLE[data.runStatus]
          : selected
            ? "border-blue-500 shadow-md"
            : "border-neutral-200"
      }`}
    >
      {data.kind !== "start" && (
        <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !bg-neutral-400" />
      )}

      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded text-xs text-white ${def.color}`}
        >
          {def.icon}
        </span>
        <span className="truncate text-sm font-medium text-neutral-800">
          {data.label}
        </span>
        {data.runStatus && (
          <span className="ml-auto text-xs">
            {data.runStatus === "success"
              ? "✅"
              : data.runStatus === "error"
                ? "❌"
                : data.runStatus === "running"
                  ? "⏳"
                  : "⏭️"}
          </span>
        )}
      </div>

      <div className="px-3 py-2 text-xs text-neutral-400">
        {isCondition ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span>如果</span>
            </div>
            <div className="flex items-center justify-between">
              <span>否则</span>
            </div>
          </div>
        ) : (
          data.description ?? def.description
        )}
      </div>

      {data.kind !== "end" &&
        (isCondition ? (
          <>
            <Handle
              id="true"
              type="source"
              position={Position.Right}
              className="!h-3.5 !w-3.5 !bg-emerald-500"
              style={{ top: "62%" }}
            />
            <Handle
              id="false"
              type="source"
              position={Position.Right}
              className="!h-3.5 !w-3.5 !bg-rose-500"
              style={{ top: "85%" }}
            />
          </>
        ) : (
          <Handle type="source" position={Position.Right} className="!h-3.5 !w-3.5 !bg-neutral-400" />
        ))}
    </div>
  );
}
