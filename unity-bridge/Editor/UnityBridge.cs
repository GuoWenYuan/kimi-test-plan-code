// Unity Bridge —— 本地桥接插件（Editor 脚本）
//
// 作用：在 Unity Editor 内启动一个只监听 127.0.0.1 的极简 HTTP 服务，
// 供浏览器里的网页（如配套的 Next.js 后台 /unity 页面）向本机 Unity 下发操作。
//
// 安装：把本文件放到 Unity 工程的 Assets/Editor/ 目录下即可（无需第三方依赖）。
// 启停：菜单 Tools > Unity Bridge > Start / Stop（默认跟随 Editor 启动自动开启）。
//
// 接口（默认端口 39271，全部返回 JSON，带 CORS 头）：
//   GET  /ping      -> {"ok":true,"project":"...","unity":"...","commands":4}
//   GET  /commands  -> {"commands":[{"name":"...","description":"..."}, ...]}
//   POST /execute   -> 请求 {"name":"命令名","args":"参数字符串"}
//                      响应 {"ok":true,"result":"..."} 或 {"ok":false,"error":"..."}
//
// 扩展：在任意 Editor 脚本里调用
//   UnityBridge.Register("my_cmd", "命令说明", args => { /* Unity 操作 */ return "结果"; });
// 即可让网页端发现并执行你的命令（自动在主线程执行）。
//
// 注意：该服务只绑定回环地址，但本机任何进程/网页都能访问，请勿在命令里放敏感操作。

using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEditor;
using UnityEngine;

[InitializeOnLoad]
public static class UnityBridge
{
    const int Port = 39271;

    [Serializable]
    class ExecuteRequest
    {
        public string name;
        public string args;
    }

    class CommandEntry
    {
        public string Description;
        public Func<string, string> Handler; // 入参为 args 字符串，返回值作为结果；抛异常即视为失败
    }

    class Job
    {
        public string Name;
        public string Args;
        public string Result;
        public string Error;
        public readonly ManualResetEventSlim Done = new ManualResetEventSlim();
    }

    static readonly Dictionary<string, CommandEntry> commands = new Dictionary<string, CommandEntry>();
    static readonly Queue<Job> pending = new Queue<Job>();

    static TcpListener listener;
    static Thread listenThread;
    static volatile bool running;

    // 在主线程缓存，避免工作线程触碰 UnityEngine API
    static string projectName;
    static string unityVersion;

    static UnityBridge()
    {
        projectName = Application.productName;
        unityVersion = Application.unityVersion;

        RegisterBuiltins();

        EditorApplication.update += Pump;
        EditorApplication.quitting += Stop;
        AssemblyReloadEvents.beforeAssemblyReload += Stop;
        Start();
    }

    [MenuItem("Tools/Unity Bridge/Start")]
    static void Start()
    {
        if (running) return;
        try
        {
            listener = new TcpListener(System.Net.IPAddress.Loopback, Port);
            listener.Start();
        }
        catch (Exception e)
        {
            Debug.LogError($"[UnityBridge] 端口 {Port} 启动失败：{e.Message}");
            return;
        }
        running = true;
        listenThread = new Thread(ListenLoop) { IsBackground = true, Name = "UnityBridge" };
        listenThread.Start();
        Debug.Log($"[UnityBridge] 已启动：http://127.0.0.1:{Port} （项目 {projectName}）");
    }

    [MenuItem("Tools/Unity Bridge/Stop")]
    static void Stop()
    {
        running = false;
        try { listener?.Stop(); } catch { /* 忽略 */ }
        listener = null;
    }

    [MenuItem("Tools/Unity Bridge/Status")]
    static void Status()
    {
        Debug.Log(running
            ? $"[UnityBridge] 运行中：http://127.0.0.1:{Port} ，已注册 {commands.Count} 个命令"
            : "[UnityBridge] 未运行");
    }

    /// <summary>注册一个网页可调用的命令。Handler 始终在 Unity 主线程执行。</summary>
    public static void Register(string name, string description, Func<string, string> handler)
    {
        lock (commands)
        {
            commands[name] = new CommandEntry { Description = description, Handler = handler };
        }
    }

    static void RegisterBuiltins()
    {
        Register("log", "向 Unity Console 输出一条日志，args 为内容", args =>
        {
            Debug.Log($"[UnityBridge] {args}");
            return "已输出到 Console";
        });

        Register("create_cube", "在当前场景创建一个 Cube，args 可选（物体名称）", args =>
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = string.IsNullOrWhiteSpace(args) ? "BridgeCube" : args.Trim();
            Selection.activeGameObject = go;
            return $"已创建并选中：{go.name}";
        });

        Register("list_root_objects", "列出当前场景根节点物体，无需 args", _ =>
        {
            var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
            var names = new List<string>();
            foreach (var go in scene.GetRootGameObjects()) names.Add(go.name);
            return string.Join(", ", names);
        });

