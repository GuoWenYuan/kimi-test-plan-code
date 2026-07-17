import { ChatOpenAI } from "@langchain/openai";
import type { ModelPreset } from "./models-store";

/**
 * 基于 LangChain 的模型底层封装。
 * 所有预设统一走 OpenAI 兼容协议（OpenAI / Kimi / DeepSeek 等均支持），
 * 通过 baseUrl 区分提供方。
 */
export function createChatModel(preset: ModelPreset): ChatOpenAI {
  return new ChatOpenAI({
    model: preset.model,
    apiKey: preset.apiKey,
    configuration: { baseURL: preset.baseUrl },
    temperature: 0.7,
    timeout: 30_000,
  });
}

/** 发送一条最小消息，验证预设连通性。返回模型回复片段。 */
export async function testPreset(preset: ModelPreset): Promise<string> {
  const model = createChatModel(preset);
  const res = await model.invoke("用一句话介绍你自己。");
  const content = res.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}
