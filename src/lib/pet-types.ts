/**
 * 宠物相关纯类型（无 node 依赖，客户端/服务端均可导入）。
 */

/** 内置表情（外观 stateMap 可映射的三种基础状态） */
export type PetExpression = "idle" | "hungry" | "sleepy";

/** 可映射自定义图的全部显示状态：三个基础表情 + 进食/被摸 */
export type PetDisplayState = PetExpression | "eating" | "petted";

/** 全部显示状态（悬浮球表情随机轮播、外观 stateMap 配置共用） */
export const PET_DISPLAY_STATES: PetDisplayState[] = ["idle", "hungry", "sleepy", "eating", "petted"];

/** 外观配置：任意命名表情槽（值为 assets 目录下的文件名）+ 五状态映射 */
export interface PetAppearance {
  expressions?: Record<string, string>;
  stateMap?: Partial<Record<PetDisplayState, string>>;
  /** 每张图的累积生成描述（文件名 → prompt），"反复调整"重绘时拼接沿用 */
  prompts?: Record<string, string>;
}

export interface Pet {
  id: string;
  ownerUserId: string | null;
  ownerName: string | null;
  name: string;
  presetId: string | null;
  appearance: PetAppearance;
  adoptedAt: string | null;
  createdAt: string;
}

export interface PetMemory {
  id: string;
  content: string;
  createdAt: string;
}
