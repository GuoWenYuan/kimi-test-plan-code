import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPreset } from "@/lib/models-store";
import {
  getPetById,
  listMemories,
  updatePetSettings,
  type PetAppearance,
} from "@/lib/pet-store";

/** 宠物详情（登录可见；记忆仅主人可见） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return NextResponse.json({ error: "宠物不存在" }, { status: 404 });
  const isOwner = result.pet.ownerUserId === user.id;
  return NextResponse.json({
    pet: result.pet,
    isOwner,
    canEdit: isOwner || user.role === "super_admin",
    memoryCount: listMemories(id).length,
  });
}

/** 更新宠物设置：改名 / 绑定模型预设 / 外观（owner 或超管） */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const result = getPetById(id);
  if (!result) return NextResponse.json({ error: "宠物不存在" }, { status: 404 });
  const isAdmin = user.role === "super_admin";
  if (result.pet.ownerUserId !== user.id && !isAdmin) {
    return NextResponse.json({ error: "只有主人或管理员可以修改宠物" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    presetId?: string | null;
    appearance?: PetAppearance;
  } | null;
  if (!body) return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });

  // 预设必须是主人自己的（key 不出服务器，聊天时按主人身份取）
  if (body.presetId !== undefined && body.presetId !== null) {
    const ownerId = result.pet.ownerUserId;
    if (!ownerId) return NextResponse.json({ error: "宠物还未被领养" }, { status: 400 });
    const preset = await getPreset(ownerId, body.presetId);
    if (!preset) return NextResponse.json({ error: "模型预设不存在" }, { status: 404 });
  }

  // 外观：stateMap 只能映射到已存在的表情槽
  if (body.appearance !== undefined) {
    const ap = body.appearance;
    const exprs = ap.expressions ?? {};
    for (const [key, file] of Object.entries(exprs)) {
      if (!key.trim() || typeof file !== "string" || file.includes("/") || file.includes("\\")) {
        return NextResponse.json({ error: "外观配置非法" }, { status: 400 });
      }
    }
    for (const state of Object.keys(ap.stateMap ?? {})) {
      if (!["idle", "hungry", "sleepy", "eating", "petted"].includes(state)) {
        return NextResponse.json({ error: "未知的状态映射" }, { status: 400 });
      }
    }
    for (const exprName of Object.values(ap.stateMap ?? {})) {
      if (exprName && !exprs[exprName]) {
        return NextResponse.json({ error: `状态映射指向不存在的表情：${exprName}` }, { status: 400 });
      }
    }
  }

  const pet = updatePetSettings(id, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.presetId !== undefined ? { presetId: body.presetId } : {}),
    ...(body.appearance !== undefined ? { appearance: body.appearance } : {}),
  });
  return NextResponse.json({ pet });
}
