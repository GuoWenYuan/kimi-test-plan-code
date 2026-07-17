"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { NODE_DEFS, type NodeKind } from "./nodeDefs";

export type WorkNodeData = {
  kind: NodeKind;
  label: string;
  config: Record<string, string>;
};

export type WorkNode = Node<WorkNodeData, "work">;

export default function WorkNodeView({ data, selected }: NodeProps<WorkNode>) {
  const def = NODE_DEFS[data.kind];
  const isCondition = data.kind === "condition";

  return (
    <div
      className={`w-52 rounded-lg border bg-white shadow-sm transition-shadow ${
        selected ? "border-blue-500 shadow-md" : "border-neutral-200"
      }`}
    >
      {data.kind !== "start" && (
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-neutral-400" />
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
          def.description
        )}
      </div>

      {data.kind !== "end" &&
        (isCondition ? (
          <>
            <Handle
              id="true"
              type="source"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !bg-emerald-500"
              style={{ top: "62%" }}
            />
            <Handle
              id="false"
              type="source"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !bg-rose-500"
              style={{ top: "85%" }}
            />
          </>
        ) : (
          <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-neutral-400" />
        ))}
    </div>
  );
}