        Register("select_object", "按名字选中场景中的物体，args 为物体名", args =>
        {
            var go = GameObject.Find(args?.Trim());
            if (go == null) throw new Exception($"找不到物体：{args}");
            Selection.activeGameObject = go;
            EditorGUIUtility.PingObject(go);
            return $"已选中：{go.name}";
        });
    }

    // ---------- 主线程任务泵 ----------

    static void Pump()
    {
        while (true)
        {
            Job job;
            lock (pending)
            {
                if (pending.Count == 0) return;
                job = pending.Dequeue();
            }
            try
            {
                CommandEntry entry;
                lock (commands) commands.TryGetValue(job.Name, out entry);
                if (entry == null) throw new Exception($"未知命令：{job.Name}");
                job.Result = entry.Handler(job.Args) ?? "";
            }
            catch (Exception e)
            {
                job.Error = e.Message;
            }
            job.Done.Set();
        }
    }

    // ---------- 极简 HTTP 服务（TcpListener，避免 HttpListener 在 Windows 需要 urlacl 的问题） ----------

    static void ListenLoop()
    {
        while (running)
        {
            TcpClient client;
            try { client = listener.AcceptTcpClient(); }
            catch { break; } // listener 被 Stop
            ThreadPool.QueueUserWorkItem(_ => HandleClient(client));
        }
    }

    static void HandleClient(TcpClient client)
    {
        try
        {
            using (client)
            {
                client.ReceiveTimeout = 10000;
                client.SendTimeout = 10000;
                var stream = client.GetStream();

                // 读请求头（到 \r\n\r\n 为止）
                var buf = new List<byte>();
                var chunk = new byte[8192];
                int headerEnd = -1;
                while (headerEnd < 0 && buf.Count < 64 * 1024)
                {
                    int n = stream.Read(chunk, 0, chunk.Length);
                    if (n <= 0) return;
                    for (int i = 0; i < n; i++) buf.Add(chunk[i]);
                    headerEnd = IndexOfHeaderEnd(buf);
                }
                if (headerEnd < 0) return;

                string headerText = Encoding.ASCII.GetString(buf.ToArray(), 0, headerEnd);
                var lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
                var requestLine = lines[0].Split(' ');
                if (requestLine.Length < 2) return;
                string method = requestLine[0].ToUpperInvariant();
                string path = requestLine[1];

                int contentLength = 0;
                foreach (var line in lines)
                {
                    if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                        int.TryParse(line.Substring(15).Trim(), out contentLength);
                }

                // 读请求体
                int bodyStart = headerEnd + 4;
                while (buf.Count - bodyStart < contentLength)
                {
                    int n = stream.Read(chunk, 0, chunk.Length);
                    if (n <= 0) break;
                    for (int i = 0; i < n; i++) buf.Add(chunk[i]);
                }
                string body = contentLength > 0
                    ? Encoding.UTF8.GetString(buf.ToArray(), bodyStart, Math.Min(contentLength, buf.Count - bodyStart))
                    : "";

                string response = Route(method, path, body, out int status);
                WriteResponse(stream, status, response);
            }
        }
        catch { /* 客户端断开等异常直接忽略 */ }
    }

    static int IndexOfHeaderEnd(List<byte> buf)
    {
        for (int i = 0; i + 3 < buf.Count; i++)
        {
            if (buf[i] == 13 && buf[i + 1] == 10 && buf[i + 2] == 13 && buf[i + 3] == 10) return i;
        }
        return -1;
    }

    static string Route(string method, string path, string body, out int status)
    {
        // CORS 预检（含 Chrome Private Network Access 要求）
        if (method == "OPTIONS")
        {
            status = 204;
            return "";
        }

        if (method == "GET" && path == "/ping")
        {
            status = 200;
            return "{\"ok\":true,\"project\":\"" + Esc(projectName) + "\",\"unity\":\"" + Esc(unityVersion) +
                   "\",\"commands\":" + commands.Count + "}";
        }

        if (method == "GET" && path == "/commands")
        {
            var sb = new StringBuilder("{\"commands\":[");
            lock (commands)
            {
                bool first = true;
                foreach (var kv in commands)
                {
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append("{\"name\":\"").Append(Esc(kv.Key))
                      .Append("\",\"description\":\"").Append(Esc(kv.Value.Description)).Append("\"}");
                }
            }
            sb.Append("]}");
            status = 200;
            return sb.ToString();
        }

        if (method == "POST" && path == "/execute")
        {
            ExecuteRequest req;
            try { req = JsonUtility.FromJson<ExecuteRequest>(body); }
            catch { status = 400; return "{\"ok\":false,\"error\":\"请求体不是合法 JSON\"}"; }
            if (req == null || string.IsNullOrEmpty(req.name))
            {
                status = 400;
                return "{\"ok\":false,\"error\":\"缺少命令名 name\"}";
            }

            var job = new Job { Name = req.name, Args = req.args ?? "" };
            lock (pending) pending.Enqueue(job);
            if (!job.Done.Wait(TimeSpan.FromSeconds(30)))
            {
                status = 504;
                return "{\"ok\":false,\"error\":\"执行超时（Editor 可能未聚焦或过忙）\"}";
            }
            status = job.Error == null ? 200 : 500;
            return job.Error == null
                ? "{\"ok\":true,\"result\":\"" + Esc(job.Result) + "\"}"
                : "{\"ok\":false,\"error\":\"" + Esc(job.Error) + "\"}";
        }

        status = 404;
        return "{\"ok\":false,\"error\":\"not found\"}";
    }

    static void WriteResponse(NetworkStream stream, int status, string json)
    {
        byte[] payload = Encoding.UTF8.GetBytes(json);
        string reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 400 ? "Bad Request" :
                        status == 404 ? "Not Found" : status == 504 ? "Gateway Timeout" : "Internal Server Error";
        string header =
            $"HTTP/1.1 {status} {reason}\r\n" +
            "Content-Type: application/json; charset=utf-8\r\n" +
            $"Content-Length: {payload.Length}\r\n" +
            "Access-Control-Allow-Origin: *\r\n" +
            "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
            "Access-Control-Allow-Headers: Content-Type\r\n" +
            "Access-Control-Allow-Private-Network: true\r\n" +
            "Connection: close\r\n\r\n";
        byte[] head = Encoding.ASCII.GetBytes(header);
        stream.Write(head, 0, head.Length);
        stream.Write(payload, 0, payload.Length);
    }

    static string Esc(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }
}
