import { randomUUID } from "node:crypto";
import { adjustExpressionImage, generateExpressionImage } from "@/lib/pet-image-gen";
import { getPetById, updatePetSettings } from "@/lib/pet-store";

/**
 * 宠物外观 AI 生成任务注册表：生图要 30-60 秒，POST 只登记任务立即返回（202），
 * 实际生成在服务端后台跑——任务不依赖浏览器连接，页面切换/刷新不丢。
 * 前端轮询 GET /api/pets/[id]/assets/jobs 拿进度与结果。
 * globalThis 单例，跨路由共享；容器重启任务丢失（任务本身瞬态，可接受）。
 */

export type PetGenJob = {
  id: string;
  petId: string;
  kind: "generate" | "adjust";
  /** 表情名（generate=新表情，adjust=被调整的表情） */
  name: string;
  /** 生成提示词 / 本次调整意见，前端展示「正在生成什么」 */
  hint: string;
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt?: number;
  /** 完成后的图片文件名（adjust 为被覆盖的原文件） */
  file?: string;
  error?: string;
};

/** 已结束任务保留 10 分钟供前端轮询到结果，之后清理 */
const FINISHED_TTL_MS = 10 * 60 * 1000;

const jobs: Map<string, PetGenJob> = (() => {
  const g = globalThis as unknown as { __petGenJobs?: Map<string, PetGenJob> };
  if (!g.__petGenJobs) g.__petGenJobs = new Map();
  return g.__petGenJobs;
})();

function sweep(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.status !== "running" && j.finishedAt && now - j.finishedAt > FINISHED_TTL_MS) {
      jobs.delete(id);
    }
  }
}

/** 该宠物的任务列表（在跑的 + 最近结束的），新的在前 */
export function listGenJobs(petId: string): PetGenJob[] {
  sweep();
  return [...jobs.values()]
    .filter((j) => j.petId === petId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** 同一宠物同一表情已有在跑的任务（防重复提交/重复调整） */
export function hasRunningJob(petId: string, name: string): boolean {
  for (const j of jobs.values()) {
    if (j.petId === petId && j.name === name && j.status === "running") return true;
  }
  return false;
}

function addJob(j: Pick<PetGenJob, "petId" | "kind" | "name" | "hint" | "file">): PetGenJob {
  const job: PetGenJob = { ...j, id: randomUUID(), status: "running", startedAt: Date.now() };
  jobs.set(job.id, job);
  return job;
}

function finish(job: PetGenJob, ok: boolean, extra?: { file?: string; error?: string }): void {
  job.status = ok ? "done" : "error";
  job.finishedAt = Date.now();
  if (extra?.file) job.file = extra.file;
  if (extra?.error) job.error = extra.error;
}

/**
 * 登记一个「AI 生成表情」任务并后台执行。完成时重新读 appearance 再合并写入
 * （任务跑了近 1 分钟，期间外观可能被改过，不能拿提交时的快照覆盖）。
 */
export function startGenerateJob(opts: { petId: string; name: string; hint: string }): PetGenJob {
  const job = addJob({ petId: opts.petId, kind: "generate", name: opts.name, hint: opts.hint });
  void (async () => {
    try {
      const file = await generateExpressionImage(opts.petId, opts.name, opts.hint);
      const cur = getPetById(opts.petId);
      if (cur) {
        const a = cur.pet.appearance;
        updatePetSettings(opts.petId, {
          appearance: {
            expressions: { ...a.expressions, [opts.name]: file },
            stateMap: a.stateMap ?? {},
            prompts: { ...a.prompts, [file]: opts.hint || "standing still with a gentle smile, relaxed" },
          },
        });
      }
      finish(job, true, { file });
    } catch (e) {
      finish(job, false, { error: e instanceof Error ? e.message : "生成失败" });
    }
  })();
  return job;
}

/** 登记一个「反复调整」任务并后台执行；accumulated 为拼接好的累积描述（路由侧算好） */
export function startAdjustJob(opts: {
  petId: string;
  name: string;
  file: string;
  accumulated: string;
  hint: string;
}): PetGenJob {
  const job = addJob({ petId: opts.petId, kind: "adjust", name: opts.name, hint: opts.hint, file: opts.file });
  void (async () => {
    try {
      await adjustExpressionImage(opts.petId, opts.file, opts.accumulated);
      const cur = getPetById(opts.petId);
      if (cur) {
        const a = cur.pet.appearance;
        updatePetSettings(opts.petId, {
          appearance: {
            expressions: a.expressions ?? {},
            stateMap: a.stateMap ?? {},
            prompts: { ...a.prompts, [opts.file]: opts.accumulated },
          },
        });
      }
      finish(job, true, { file: opts.file });
    } catch (e) {
      finish(job, false, { error: e instanceof Error ? e.message : "调整失败" });
    }
  })();
  return job;
}
