"use client";

import { CREATABLE_NODES, type NodeKind } from "./nodeDefs";

interface Props {
  onAdd: (kind: NodeKind) => void;
}

export default function NodePalette({ onAdd }: Props) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-4 py-3 text-xs font-medium text-neutral-500">
        添加节点（点击或拖入画布）
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {CREATABLE_NODES.map((def) => (
          <button
            key={def.kind}
            onClick={() => onAdd(def.kind)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/workbench-node", def.kind);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex w-full cursor-grab items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-neutral-100 active:cursor-grabbing"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm text-white ${def.color}`}
            >
              {def.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-neutral-800">
                {def.title}
              </span>
              <span className="block truncate text-xs text-neutral-400">
                {def.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
