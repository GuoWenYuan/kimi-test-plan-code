import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ModelPreset } from "@/lib/models-store";
import { acquirePetBusy } from "@/lib/pet-busy";
import { runPiChat, runPiChatCollect, type PiChatEvent } from "@/lib/pi-runner";
import {
  addMemory,
  ensureChatSessionId,
  listMemories,
  type Pet,
} from "@/lib/pet-store";

/**
 * 宠物聊天：每只宠物有独立工作区（data/pets/<id>/workspace）与 pi 会话，
 * 人设 + 长期记忆随每轮消息注入；用户说"记住…"时调用 PIAgent 精简后写入 pet_memories。
 */

/** 下发给前端的事件 = pi 事件 + 记忆写入通知 */
export type PetChatEvent = PiChatEvent | { type: "memory_saved"; text: string };

/** 宠物工作区（pi 的 cwd，"做事"产生的文件都隔离在这里） */
export function petWorkspaceDir(petId: string): string {
  return path.join(process.cwd(), "data", "pets", petId, "workspace");
}

/** 宠物外观资源目录（/api/pets/[id]/assets 读写） */
export function petAssetsDir(petId: string): string {
  return path.join(process.cwd(), "data", "pets", petId, "assets");
}

/**
 * 删除 pi-service 侧缓存的某会话历史文件，返回删除条数。
 * pi 按 cwd 分组归档 session（文件名为 <时间戳>_<sessionId>.jsonl），存于其
 * AGENT_DIR/sessions 下——compose 里该目录（./data/pi-agent）与本应用 ./data 同卷，
 * 故可直接按文件名后缀匹配删除；目录清空后顺手移除。
 */
export function deletePiSessionFiles(sessionId: string): number {
  const root = path.join(process.cwd(), "data", "pi-agent", "sessions");
  let groups: string[];
  try {
    groups = fs.readdirSync(root);
  } catch {
    return 0; // sessions 目录不存在（如本地开发未跑过 pi）
  }
  let removed = 0;
  for (const g of groups) {
    const dir = path.join(root, g);
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(`_${sessionId}.jsonl`)) continue;
      try {
        fs.unlinkSync(path.join(dir, f));
        removed++;
      } catch {
        /* 删除失败不影响整体 */
      }
    }
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      /* 忽略 */
    }
  }
  return removed;
}

/** 用户消息中的"记住"意图 */
const REMEMBER_RE = /记住|记得|别忘|remember/i;

/** 拼装人设 + 记忆的前缀，加在用户消息前一起发给 pi */
export function buildPetMessage(pet: Pet, userMessage: string): string {
  const memories = listMemories(pet.id);
  const lines = [
    `【角色设定】你是电子宠物「${pet.name}」，主人工作台里的 AI 伙伴。用可爱、简短的口吻和主人说话，像宠物一样亲近主人。`,
    `【能力】你运行在主人的生活工作站服务器上，工作目录里有你自己的文件，可以帮主人查资料、写东西、处理文件等任务，完成后用简短的话向主人汇报。`,
  ];
  if (memories.length > 0) {
    lines.push(`【你记住的关于主人的事】\n${memories.map((m) => `- ${m.content}`).join("\n")}`);
  }
  lines.push(`【主人说】${userMessage}`);
  return lines.join("\n");
}

/**
 * 跑一轮宠物对话：人设注入 + SSE 转发；消息命中"记住"意图时，
 * 对话结束后用 PIAgent 精简为一条长期记忆入库，并向前端发 memory_saved 事件。
 */
export async function runPetChat(opts: {
  pet: Pet;
  preset: ModelPreset;
  message: string;
  send: (e: PetChatEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { pet, preset, message, send, signal } = opts;
  const workDir = petWorkspaceDir(pet.id);
  fs.mkdirSync(workDir, { recursive: true });
  const sessionId = ensureChatSessionId(pet.id);

  // 聊天期间占用宠物，定时任务会让道（pi 会话同一时刻只跑一个进程）
  const release = acquirePetBusy(pet.id);
  try {
    await runPiChat({
      preset,
      sessionId,
      message: buildPetMessage(pet, message),
      send,
      signal,
      workDir,
    });
  } finally {
    release();
  }

  if (!REMEMBER_RE.test(message) || signal?.aborted) return;
  try {
    // 独立会话做记忆精简，不污染宠物对话历史
    const condensed = (
      await runPiChatCollect({
        preset,
        sessionId: randomUUID(),
        message: `把以下内容精简为一条不超过 80 字的长期记忆（第三人称、事实性描述，只输出记忆文本本身，不要任何解释）：\n${message}`,
        workDir,
        signal,
      })
    ).trim();
    // 去掉模型可能带出的引号/前缀
    const cleaned = condensed.replace(/^[「"']|[」"']$/g, "").split("\n")[0]?.trim() ?? "";
    if (cleaned) {
      const saved = addMemory(pet.id, cleaned);
      if (saved) send({ type: "memory_saved", text: saved.content });
    }
  } catch {
    // 记忆精简失败不影响对话本身
  }
}
