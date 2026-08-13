import crypto from "node:crypto";
import { getDb } from "@/lib/db";

/**
 * 远程设备存储（按 userId 隔离，SQLite devices 表）。
 * 每台机器上跑的 tools/workbench-bridge.mjs（device 段）以「设备名」为键心跳上报本机工具清单，
 * /tools 页据此展示远程设备并一键打开工具的完整 Web 界面（地址经 frp 穿透暴露）。
 */

export interface DeviceEndpoint {
  /** 对应 src/lib/ai-tools.ts 里的工具 id（可选，用于 tokenHash 等行为） */
  toolId?: string;
  label: string;
  /** 设备本机的工具端口（agent 探测在线状态用，仅展示） */
  localPort: number;
  /** 经 frp 穿透后的对外访问地址，如 http://<frps>:39101 */
  remoteUrl: string;
  /** 工具访问令牌（可选，如 kimi web 的 token）；存服务端仅返回给本人 */
  token?: string;
  /** 心跳时 agent 探测的本机端口在线状态 */
  online: boolean;
}

export interface Device {
  id: string;
  name: string;
  endpoints: DeviceEndpoint[];
  lastSeen: number;
  createdAt: string;
}

export interface DeviceWithStatus extends Device {
  /** now - lastSeen < 90s 视为在线（agent 心跳间隔 30s） */
  online: boolean;
}

const ONLINE_WINDOW_MS = 90_000;

interface DeviceRow {
  id: string;
  user_id: string;
  name: string;
  endpoints: string;
  last_seen: number;
  created_at: string;
}

function parseEndpoints(json: string): DeviceEndpoint[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as DeviceEndpoint[]) : [];
  } catch {
    return [];
  }
}

function toDevice(r: DeviceRow): Device {
  return {
    id: r.id,
    name: r.name,
    endpoints: parseEndpoints(r.endpoints),
    lastSeen: r.last_seen,
    createdAt: r.created_at,
  };
}

/** 心跳上报：同名设备 upsert（更新 endpoints 与 last_seen），返回设备 */
export function upsertHeartbeat(userId: string, name: string, endpoints: DeviceEndpoint[]): Device {
  const now = Date.now();
  const existing = getDb()
    .prepare("SELECT * FROM devices WHERE user_id = ? AND name = ?")
    .get(userId, name) as unknown as DeviceRow | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE devices SET endpoints = ?, last_seen = ? WHERE id = ?")
      .run(JSON.stringify(endpoints), now, existing.id);
    return { ...toDevice(existing), endpoints, lastSeen: now };
  }
  const device: Device = {
    id: crypto.randomUUID(),
    name,
    endpoints,
    lastSeen: now,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare("INSERT INTO devices (id, user_id, name, endpoints, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(device.id, userId, device.name, JSON.stringify(endpoints), device.lastSeen, device.createdAt);
  return device;
}

/** 列出本人设备（按最后心跳倒序），附带在线状态 */
export function listDevices(userId: string): DeviceWithStatus[] {
  const rows = getDb()
    .prepare("SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC")
    .all(userId) as unknown as DeviceRow[];
  const now = Date.now();
  return rows.map((r) => ({ ...toDevice(r), online: now - r.last_seen < ONLINE_WINDOW_MS }));
}

export function deleteDevice(userId: string, id: string): boolean {
  const result = getDb().prepare("DELETE FROM devices WHERE user_id = ? AND id = ?").run(userId, id);
  return result.changes > 0;
}
