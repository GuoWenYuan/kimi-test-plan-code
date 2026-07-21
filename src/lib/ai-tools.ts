/**
 * AI 工具注册表（/tools 页签的数据源，客户端组件直接引用，勿放敏感信息）。
 *
 * 两种接入模式：
 * - local: true（推荐，类 Unity 本机模式）——工具运行在**打开网页的用户自己电脑**上，
 *   浏览器直连 127.0.0.1:<port>，不经过部署服务器，用户只能访问自己本机的环境；
 *   离线时页面展示 startCommand 供一键复制。
 * - local: false——工具部署在服务器上，浏览器访问「当前网页主机名:publicPort」。
 *   若工具的 Web UI 响应带 `frame-ancestors 'self'` 等限制导致无法 iframe 嵌入，
 *   在对应机器上起一个 `node tools/webui-proxy.mjs <对外端口> <工具端口>` 代理，
 *   publicPort 填对外端口。
 *
 * 未来接入新工具时，在 AI_TOOLS 数组中追加一条即可。
 */

export interface AiTool {
  id: string;
  name: string;
  description: string;
  /** true：工具在用户本机（127.0.0.1）；false：工具在部署服务器（当前网页主机名） */
  local: boolean;
  /** 工具监听端口（local 模式指用户本机的端口） */
  port: number;
  /** 仅 local:false 模式：对外访问端口（如经 webui-proxy 转发）；缺省同 port */
  publicPort?: number;
  /** 该工具的 Web UI 支持 URL hash 携带访问令牌（#token=...），页面会提供令牌输入框（存浏览器 localStorage） */
  tokenHash?: boolean;
  /** 获取/重置访问令牌的命令（tokenHash 工具展示在令牌框旁，一键复制） */
  tokenCommand?: string;
  /** 打开时的路径（缺省 /）；如 T3 Code 配对页为 /pair，配合 tokenHash 直达 /pair#token=... */
  path?: string;
  /** 本机启动命令（local 模式离线时展示，一键复制） */
  startCommand?: string;
  /** 文档链接 */
  docs?: string;
}

export const AI_TOOLS: AiTool[] = [
  {
    id: "kimi-web",
    name: "Kimi Web UI",
    description:
      "Kimi Code CLI 的网页界面，运行在你自己的电脑上：浏览器直连本机 127.0.0.1，不经过部署服务器，只能操作你本机的工程。端口以本机实际为准（0.27 默认 58627），可在下方修改。",
    local: true,
    port: 58627,
    tokenHash: true,
    tokenCommand: "kimi server rotate-token",
    startCommand: "kimi web --keep-alive",
    docs: "https://moonshotai.github.io/kimi-cli/zh/reference/kimi-web.html",
  },
];
