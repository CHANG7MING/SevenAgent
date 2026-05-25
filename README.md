# AI 员工站

一个基于 Next.js、TypeScript 和 React 的多 Agent 工作台。

## 启动

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:3025
```

## 使用

1. 在左侧导航进入「配置 API」，填写 OpenAI-compatible 的 `Base URL`、`API Key` 和模型名。
2. 进入「生成」，输入任务目标并开始生成。
3. 回到「工作台」，可以新增 Agent，并点击任意工位查看 API token、请求、模型返回、内容解析和工位输出流。

页面通过 Next API Route `/api/agent-chat` 代理第三方模型请求，避免浏览器直接请求时遇到 CORS 限制。
