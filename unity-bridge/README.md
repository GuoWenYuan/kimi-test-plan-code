# Unity Bridge —— 本机 Unity Editor 桥接插件

让部署后的网页能够操控**用户自己电脑上的 Unity Editor**。

## 原理

```
浏览器（部署在服务器上的网页）
   │  fetch http://127.0.0.1:39271/...
   ▼
本机 Unity Editor（UnityBridge.cs 启动的极简 HTTP 服务，仅监听回环地址）
```

请求不经过部署服务器，浏览器直接访问用户本机的桥接口；命令通过
`EditorApplication.update` 泵到 Unity 主线程执行，线程安全。

## 安装

1. 把 `Editor/UnityBridge.cs` 拷贝到 Unity 工程的 `Assets/Editor/` 目录（无第三方依赖，2019.4+ 均可）。
2. 回到 Unity，编译完成后自动启动（菜单 **Tools > Unity Bridge** 可查看状态 / 手动启停）。
3. 打开网页的「Unity 控制」页面，点「连接本机 Unity」。

默认端口 `39271`。如部署站点是 HTTPS 也无需额外配置：浏览器把 `127.0.0.1`
视为可信来源，插件已返回 CORS 与 Private Network Access 头。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/ping` | 连通性检查，返回项目名 / Unity 版本 / 命令数 |
| GET | `/commands` | 列出全部已注册命令（名称 + 说明） |
| POST | `/execute` | 执行命令。请求体 `{"name":"命令名","args":"参数字符串"}` |

## 内置示例命令

- `log` — 向 Unity Console 输出日志
- `create_cube` — 在当前场景创建 Cube 并选中
- `list_root_objects` — 列出当前场景根节点物体
- `select_object` — 按名字选中场景物体

## 注册你自己的命令

在任意 Editor 脚本中：

```csharp
UnityBridge.Register("my_cmd", "命令说明", args =>
{
    // 这里运行在 Unity 主线程，可调用任何 Editor API
    return "返回给网页的结果";
});
```

注册后刷新网页命令列表即可看到并执行。

## 安全说明

服务只绑定 `127.0.0.1`，外部机器无法访问；但**本机的任何进程和网页都能调用**，
请勿在注册的命令里放置删除文件等敏感操作。如不再需要，菜单里 Stop 或删除该文件即可。
