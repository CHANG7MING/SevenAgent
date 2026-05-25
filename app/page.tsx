"use client";

import { AppstoreOutlined, CheckCircleFilled, CloseCircleFilled, DeleteOutlined, EditOutlined, KeyOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MessageOutlined, PauseCircleOutlined, PlayCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { Button, Input, Modal, Select, Spin } from "antd";
import { memo, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ViewKey = "workspace" | "config" | "generate" | "logs";
type ThemeMode = "dark" | "light";
type AgentStatus = "idle" | "running" | "error" | "resting";
type FlowStatus = "queued" | "running" | "done" | "error";
type DetailDrawerSide = "left" | "right";

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type FlowStep = {
  id: string;
  label: string;
  detail: string;
  status: FlowStatus;
  kind?: string;
  codeLanguage?: CodeLanguage;
  code?: string;
  x?: number;
  y?: number;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
};

type Agent = {
  id: number;
  name: string;
  title: string;
  task: string;
  accent: string;
  status: AgentStatus;
  output: string;
  lastUpdated: string;
  flow: FlowStep[];
  flowEdges: FlowEdge[];
};

type Config = {
  baseUrl: string;
  apiKey: string;
  model: string;
  task: string;
};

type LogEntry = {
  id: string;
  time: string;
  name: string;
  action: string;
  accent: string;
};

type WorkstationMenuState = {
  agentId: number;
  name: string;
  title: string;
  accent: string;
  x: number;
  y: number;
  closing: boolean;
} | null;

type AgentMenuOpenEvent = MouseEvent<HTMLElement> | PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>;

type WorkflowNodeDraft = {
  label: string;
  detail: string;
  status: FlowStatus;
};

type WorkflowEdgeDraft = {
  sourceId: string;
  targetId: string;
};

type WorkflowTestState = {
  agentId: number | null;
  status: "idle" | "running" | "passed" | "failed";
  message: string;
};

type WorkflowNodeMenuState = {
  stepId: string;
  x: number;
  y: number;
} | null;

type CodeLanguage = "javascript" | "typescript" | "python" | "sql" | "shell" | "json";

type CodeEditorState = {
  agentId: number;
  stepId: string;
  title: string;
  language: CodeLanguage;
  code: string;
} | null;

type RenameAgentState = {
  agentId: number;
  name: string;
} | null;

type PendingAgentSelection = {
  agentId: number;
  openDetail: boolean;
} | null;

type WorkstationCardAgent = {
  id: number;
  name: string;
  title: string;
  task: string;
  accent: string;
  status: AgentStatus;
  completed: boolean;
};

type WorkstationNodeProps = {
  agent: WorkstationCardAgent;
  index: number;
  selected: boolean;
  isNew: boolean;
  onSelect: (side: DetailDrawerSide) => void;
  onOpenMenu: (event: AgentMenuOpenEvent) => void;
};

type WorkflowStepNodeData = {
  step: FlowStep;
  accent: string;
};

type WorkflowPaletteItem = {
  key: string;
  icon: string;
  title: string;
  desc: string;
  accent: string;
  soft: string;
};

type AgentChatResponse = {
  content?: string;
  error?: string;
  usage?: Usage | null;
  raw?: unknown;
};

const accentColors = ["#166534", "#0F766E", "#155E75", "#1D4ED8", "#3730A3", "#6D28D9", "#7E22CE", "#854D0E", "#3F6212", "#0E7490", "#4F46E5", "#334155"];
const systemAccent = "#334155";
const successAccent = "#166534";
const warningAccent = "#B45309";
const defaultWorkflowAccent = "#334155";
const workflowMinZoom = 0.25;
const workflowMaxZoom = 1.8;
const workflowZoomStep = 0.15;
const workflowNodeWidth = 260;
const workflowNodeHeight = 76;
const minimapWidth = 156;
const minimapHeight = 104;
const minimapPadding = 8;
const workflowGridByTheme: Record<ThemeMode, { background: string; grid: string }> = {
  dark: { background: "#050505", grid: "rgba(255, 255, 255, 0.14)" },
  light: { background: "#fbfcfe", grid: "#dfe5ee" },
};

type WorkflowViewport = {
  tx: number;
  ty: number;
  zoom: number;
  width: number;
  height: number;
};

type WorkflowMinimapModel = {
  bounds: { x: number; y: number; width: number; height: number };
  scale: number;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number; status: FlowStatus; accent: string; soft: string }>;
  edges: Array<{ id: string; sourceX: number; sourceY: number; targetX: number; targetY: number }>;
  viewport: { x: number; y: number; width: number; height: number };
};

const seedAgentInput = [
  { name: "数据研究员", title: "检索 32/50 篇资料", task: "收集与分析行业数据" },
  { name: "内容策划师", title: "生成大纲 7/12", task: "生成内容大纲与结构" },
  { name: "视觉设计师", title: "生成图像 12/20", task: "生成设计方案与素材方向" },
  { name: "数据分析师", title: "处理数据 842/1200 条", task: "进行数据建模与分析" },
  { name: "文案撰写员", title: "已完成 1680/2500 字", task: "撰写文案与优化表达" },
  { name: "任务协调员", title: "同步进度 18/24 项", task: "协调任务与汇总进度" },
];

const sampleActions = ["同步了最新进度", "完成数据清洗", "收到模型片段", "完成结构解析", "写入工位输出", "更新上下文缓存"];

const navigation: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
  { key: "workspace", label: "工作台", icon: <AppstoreOutlined /> },
  { key: "config", label: "配置 API", icon: <KeyOutlined /> },
  { key: "generate", label: "生成", icon: <SearchOutlined /> },
  { key: "logs", label: "日志", icon: <MessageOutlined /> },
];

const flowStatusOptions: Array<{ value: FlowStatus; label: string }> = [
  { value: "queued", label: "排队" },
  { value: "running", label: "运行中" },
  { value: "done", label: "已完成" },
  { value: "error", label: "异常" },
];

const workflowPalette: WorkflowPaletteItem[] = [
  { key: "llm", icon: "LLM", title: "文本大模型", desc: "处理文本指令与上下文。", accent: "#1D4ED8", soft: "#DCE8FF" },
  { key: "code", icon: "</>", title: "代码执行", desc: "运行脚本和逻辑。", accent: "#0F766E", soft: "#D8F0EC" },
  { key: "branch", icon: "IF", title: "分支", desc: "根据条件执行不同逻辑。", accent: "#B45309", soft: "#F3E1D1" },
  { key: "loop", icon: "FOR", title: "循环", desc: "迭代处理重复步骤。", accent: "#7C3AED", soft: "#E6DDFB" },
  { key: "kb", icon: "KB", title: "知识库", desc: "检索信息与上下文。", accent: "#2563EB", soft: "#DDE7FF" },
  { key: "mcp", icon: "MCP", title: "MCP 插件", desc: "扩展外部能力。", accent: "#0E7490", soft: "#D7EEF3" },
  { key: "skills", icon: "SK", title: "Skills", desc: "接入可复用技能与工具链。", accent: "#15803D", soft: "#DDF0E4" },
];

const codeLanguageOptions: Array<{ value: CodeLanguage; label: string }> = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "shell", label: "Shell" },
  { value: "json", label: "JSON" },
];

const codeTemplates: Record<CodeLanguage, string> = {
  javascript: "const input = context.input;\nreturn {\n  ok: true,\n  data: input,\n};",
  typescript: "type Result = { ok: boolean; data: unknown };\n\nconst input = context.input;\nconst result: Result = { ok: true, data: input };\nreturn result;",
  python: "def run(context):\n    data = context.get(\"input\")\n    return {\n        \"ok\": True,\n        \"data\": data,\n    }",
  sql: "select\n  id,\n  name,\n  created_at\nfrom source_table\nwhere created_at >= :start_time;",
  shell: "set -e\n\necho \"running task\"\necho \"$INPUT_PAYLOAD\"",
  json: "{\n  \"ok\": true,\n  \"data\": {}\n}",
};

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const savedTheme = window.localStorage.getItem("agent-station-theme");
  return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
}

const codeHintSnippets: Record<CodeLanguage, string[]> = {
  javascript: ["return { ok: true }", "context.input", "await fetch(url)"],
  typescript: ["type Result = {}", "const value: string", "return result"],
  python: ["def run(context):", "context.get(\"input\")", "return {\"ok\": True}"],
  sql: ["select ... from ...", "where created_at >= :start_time", "limit 100"],
  shell: ["set -e", "$INPUT_PAYLOAD", "echo \"done\""],
  json: ["\"key\": \"value\"", "\"items\": []", "\"enabled\": true"],
};

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function getStatusLabel(status: AgentStatus) {
  if (status === "running") return "执行中";
  if (status === "error") return "错误";
  if (status === "resting") return "休息中";
  return "空闲";
}

function getFlowStatusLabel(status: FlowStatus) {
  if (status === "running") return "运行中";
  if (status === "done") return "已完成";
  if (status === "error") return "异常";
  return "排队";
}

function isAgentFlowCompleted(agent: Agent) {
  return agent.flow.length > 0 && agent.flow.every((step) => step.status === "done");
}

function getWorkflowNodeTone(status: FlowStatus) {
  if (status === "done") return "success";
  if (status === "error") return "failed";
  if (status === "running") return "running";
  return "default";
}

function getDetailDrawerSide(target: HTMLElement): DetailDrawerSide {
  const targetRect = target.getBoundingClientRect();
  const containerRect = target.closest(".canvas-body")?.getBoundingClientRect();
  const boundaryLeft = containerRect?.left ?? 0;
  const boundaryWidth = containerRect?.width ?? window.innerWidth;
  const targetCenter = targetRect.left + targetRect.width / 2;

  return targetCenter > boundaryLeft + boundaryWidth / 2 ? "left" : "right";
}

function createBaseFlow(agentName: string): FlowStep[] {
  return [
    { id: "token", label: "API Token", detail: `${agentName} 加载授权凭证`, status: "queued", x: 96, y: 56 },
    { id: "request", label: "请求拼装", detail: "组装模型、任务、上下文", status: "queued", x: 96, y: 226 },
    { id: "model", label: "模型返回", detail: "等待第三方模型响应", status: "queued", x: 96, y: 396 },
    { id: "parse", label: "内容解析", detail: "拆分结构、提取重点", status: "queued", x: 96, y: 566 },
    { id: "output", label: "工位输出", detail: "写入当前 Agent 工作台", status: "queued", x: 96, y: 736 },
  ];
}

function createWorkflowEdgeId(sourceId: string, targetId: string) {
  return `edge-${sourceId}-to-${targetId}`;
}

function createLinearFlowEdges(flow: FlowStep[]): FlowEdge[] {
  return flow.slice(0, -1).map((step, index) => {
    const target = flow[index + 1];
    return {
      id: createWorkflowEdgeId(step.id, target.id),
      source: step.id,
      target: target.id,
    };
  });
}

function createBaseWorkflow(agentName: string): Pick<Agent, "flow" | "flowEdges"> {
  const flow = createBaseFlow(agentName);
  return {
    flow,
    flowEdges: createLinearFlowEdges(flow),
  };
}

function createDefaultEdgeDraft(agent?: Agent): WorkflowEdgeDraft {
  const sourceId = agent?.flow[0]?.id ?? "";
  const targetId = agent?.flow.find((step) => step.id !== sourceId)?.id ?? "";
  return { sourceId, targetId };
}

function getWorkflowStepName(agent: Agent, stepId: string) {
  return agent.flow.find((step) => step.id === stepId)?.label ?? "未知节点";
}

function isCodeStep(step?: FlowStep) {
  return step?.kind === "code" || step?.label === "代码执行";
}

function getWorkflowKindAccent(kind?: string) {
  return workflowPalette.find((item) => item.key === kind)?.accent ?? defaultWorkflowAccent;
}

function getWorkflowKindSoft(kind?: string) {
  return workflowPalette.find((item) => item.key === kind)?.soft ?? "#E7EEF7";
}

function getCodeHints(language: CodeLanguage, code: string) {
  const baseHints = codeHintSnippets[language];
  const contextualHints = [];
  if (!code.trim()) contextualHints.push("可从下方提示插入模板片段。");
  if (language === "json" && code.trim() && !code.trim().startsWith("{")) contextualHints.push("JSON 通常以 { 开始。");
  if ((language === "javascript" || language === "typescript") && !code.includes("return")) contextualHints.push("建议返回一个结构化对象。");
  if (language === "python" && !code.includes("def run")) contextualHints.push("建议声明 def run(context): 作为入口。");
  return [...contextualHints, ...baseHints];
}

function getCodeMirrorLanguage(language: CodeLanguage) {
  if (language === "javascript") return javascript();
  if (language === "typescript") return javascript({ typescript: true });
  if (language === "python") return python();
  if (language === "sql") return sql({ dialect: PostgreSQL });
  if (language === "json") return json();
  return StreamLanguage.define(shell);
}

function createCodeCompletion(language: CodeLanguage) {
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        const word = context.matchBefore(/[\w.$:"'-]*/);
        if (!word || (word.from === word.to && !context.explicit)) return null;
        return {
          from: word.from,
          options: codeHintSnippets[language].map((label) => ({
            label,
            type: label.includes("(") || label.includes(":") ? "function" : "variable",
          })),
        };
      },
    ],
  });
}

function CodeMirrorEditor({
  value,
  language,
  onChange,
}: {
  value: string;
  language: CodeLanguage;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          history(),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          getCodeMirrorLanguage(language),
          createCodeCompletion(language),
          placeholder(codeTemplates[language]),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": {
              minHeight: "320px",
              border: "1px solid #ccd6e4",
              borderRadius: "8px",
              backgroundColor: "#fbfcfe",
              color: "#182230",
              fontSize: "13px",
            },
            ".cm-scroller": {
              minHeight: "320px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              lineHeight: "1.65",
            },
            ".cm-content": {
              padding: "12px 0",
            },
            ".cm-gutters": {
              backgroundColor: "#F1F5F9",
              borderRight: "1px solid #dbe4ef",
              color: "#64748B",
            },
            ".cm-activeLine": {
              backgroundColor: "#E7EEF7",
            },
            ".cm-activeLineGutter": {
              backgroundColor: "#E7EEF7",
            },
            ".cm-tooltip": {
              border: "1px solid #ccd6e4",
              borderRadius: "8px",
              overflow: "hidden",
            },
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div className="code-editor-codemirror" ref={editorRef} />;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function evaluateWorkflowConnectivity(agent: Agent) {
  const [start] = agent.flow;
  if (!start) return { passed: false, orderedIds: [] as string[], failedId: "", message: "流程里还没有节点。" };
  if (agent.flow.length > 1 && agent.flowEdges.length === 0) {
    return { passed: false, orderedIds: [start.id], failedId: agent.flow[1]?.id ?? start.id, message: "节点之间还没有连线。" };
  }

  const nodeIds = new Set(agent.flow.map((step) => step.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  agent.flow.forEach((step) => {
    outgoing.set(step.id, []);
    incoming.set(step.id, 0);
  });

  agent.flowEdges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    outgoing.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  });

  const orderedIds: string[] = [];
  const visited = new Set<string>();
  const queue = [start.id];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    orderedIds.push(current);
    outgoing.get(current)?.forEach((target) => {
      if (!visited.has(target)) queue.push(target);
    });
  }

  const unreachable = agent.flow.find((step) => !visited.has(step.id));
  if (unreachable) {
    return { passed: false, orderedIds, failedId: unreachable.id, message: `${unreachable.label} 没有从起点连通。` };
  }

  const unlinkedInput = agent.flow.find((step) => step.id !== start.id && (incoming.get(step.id) ?? 0) === 0);
  if (unlinkedInput) {
    return { passed: false, orderedIds, failedId: unlinkedInput.id, message: `${unlinkedInput.label} 缺少入口连线。` };
  }

  return { passed: true, orderedIds, failedId: "", message: `流程连通，已测试 ${agent.flow.length} 个节点。` };
}

function makeAgent(input: (typeof seedAgentInput)[number], index: number): Agent {
  const workflow = createBaseWorkflow(input.name);

  return {
    id: index + 1,
    name: input.name,
    title: input.title,
    task: input.task,
    accent: accentColors[index % accentColors.length],
    status: "idle",
    output: "等待生成任务。",
    lastUpdated: "10:23:51",
    ...workflow,
  };
}

function createAgent(id: number, index: number): Agent {
  const workflow = createBaseWorkflow(`Agent ${id}`);

  return {
    id,
    name: `Agent ${id}`,
    title: "等待分配任务",
    task: "自定义自动工作节点",
    accent: accentColors[(id - 1) % accentColors.length],
    status: "idle",
    output: "等待生成任务。",
    lastUpdated: formatTime(),
    ...workflow,
  };
}

function buildPrompt(task: string, agents: Agent[]) {
  const roster = agents.map((agent, index) => `${index + 1}. ${agent.name}: ${agent.task}`).join("\n");

  return [
    "你是一个可调度的多 Agent 工作站，请根据任务目标给出清晰、可执行的结果。",
    "",
    `任务目标：${task.trim()}`,
    "",
    "当前 Agent：",
    roster,
    "",
    "请用中文输出，包含：执行摘要、分工过程、最终建议。输出要适合进入每个 Agent 的详情流。",
  ].join("\n");
}

function createWorkflowStep(agent: Agent): FlowStep {
  const nextIndex = agent.flow.length + 1;
  const lastStep = agent.flow[agent.flow.length - 1];
  return {
    id: `custom-${Date.now()}-${nextIndex}`,
    label: `自定义节点 ${nextIndex}`,
    detail: "描述这个节点要处理的输入、动作和输出。",
    status: "queued",
    x: lastStep?.x ?? 96,
    y: (lastStep?.y ?? 56) + 148,
  };
}

function createConnectedWorkflowStep(agent: Agent, sourceStep: FlowStep): FlowStep {
  const nextIndex = agent.flow.length + 1;
  const sourceX = sourceStep.x ?? 96;
  const sourceY = sourceStep.y ?? 56;
  return {
    id: `custom-${Date.now()}-${nextIndex}`,
    label: `新增节点 ${nextIndex}`,
    detail: "描述这个节点要处理的输入、动作和输出。",
    status: "queued",
    x: Math.max(40, Math.round(sourceX)),
    y: Math.max(40, Math.round(sourceY + 148)),
  };
}

function createWorkflowPaletteStep(agent: Agent, item: WorkflowPaletteItem, position?: { x: number; y: number }): FlowStep {
  const nextIndex = agent.flow.length + 1;
  const lastStep = agent.flow[agent.flow.length - 1];
  return {
    id: `${item.key}-${Date.now()}-${nextIndex}`,
    label: item.title,
    detail: item.desc,
    status: "queued",
    kind: item.key,
    codeLanguage: item.key === "code" ? "javascript" : undefined,
    code: item.key === "code" ? codeTemplates.javascript : undefined,
    x: Math.max(40, Math.round(position?.x ?? lastStep?.x ?? 96)),
    y: Math.max(40, Math.round(position?.y ?? ((lastStep?.y ?? 56) + 132))),
  };
}

function advanceFlow(flow: FlowStep[]): FlowStep[] {
  const runningIndex = flow.findIndex((step) => step.status === "running");
  if (runningIndex === -1) {
    const queuedIndex = flow.findIndex((step) => step.status === "queued");
    if (queuedIndex === -1) return flow;
    return flow.map((step, index) => (index === queuedIndex ? { ...step, status: "running" } : step));
  }

  if (Math.random() < 0.42) return flow;

  return flow.map((step, index) => {
    if (index === runningIndex) return { ...step, status: "done" };
    if (index === runningIndex + 1) return { ...step, status: "running" };
    return step;
  });
}

function completedWorkflow(agentName: string, output: string, usage: Usage | null | undefined): Pick<Agent, "flow" | "flowEdges"> {
  const promptTokens = usage?.prompt_tokens ?? "-";
  const completionTokens = usage?.completion_tokens ?? "-";
  const totalTokens = usage?.total_tokens ?? "-";

  const flow: FlowStep[] = [
    { id: "token", label: "API Token", detail: `授权通过，prompt ${promptTokens} tokens`, status: "done" },
    { id: "request", label: "请求拼装", detail: `${agentName} 已接入任务上下文`, status: "done" },
    { id: "model", label: "模型返回", detail: `返回 ${completionTokens} completion tokens`, status: "done" },
    { id: "parse", label: "内容解析", detail: output.slice(0, 72) || "返回内容已进入解析队列", status: "done" },
    { id: "output", label: "工位输出", detail: `本次累计 ${totalTokens} tokens`, status: "done" },
  ];
  return {
    flow,
    flowEdges: createLinearFlowEdges(flow),
  };
}

function failedWorkflow(message: string): Pick<Agent, "flow" | "flowEdges"> {
  const flow: FlowStep[] = [
    { id: "token", label: "API Token", detail: "已读取配置", status: "done" },
    { id: "request", label: "请求拼装", detail: "请求已发送到代理接口", status: "done" },
    { id: "model", label: "模型返回", detail: message, status: "error" },
    { id: "parse", label: "内容解析", detail: "等待有效返回", status: "queued" },
    { id: "output", label: "工位输出", detail: "未写入", status: "queued" },
  ];
  return {
    flow,
    flowEdges: createLinearFlowEdges(flow),
  };
}

function Icon({ name }: { name: string }) {
  return <span className={`icon icon-${name}`} aria-hidden="true" />;
}

function NavIcon({ icon }: { icon: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{icon}</span>;
}

function AppShell({
  activeView,
  setActiveView,
  navCollapsed,
  onToggleNav,
  themeMode,
  onToggleTheme,
  children,
  agents,
  runtime,
  processedTotal,
  completedRuns,
}: {
  activeView: ViewKey;
  setActiveView: (view: ViewKey) => void;
  navCollapsed: boolean;
  onToggleNav: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  children: React.ReactNode;
  agents: Agent[];
  runtime: string;
  processedTotal: number;
  completedRuns: number;
}) {
  const runningCount = agents.filter((agent) => agent.status === "running").length;

  return (
    <div className={`station-shell ${navCollapsed ? "is-nav-collapsed" : ""}`} data-theme={themeMode}>
      <aside className="nav-shell">
        <div className="brand-block">
          <button className="brand-mark" type="button" aria-label={navCollapsed ? "展开导航栏" : "AI 员工站"} onClick={navCollapsed ? onToggleNav : undefined}>
            AI
          </button>
          <div className="brand-copy">
            <strong>AI 员工站</strong>
            <span>{agents.length} 个 Agent 在线</span>
          </div>
          <button className="nav-toggle" type="button" aria-label={navCollapsed ? "展开导航栏" : "收起导航栏"} aria-expanded={!navCollapsed} onClick={onToggleNav}>
            {navCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navigation.map((item) => (
            <button key={item.key} className={activeView === item.key ? "is-active" : ""} type="button" title={item.label} onClick={() => setActiveView(item.key)}>
              <NavIcon icon={item.icon} />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-account">
          <div className="account-avatar">AC</div>
          <div className="account-copy">
            <strong>an chang</strong>
            <span>免费版</span>
          </div>
        </div>
        <button className="theme-toggle" type="button" onClick={onToggleTheme} title={themeMode === "dark" ? "切换白色模式" : "切换黑色模式"}>
          <span aria-hidden="true" />
          <strong>{themeMode === "dark" ? "白色模式" : "黑色模式"}</strong>
        </button>
        <div className="nav-stats">
          <div>
            <span>运行时长</span>
            <strong>{runtime}</strong>
          </div>
          <div>
            <span>活跃工位</span>
            <strong>{runningCount} / {agents.length}</strong>
          </div>
          <div>
            <span>完成轮次</span>
            <strong>{completedRuns}</strong>
          </div>
          <div>
            <span>总处理量</span>
            <strong>{processedTotal.toLocaleString("zh-CN")} 条</strong>
          </div>
        </div>
      </aside>
      <main className={`main-shell ${activeView === "workspace" ? "is-workspace" : "has-topbar"}`}>{children}</main>
    </div>
  );
}

function TopBar({ activeView }: { activeView: Exclude<ViewKey, "workspace"> }) {
  const titleMap: Record<Exclude<ViewKey, "workspace">, string> = {
    config: "配置 API",
    generate: "生成任务",
    logs: "运行日志",
  };

  return (
    <header className="topbar">
      <div>
        <h1>{titleMap[activeView]}</h1>
        <p>管理接口、生成任务和运行记录。</p>
      </div>
      <div className="topbar-status">
        <span className="online-dot" />
        <strong>本地工作站</strong>
      </div>
    </header>
  );
}

function AgentPerson() {
  return (
    <div className="agent-person" aria-hidden="true">
      <span className="person-head" />
      <span className="person-body" />
      <span className="person-arm person-arm-left" />
      <span className="person-arm person-arm-right" />
    </div>
  );
}

function WorkstationVisual({ accent, label, status }: { accent: string; label: string; status: AgentStatus }) {
  return (
    <div className={`workstation-visual is-${status}`} style={{ "--accent": accent } as CSSProperties}>
      <div className="monitor-unit">
        <span className="screen-line" />
        <span className="screen-line short" />
        <span className="screen-window" />
      </div>
      <div className="desk-unit">
        <span className="plant" />
        <span className="mug" />
        <span className="desk-leg left" />
        <span className="desk-leg right" />
      </div>
      <AgentPerson />
      <span className="seat-accent">
        <span>{label}</span>
      </span>
    </div>
  );
}

const WorkstationNode = memo(function WorkstationNode({
  agent,
  index,
  selected,
  isNew,
  onSelect,
  onOpenMenu,
}: WorkstationNodeProps) {
  return (
    <button
      className={`workstation-node is-${agent.status} ${selected ? "is-selected" : ""} ${isNew ? "is-new" : ""}`}
      type="button"
      data-agent-id={agent.id}
      style={{ "--accent": agent.accent } as CSSProperties}
      onClick={(event) => onSelect(getDetailDrawerSide(event.currentTarget))}
      onContextMenu={onOpenMenu}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          onOpenMenu(event);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          onSelect(getDetailDrawerSide(event.currentTarget));
        }
      }}
    >
      <div className="node-head">
        <span className="agent-number">{index + 1}</span>
        <div>
          <strong>{agent.name}</strong>
          <small>{getStatusLabel(agent.status)}</small>
        </div>
      </div>
      <WorkstationVisual accent={agent.accent} label={agent.title} status={agent.status} />
      <div className="node-task">{agent.task}</div>
      <div className="node-status-row">
        {agent.status === "running" ? (
          <>
            <Spin className="node-status-spinner" size="small" />
            <span>执行中</span>
          </>
        ) : agent.status === "error" ? (
          <>
            <CloseCircleFilled className="node-status-icon is-error" />
            <span>错误</span>
          </>
        ) : agent.completed ? (
          <>
            <CheckCircleFilled className="node-status-icon is-done" />
            <span>已完成</span>
          </>
        ) : (
          <>
            <span className="node-status-dot" />
            <span>{getStatusLabel(agent.status)}</span>
          </>
        )}
      </div>
    </button>
  );
}, areWorkstationNodePropsEqual);

function areWorkstationNodePropsEqual(previous: Readonly<WorkstationNodeProps>, next: Readonly<WorkstationNodeProps>) {
  return (
    previous.index === next.index &&
    previous.selected === next.selected &&
    previous.isNew === next.isNew &&
    previous.agent.id === next.agent.id &&
    previous.agent.name === next.agent.name &&
    previous.agent.title === next.agent.title &&
    previous.agent.task === next.agent.task &&
    previous.agent.accent === next.agent.accent &&
    previous.agent.status === next.agent.status &&
    previous.agent.completed === next.agent.completed
  );
}

function FlowTimeline({ flow }: { flow: FlowStep[] }) {
  return (
    <div className="flow-timeline">
      {flow.map((step) => (
        <div key={step.id} className={`flow-step is-${step.status}`}>
          <span className="flow-dot" />
          <div>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentDetailPanel({
  agent,
  side,
  visible,
  onClose,
  onClosed,
  onStart,
  onStop,
}: {
  agent?: Agent;
  side: DetailDrawerSide;
  visible: boolean;
  onClose: () => void;
  onClosed: () => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
}) {
  if (!agent) return null;
  const isRunning = agent.status === "running";
  const completed = isAgentFlowCompleted(agent);

  return (
    <aside
      className={`agent-detail-panel is-${side} ${visible ? "is-open" : "is-closing"}`}
      onTransitionEnd={(event) => {
        if (visible || event.target !== event.currentTarget || event.propertyName !== "transform") return;
        onClosed();
      }}
    >
      <div className="detail-title-row">
        <div className="detail-head" style={{ "--accent": agent.accent } as CSSProperties}>
          <span className="detail-avatar">
            <AgentPerson />
          </span>
          <div>
            <h2>{agent.name}</h2>
            <p>{agent.title}</p>
          </div>
        </div>
        <button className="detail-close" type="button" aria-label="关闭工位详情" onClick={onClose}>
          <span aria-hidden="true" />
        </button>
      </div>
      <div className="detail-actions">
        <Button className="detail-start-button" type="primary" icon={<PlayCircleOutlined />} disabled={isRunning} onClick={() => onStart(agent.id)}>
          开始
        </Button>
        <Button className="detail-stop-button" icon={<PauseCircleOutlined />} disabled={agent.status === "resting"} onClick={() => onStop(agent.id)}>
          停止
        </Button>
      </div>
      <div className="detail-meta">
        <span className="detail-status-text">{getStatusLabel(agent.status)}</span>
        <span className={`detail-status-signal ${completed ? "is-done" : isRunning ? "is-running" : agent.status === "error" ? "is-error" : "is-ready"}`}>
          {completed ? (
            <>
              <CheckCircleFilled /> 完成
            </>
          ) : isRunning ? (
            <>
              <Spin className="detail-status-spinner" size="small" /> 工作中
            </>
          ) : agent.status === "error" ? (
            <>
              <CloseCircleFilled /> 失败
            </>
          ) : (
            "可编辑"
          )}
        </span>
        <span className="detail-status-time">{agent.lastUpdated}</span>
      </div>
      <FlowTimeline flow={agent.flow} />
      <div className="detail-output">
        <h3>返回处理结果</h3>
        <p>{agent.output}</p>
      </div>
    </aside>
  );
}

function WorkstationContextMenu({
  menu,
  agent,
  onEnter,
  onRename,
  onDelete,
  onClose,
}: {
  menu: WorkstationMenuState;
  agent?: Agent;
  onEnter: (id: number) => void;
  onRename: (agent: Agent) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  if (!menu) return null;
  const menuName = agent?.name ?? menu.name;
  const menuTitle = agent?.title ?? menu.title;
  const menuAccent = agent?.accent ?? menu.accent;

  return (
    <div
      className={`context-menu-backdrop ${menu.closing ? "is-closing" : ""}`}
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="workstation-menu"
        style={{ left: menu.x, top: menu.y, "--accent": menuAccent } as CSSProperties}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        role="menu"
        aria-label={`${menuName} 操作菜单`}
      >
        <div className="menu-head">
          <strong>{menuName}</strong>
          <span>{menuTitle}</span>
        </div>
        <Button type="text" htmlType="button" role="menuitem" icon={<PlayCircleOutlined />} disabled={agent?.status === "running"} onClick={() => onEnter(menu.agentId)}>
          {agent?.status === "running" ? "执行中不可进入" : "进入工作流"}
        </Button>
        <Button type="text" htmlType="button" role="menuitem" icon={<EditOutlined />} disabled={!agent} onClick={() => agent && onRename(agent)}>
          重命名
        </Button>
        <Button className="is-danger" type="text" htmlType="button" role="menuitem" icon={<DeleteOutlined />} onClick={() => onDelete(menu.agentId)}>
          删除工位
        </Button>
      </div>
    </div>
  );
}

function WorkflowInspector({
  agent,
  selectedStep,
  selectedEdgeId,
  draft,
  edgeDraft,
  onDraftChange,
  onEdgeDraftChange,
  onSave,
  onDelete,
  onAddEdge,
  onDeleteEdge,
  onSelectEdge,
  onClose,
  onOpenCodeEditor,
}: {
  agent: Agent;
  selectedStep?: FlowStep;
  selectedEdgeId: string | null;
  draft: WorkflowNodeDraft;
  edgeDraft: WorkflowEdgeDraft;
  onDraftChange: (field: keyof WorkflowNodeDraft, value: string) => void;
  onEdgeDraftChange: (field: keyof WorkflowEdgeDraft, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onAddEdge: (draft?: WorkflowEdgeDraft) => void;
  onDeleteEdge: (edgeId: string) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onClose: () => void;
  onOpenCodeEditor: (step: FlowStep) => void;
}) {
  const selectedEdge = selectedEdgeId ? agent.flowEdges.find((edge) => edge.id === selectedEdgeId) : undefined;
  const canAddEdge = Boolean(edgeDraft.sourceId && edgeDraft.targetId && edgeDraft.sourceId !== edgeDraft.targetId);

  function submitEdgeForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const sourceId = (form.elements.namedItem("sourceId") as HTMLSelectElement | null)?.value || edgeDraft.sourceId;
    const targetId = (form.elements.namedItem("targetId") as HTMLSelectElement | null)?.value || edgeDraft.targetId;
    onAddEdge({ sourceId, targetId });
  }

  return (
    <aside className="workflow-inspector">
      <div className="workflow-inspector-head">
        <div>
          <span>节点检查器</span>
          <strong>{selectedStep ? selectedStep.label : "未选择节点"}</strong>
        </div>
        <button type="button" aria-label="关闭节点检查器" onClick={onClose}>
          <span aria-hidden="true" />
        </button>
      </div>
      {selectedStep ? (
        <>
          <label className="field" htmlFor="workflow-node-label">
            <span>节点名称</span>
            <input id="workflow-node-label" aria-label="节点名称" value={draft.label} onChange={(event) => onDraftChange("label", event.target.value)} />
          </label>
          <label className="field" htmlFor="workflow-node-detail">
            <span>处理详情</span>
            <textarea id="workflow-node-detail" aria-label="处理详情" value={draft.detail} onChange={(event) => onDraftChange("detail", event.target.value)} />
          </label>
          <label className="field" htmlFor="workflow-node-status">
            <span>状态</span>
            <select id="workflow-node-status" aria-label="状态" value={draft.status} onChange={(event) => onDraftChange("status", event.target.value)}>
              {flowStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {isCodeStep(selectedStep) ? (
            <button className="code-open-button" type="button" onClick={() => onOpenCodeEditor(selectedStep)}>
              打开代码框
            </button>
          ) : null}
          <div className="workflow-inspector-actions">
            <button className="primary-action" type="button" onClick={onSave}>
              保存节点
            </button>
            <button className="danger-action" type="button" onClick={onDelete} disabled={agent.flow.length <= 1}>
              删除节点
            </button>
          </div>
        </>
      ) : (
        <p>点击工作流中的任意节点后，可以在这里查看、编辑或删除它。</p>
      )}
      <div className="workflow-divider" />
      <form className="edge-editor" aria-label="连线设置" onSubmit={submitEdgeForm}>
        <div className="edge-editor-head">
          <span>连线设置</span>
          <strong>{selectedEdge ? `${getWorkflowStepName(agent, selectedEdge.source)} → ${getWorkflowStepName(agent, selectedEdge.target)}` : `${agent.flowEdges.length} 条连线`}</strong>
        </div>
        <label className="field" htmlFor="workflow-edge-source">
          <span>起点</span>
          <select
            id="workflow-edge-source"
            name="sourceId"
            aria-label="连线起点"
            value={edgeDraft.sourceId}
            onInput={(event) => onEdgeDraftChange("sourceId", event.currentTarget.value)}
            onChange={(event) => onEdgeDraftChange("sourceId", event.target.value)}
          >
            <option value="">选择起点</option>
            {agent.flow.map((step) => (
              <option key={step.id} value={step.id}>
                {step.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="workflow-edge-target">
          <span>终点</span>
          <select
            id="workflow-edge-target"
            name="targetId"
            aria-label="连线终点"
            value={edgeDraft.targetId}
            onInput={(event) => onEdgeDraftChange("targetId", event.currentTarget.value)}
            onChange={(event) => onEdgeDraftChange("targetId", event.target.value)}
          >
            <option value="">选择终点</option>
            {agent.flow.map((step) => (
              <option key={step.id} value={step.id} disabled={step.id === edgeDraft.sourceId}>
                {step.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-action edge-action"
          type="submit"
          disabled={!canAddEdge}
        >
          新增连线
        </button>
        <div className="edge-list" aria-label="已有连线">
          {agent.flowEdges.length ? (
            agent.flowEdges.map((edge) => (
              <div key={edge.id} className={`edge-row ${selectedEdgeId === edge.id ? "is-selected" : ""}`}>
                <button type="button" onClick={() => onSelectEdge(edge.id)}>
                  <span>{getWorkflowStepName(agent, edge.source)}</span>
                  <strong>→</strong>
                  <span>{getWorkflowStepName(agent, edge.target)}</span>
                </button>
                <button className="edge-delete" type="button" onClick={() => onDeleteEdge(edge.id)}>
                  删除
                </button>
              </div>
            ))
          ) : (
            <p>还没有连线，选择起点和终点后手动新增。</p>
          )}
        </div>
      </form>
    </aside>
  );
}

function WorkflowPalette({ onAdd, onAddCustom }: { onAdd: (item: WorkflowPaletteItem) => void; onAddCustom: () => void }) {
  function startPaletteDrag(event: React.DragEvent<HTMLButtonElement>, item: WorkflowPaletteItem) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-workflow-palette", item.key);
  }

  return (
    <aside className="workflow-palette">
      <button className="palette-card is-custom" type="button" onClick={onAddCustom}>
        <span className="palette-icon">+</span>
        <span>
          <strong>新增节点</strong>
          <small>创建一个可自定义的流程节点。</small>
        </span>
      </button>
      <div className="palette-section-head">
        <span />
        <strong>业务逻辑</strong>
      </div>
      <div className="palette-list">
        {workflowPalette.slice(0, 4).map((item) => (
          <button
            key={item.key}
            className="palette-card"
            style={{ "--palette-accent": item.accent, "--palette-soft": item.soft } as CSSProperties}
            type="button"
            draggable
            onClick={() => onAdd(item)}
            onDragStart={(event) => startPaletteDrag(event, item)}
          >
            <span className="palette-icon">{item.icon}</span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="palette-section-head">
        <span />
        <strong>知识库&数据</strong>
      </div>
      <div className="palette-list">
        {workflowPalette.slice(4).map((item) => (
          <button
            key={item.key}
            className="palette-card"
            style={{ "--palette-accent": item.accent, "--palette-soft": item.soft } as CSSProperties}
            type="button"
            draggable
            onClick={() => onAdd(item)}
            onDragStart={(event) => startPaletteDrag(event, item)}
          >
            <span className="palette-icon">{item.icon}</span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.desc}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function createWorkflowStepNodeElement(data: WorkflowStepNodeData, onSelect: (stepId: string) => void) {
  const { step, accent } = data;
  const nodeAccent = getWorkflowKindAccent(step.kind);
  const nodeSoft = getWorkflowKindSoft(step.kind);
  const node = document.createElement("div");
  const status = document.createElement("span");
  const icon = document.createElement("span");
  const titleRow = document.createElement("span");
  const title = document.createElement("strong");
  const detail = document.createElement("p");
  const state = document.createElement("span");
  const tone = getWorkflowNodeTone(step.status);

  node.className = `workflow-step-node is-${tone}`;
  node.dataset.stepId = step.id;
  node.setAttribute("role", "button");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", `${step.label}：${getFlowStatusLabel(step.status)}`);
  node.style.setProperty("--accent", nodeAccent || accent);
  node.style.setProperty("--node-soft", nodeSoft);
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(step.id);
  });
  node.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  node.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(step.id);
  });

  icon.className = "workflow-step-icon";
  icon.textContent = step.label.slice(0, 1).toUpperCase();
  status.className = "workflow-step-badge";
  status.textContent = getFlowStatusLabel(step.status);
  titleRow.className = "workflow-step-title-row";
  title.textContent = step.label;
  detail.textContent = step.detail;
  state.className = "workflow-step-state";
  state.textContent = step.status === "done" ? "✓" : step.status === "error" ? "×" : step.status === "running" ? "" : "";
  titleRow.append(title, state);
  node.append(icon, titleRow, detail, status);

  return node;
}

function createWorkflowViewport(graph: import("@antv/x6").Graph, container: HTMLElement): WorkflowViewport {
  const translate = graph.translate();
  const zoom = graph.zoom();
  return {
    tx: translate.tx,
    ty: translate.ty,
    zoom: Number.isFinite(zoom) ? zoom : 1,
    width: container.clientWidth || 1,
    height: container.clientHeight || 1,
  };
}

function createWorkflowMinimapModel(flow: FlowStep[], flowEdges: FlowEdge[], viewport: WorkflowViewport): WorkflowMinimapModel | null {
  if (flow.length === 0) return null;

  const positions = flow.map((step, index) => ({
    id: step.id,
    x: step.x ?? 96,
    y: step.y ?? index * 148 + 56,
    width: workflowNodeWidth,
    height: workflowNodeHeight,
    status: step.status,
    accent: getWorkflowKindAccent(step.kind),
    soft: getWorkflowKindSoft(step.kind),
  }));
  const minX = Math.min(...positions.map((node) => node.x), -viewport.tx / viewport.zoom);
  const minY = Math.min(...positions.map((node) => node.y), -viewport.ty / viewport.zoom);
  const maxX = Math.max(...positions.map((node) => node.x + node.width), (-viewport.tx + viewport.width) / viewport.zoom);
  const maxY = Math.max(...positions.map((node) => node.y + node.height), (-viewport.ty + viewport.height) / viewport.zoom);
  const bounds = {
    x: minX - 96,
    y: minY - 96,
    width: Math.max(maxX - minX + 192, 1),
    height: Math.max(maxY - minY + 192, 1),
  };
  const scale = Math.min((minimapWidth - minimapPadding * 2) / bounds.width, (minimapHeight - minimapPadding * 2) / bounds.height);
  const toMiniX = (x: number) => minimapPadding + (x - bounds.x) * scale;
  const toMiniY = (y: number) => minimapPadding + (y - bounds.y) * scale;
  const nodeById = new Map(positions.map((node) => [node.id, node]));

  return {
    bounds,
    scale,
    nodes: positions.map((node) => ({
      ...node,
      x: toMiniX(node.x + node.width * 0.24),
      y: toMiniY(node.y + node.height * 0.32),
      width: Math.max(node.width * scale * 0.52, 8),
      height: Math.max(node.height * scale * 0.36, 4),
    })),
    edges: flowEdges.flatMap((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return [];
      return [
        {
          id: edge.id,
          sourceX: toMiniX(source.x + source.width / 2),
          sourceY: toMiniY(source.y + source.height),
          targetX: toMiniX(target.x + target.width / 2),
          targetY: toMiniY(target.y),
        },
      ];
    }),
    viewport: {
      x: toMiniX(-viewport.tx / viewport.zoom),
      y: toMiniY(-viewport.ty / viewport.zoom),
      width: (viewport.width / viewport.zoom) * scale,
      height: (viewport.height / viewport.zoom) * scale,
    },
  };
}

function AgentWorkflowView({
  agent,
  selectedStepId,
  selectedEdgeId,
  draft,
  edgeDraft,
  onSelectStep,
  onSelectEdge,
  onDraftChange,
  onEdgeDraftChange,
  onAddStep,
  onAddPaletteStep,
  onAddConnectedStep,
  workflowTestState,
  onTestWorkflow,
  onSaveWorkflow,
  onSaveStep,
  onDeleteStep,
  onOpenCodeEditor,
  onAddEdge,
  onDeleteEdge,
  onMoveStep,
  themeMode,
  onBack,
}: {
  agent: Agent;
  selectedStepId: string | null;
  selectedEdgeId: string | null;
  draft: WorkflowNodeDraft;
  edgeDraft: WorkflowEdgeDraft;
  onSelectStep: (stepId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onDraftChange: (field: keyof WorkflowNodeDraft, value: string) => void;
  onEdgeDraftChange: (field: keyof WorkflowEdgeDraft, value: string) => void;
  onAddStep: () => void;
  onAddPaletteStep: (item: WorkflowPaletteItem, position?: { x: number; y: number }) => void;
  onAddConnectedStep: (sourceStepId: string) => void;
  workflowTestState: WorkflowTestState;
  onTestWorkflow: () => void;
  onSaveWorkflow: () => void;
  onSaveStep: () => void;
  onDeleteStep: (stepId?: string) => void;
  onOpenCodeEditor: (stepId: string) => void;
  onAddEdge: (draft?: WorkflowEdgeDraft) => void;
  onDeleteEdge: (edgeId: string) => void;
  onMoveStep: (stepId: string, position: { x: number; y: number }) => void;
  themeMode: ThemeMode;
  onBack: () => void;
}) {
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<import("@antv/x6").Graph | null>(null);
  const onSelectStepRef = useRef(onSelectStep);
  const onSelectEdgeRef = useRef(onSelectEdge);
  const onAddEdgeRef = useRef(onAddEdge);
  const onMoveStepRef = useRef(onMoveStep);
  const selectedStepIdRef = useRef(selectedStepId);
  const selectedEdgeIdRef = useRef(selectedEdgeId);
  const layoutSignatureRef = useRef("");
  const canvasPanRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const minimapDragRef = useRef<{ pointerId: number; startX: number; startY: number; tx: number; ty: number; zoom: number; scale: number } | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [workflowZoom, setWorkflowZoom] = useState(1);
  const [workflowViewport, setWorkflowViewport] = useState<WorkflowViewport | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [nodeMenu, setNodeMenu] = useState<WorkflowNodeMenuState>(null);
  const selectedStep = selectedStepId ? agent.flow.find((step) => step.id === selectedStepId) : undefined;
  const menuStep = nodeMenu ? agent.flow.find((step) => step.id === nodeMenu.stepId) : undefined;
  const minimapModel = useMemo(
    () => (workflowViewport ? createWorkflowMinimapModel(agent.flow, agent.flowEdges, workflowViewport) : null),
    [agent.flow, agent.flowEdges, workflowViewport]
  );

  function setWorkflowPortVisibility(node: import("@antv/x6").Node, visibility: "visible" | "hidden") {
    if (node.hasPort("in")) node.setPortProp("in", "attrs/circle/style/visibility", visibility);
    if (node.hasPort("out")) node.setPortProp("out", "attrs/circle/style/visibility", visibility);
  }

  function syncWorkflowPortVisibility(node: import("@antv/x6").Node) {
    const connectedEdges = graphRef.current?.getConnectedEdges(node) ?? [];
    const hasInput = connectedEdges.some((edge) => edge.getTargetCellId() === node.id);
    const hasOutput = connectedEdges.some((edge) => edge.getSourceCellId() === node.id);
    if (node.hasPort("in")) node.setPortProp("in", "attrs/circle/style/visibility", hasInput ? "visible" : "hidden");
    if (node.hasPort("out")) node.setPortProp("out", "attrs/circle/style/visibility", hasOutput ? "visible" : "hidden");
  }

  function syncSelectedWorkflowNode() {
    const selectedId = selectedStepIdRef.current;
    graphContainerRef.current?.querySelectorAll<HTMLElement>(".workflow-step-node").forEach((node) => {
      node.classList.toggle("is-selected", node.dataset.stepId === selectedId);
    });
    const graph = graphRef.current;
    if (!graph) return;

    graph.getEdges().forEach((edge) => {
      const isSelected = edge.id === selectedEdgeIdRef.current;
      edge.attr("line/strokeWidth", isSelected ? 3 : 2);
      edge.attr("line/filter", isSelected ? "drop-shadow(0 0 4px rgba(17, 19, 24, 0.28))" : null);
    });
  }

  function syncWorkflowZoom() {
    const graph = graphRef.current;
    if (!graph) return;
    const zoom = graph.zoom();
    setWorkflowZoom(Number.isFinite(zoom) ? zoom : 1);
    syncWorkflowViewport();
  }

  function syncWorkflowViewport() {
    const graph = graphRef.current;
    const container = graphContainerRef.current;
    if (!graph || !container) return;
    setWorkflowViewport(createWorkflowViewport(graph, container));
  }

  function applyWorkflowZoom(nextZoom: number) {
    const graph = graphRef.current;
    if (!graph) return;
    const normalizedZoom = Math.min(workflowMaxZoom, Math.max(workflowMinZoom, Number(nextZoom.toFixed(2))));
    graph.zoomTo(normalizedZoom, { minScale: workflowMinZoom, maxScale: workflowMaxZoom });
    setWorkflowZoom(normalizedZoom);
    syncWorkflowViewport();
  }

  function focusWorkflowMinimap(event: React.PointerEvent<SVGSVGElement>) {
    const graph = graphRef.current;
    const container = graphContainerRef.current;
    if (!graph || !container || !minimapModel) return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const localX = minimapModel.bounds.x + (x - minimapPadding) / minimapModel.scale;
    const localY = minimapModel.bounds.y + (y - minimapPadding) / minimapModel.scale;
    const zoom = graph.zoom();
    graph.translate(container.clientWidth / 2 - localX * zoom, container.clientHeight / 2 - localY * zoom);
    syncWorkflowViewport();
  }

  function startWorkflowMinimapViewportDrag(event: React.PointerEvent<SVGRectElement>) {
    const graph = graphRef.current;
    if (!graph || !minimapModel) return;

    const translate = graph.translate();
    minimapDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tx: translate.tx,
      ty: translate.ty,
      zoom: graph.zoom(),
      scale: minimapModel.scale,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function dragWorkflowMinimapViewport(event: React.PointerEvent<SVGRectElement>) {
    const graph = graphRef.current;
    const drag = minimapDragRef.current;
    if (!graph || !drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    graph.translate(drag.tx - (dx / drag.scale) * drag.zoom, drag.ty - (dy / drag.scale) * drag.zoom);
    syncWorkflowViewport();
    event.preventDefault();
    event.stopPropagation();
  }

  function stopWorkflowMinimapViewportDrag(event: React.PointerEvent<SVGRectElement>) {
    const drag = minimapDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      minimapDragRef.current = null;
    }
    event.stopPropagation();
  }

  useEffect(() => {
    onSelectStepRef.current = onSelectStep;
  }, [onSelectStep]);

  useEffect(() => {
    onSelectEdgeRef.current = onSelectEdge;
  }, [onSelectEdge]);

  useEffect(() => {
    onAddEdgeRef.current = onAddEdge;
  }, [onAddEdge]);

  useEffect(() => {
    onMoveStepRef.current = onMoveStep;
  }, [onMoveStep]);

  useEffect(() => {
    selectedStepIdRef.current = selectedStepId;
  }, [selectedStepId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !graphReady) return;
    const themeGrid = workflowGridByTheme[themeMode];
    graph.drawBackground({ color: themeGrid.background });
    graph.drawGrid({
      type: "mesh",
      args: { color: themeGrid.grid, thickness: 1 },
    });
  }, [graphReady, themeMode]);

  useEffect(() => {
    let disposed = false;

    async function mountGraph() {
      const container = graphContainerRef.current;
      if (!container || graphRef.current) return;

      const { Graph, Shape } = await import("@antv/x6");
      if (disposed || !graphContainerRef.current) return;

      Graph.registerConnector(
        "agent-dag-connector",
        (sourcePoint, targetPoint) => {
          const offset = 10;
          const deltaY = Math.abs(targetPoint.y - sourcePoint.y);
          const control = Math.max(48, Math.floor((deltaY / 3) * 2));
          const v1 = { x: sourcePoint.x, y: sourcePoint.y + offset + control };
          const v2 = { x: targetPoint.x, y: targetPoint.y - offset - control };

          return `
            M ${sourcePoint.x} ${sourcePoint.y}
            L ${sourcePoint.x} ${sourcePoint.y + offset}
            C ${v1.x} ${v1.y} ${v2.x} ${v2.y} ${targetPoint.x} ${targetPoint.y - offset}
            L ${targetPoint.x} ${targetPoint.y}
          `;
        },
        true
      );

      Shape.HTML.register({
        shape: "workflow-step",
        width: 260,
        height: 76,
        html: (cell) => createWorkflowStepNodeElement(cell.getData<WorkflowStepNodeData>(), (stepId) => onSelectStepRef.current(stepId)),
      });

      const themeGrid = workflowGridByTheme[themeMode];

      graphRef.current = new Graph({
        container,
        autoResize: true,
        background: { color: themeGrid.background },
        grid: {
          visible: true,
          size: 28,
          type: "mesh",
          args: { color: themeGrid.grid, thickness: 1 },
        },
        interacting: {
          nodeMovable: true,
          edgeMovable: true,
          vertexMovable: false,
          magnetConnectable: true,
          useEdgeTools: true,
        },
        connecting: {
          snap: { radius: 32 },
          allowBlank: false,
          allowLoop: false,
          allowNode: false,
          allowEdge: false,
          allowPort: true,
          allowMulti: false,
          highlight: true,
          sourceAnchor: "bottom",
          targetAnchor: "top",
          connectionPoint: "anchor",
          connector: "agent-dag-connector",
          createEdge() {
            return this.createEdge({
              connector: "agent-dag-connector",
              attrs: {
                line: {
                  stroke: agent.accent,
                  strokeWidth: 2,
                  targetMarker: { name: "block", size: 7 },
                },
              },
            });
          },
          validateMagnet({ magnet }) {
            return magnet.getAttribute("port-group") === "out";
          },
          validateConnection({ sourceCell, targetCell, sourcePort, targetPort }) {
            return Boolean(sourceCell && targetCell && sourceCell.id !== targetCell.id && sourcePort === "out" && targetPort === "in");
          },
        },
        panning: {
          enabled: true,
          eventTypes: ["leftMouseDown", "rightMouseDown", "mouseWheel"],
        },
        mousewheel: {
          enabled: true,
          modifiers: ["ctrl", "meta"],
          minScale: workflowMinZoom,
          maxScale: workflowMaxZoom,
        },
      });

      graphRef.current.on("node:click", ({ node }) => {
        setNodeMenu(null);
        setInspectorOpen(true);
        onSelectStepRef.current(String(node.id));
        onSelectEdgeRef.current(null);
        const data = node.getData<WorkflowStepNodeData>();
        if (isCodeStep(data.step)) onOpenCodeEditor(String(node.id));
      });
      graphRef.current.on("edge:click", ({ edge }) => {
        setNodeMenu(null);
        setInspectorOpen(true);
        onSelectStepRef.current(null);
        onSelectEdgeRef.current(String(edge.id));
      });
      graphRef.current.on("node:contextmenu", ({ e, node }) => {
        e.preventDefault();
        setNodeMenu({ stepId: String(node.id), x: e.clientX, y: e.clientY });
        onSelectStepRef.current(String(node.id));
        onSelectEdgeRef.current(null);
      });
      graphRef.current.on("edge:connected", ({ edge, isNew }) => {
        if (!isNew) return;
        const sourceId = edge.getSourceCellId();
        const targetId = edge.getTargetCellId();
        if (!sourceId || !targetId || sourceId === targetId) {
          edge.remove();
          return;
        }
        edge.remove();
        onAddEdgeRef.current({ sourceId, targetId });
      });
      graphRef.current.on("node:moved", ({ node }) => {
        const position = node.position();
        onMoveStepRef.current(String(node.id), { x: position.x, y: position.y });
      });
      graphRef.current.on("blank:click", () => {
        setNodeMenu(null);
        onSelectStepRef.current(null);
        onSelectEdgeRef.current(null);
      });
      graphRef.current.on("scale", syncWorkflowZoom);
      graphRef.current.on("translate", syncWorkflowViewport);
      graphRef.current.on("node:mouseenter", ({ node }) => {
        setWorkflowPortVisibility(node, "visible");
      });
      graphRef.current.on("node:mouseleave", ({ node }) => {
        syncWorkflowPortVisibility(node);
      });
      setGraphReady(true);
    }

    void mountGraph();

    return () => {
      disposed = true;
      graphRef.current?.dispose();
      graphRef.current = null;
      setGraphReady(false);
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !graphReady) return;

    const layoutSignature = `${agent.id}:${agent.flow.map((step) => step.id).join("|")}`;
    const shouldCenter = layoutSignatureRef.current !== layoutSignature;
    const stepIds = new Set(agent.flow.map((step) => step.id));
    const nodes = agent.flow.map((step, index) =>
      graph.createNode({
        id: step.id,
        shape: "workflow-step",
        x: step.x ?? 96,
        y: step.y ?? index * 148 + 56,
        width: 260,
        height: 76,
        data: { step, accent: agent.accent } satisfies WorkflowStepNodeData,
        ports: {
          groups: {
            in: { position: "top", attrs: { circle: { r: 7, magnet: true, stroke: agent.accent, strokeWidth: 2, fill: "#F8FAFC", style: { visibility: "hidden" } } } },
            out: { position: "bottom", attrs: { circle: { r: 7, magnet: true, stroke: agent.accent, strokeWidth: 2, fill: agent.accent, style: { visibility: "hidden" } } } },
          },
          items: [
            { id: "in", group: "in" },
            { id: "out", group: "out" },
          ],
        },
      })
    );

    const edges = agent.flowEdges.filter((edge) => stepIds.has(edge.source) && stepIds.has(edge.target)).map((edge) =>
      graph.createEdge({
        id: edge.id,
        source: { cell: edge.source, port: "out" },
        target: { cell: edge.target, port: "in" },
        connector: "agent-dag-connector",
        attrs: {
          line: {
            cursor: "pointer",
            stroke: agent.flow.find((step) => step.id === edge.target)?.status === "error" ? warningAccent : agent.accent,
            strokeWidth: edge.id === selectedEdgeId ? 3 : 2,
            strokeDasharray: agent.flow.find((step) => step.id === edge.target)?.status === "running" ? 6 : "",
            style: {
              animation: agent.flow.find((step) => step.id === edge.target)?.status === "running" ? "workflow-running-line 24s infinite linear" : "",
            },
            targetMarker: { name: "block", size: 7 },
          },
        },
      })
    );

    graph.resetCells([...nodes, ...edges]);
    graph.getNodes().forEach((node) => {
      syncWorkflowPortVisibility(node);
    });
    if (shouldCenter) {
      graph.translate(0, 0);
      layoutSignatureRef.current = layoutSignature;
    }
    syncWorkflowZoom();
    syncWorkflowViewport();

    const selectionFrame = window.requestAnimationFrame(syncSelectedWorkflowNode);
    return () => window.cancelAnimationFrame(selectionFrame);
  }, [agent.id, agent.accent, agent.flow, agent.flowEdges, graphReady]);

  useEffect(() => {
    if (!graphReady) return;
    selectedStepIdRef.current = selectedStepId;
    selectedEdgeIdRef.current = selectedEdgeId;
    const selectionFrame = window.requestAnimationFrame(syncSelectedWorkflowNode);
    return () => window.cancelAnimationFrame(selectionFrame);
  }, [graphReady, selectedStepId, selectedEdgeId]);

  function handlePaletteDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("application/x-workflow-palette")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handlePaletteDrop(event: React.DragEvent<HTMLDivElement>) {
    const key = event.dataTransfer.getData("application/x-workflow-palette");
    const item = workflowPalette.find((entry) => entry.key === key);
    if (!item) return;

    event.preventDefault();
    const graph = graphRef.current;
    const localPoint = graph?.clientToLocal(event.clientX, event.clientY);
    onAddPaletteStep(item, {
      x: (localPoint?.x ?? 170) - 130,
      y: (localPoint?.y ?? 86) - 46,
    });
  }

  function handleCanvasMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | SVGElement;
    if (target.closest(".x6-node, .x6-edge, .x6-port, .palette-card")) return;
    setNodeMenu(null);
    const graph = graphRef.current;
    if (!graph) return;
    const currentTranslate = graph.translate();
    canvasPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      tx: currentTranslate.tx,
      ty: currentTranslate.ty,
    };
    event.preventDefault();
  }

  function handleCanvasMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const pan = canvasPanRef.current;
    const graph = graphRef.current;
    if (!pan || !graph) return;
    graph.translate(pan.tx + event.clientX - pan.startX, pan.ty + event.clientY - pan.startY);
    syncWorkflowViewport();
  }

  function handleCanvasMouseUp() {
    canvasPanRef.current = null;
  }

  return (
    <section className="workflow-view">
      <div className="workflow-toolbar" style={{ "--accent": agent.accent } as CSSProperties}>
        <button type="button" onClick={onBack}>
          返回工作台
        </button>
        <div>
          <h2>{agent.name} 工作流</h2>
          <span>{agent.task}</span>
        </div>
        <div className="workflow-status">
          <strong>{getStatusLabel(agent.status)}</strong>
          <span className="workflow-state-pill">
            {isAgentFlowCompleted(agent) ? (
              <>
                <CheckCircleFilled /> 完成
              </>
            ) : agent.status === "running" ? (
              <>
                <Spin className="detail-status-spinner" size="small" /> 工作中
              </>
            ) : (
              "可编辑"
            )}
          </span>
          <button className="workflow-action is-test" type="button" disabled={workflowTestState.status === "running"} onClick={onTestWorkflow}>
            {workflowTestState.status === "running" ? "测试中" : "测试"}
          </button>
          <button className="workflow-action is-save" type="button" disabled={workflowTestState.status !== "passed"} onClick={onSaveWorkflow}>
            保存
          </button>
        </div>
      </div>
      <div className={`workflow-body ${inspectorOpen ? "" : "is-inspector-closed"}`}>
        <WorkflowPalette onAdd={onAddPaletteStep} onAddCustom={onAddStep} />
        <div
          className="workflow-canvas"
          onDragOver={handlePaletteDragOver}
          onDrop={handlePaletteDrop}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          <div className="workflow-graph-surface" ref={graphContainerRef} />
          <div className="workflow-map-control" style={{ "--accent": agent.accent } as CSSProperties}>
            {minimapModel ? (
              <svg
                className="workflow-minimap"
                width={minimapWidth}
                height={minimapHeight}
                viewBox={`0 0 ${minimapWidth} ${minimapHeight}`}
                role="img"
                aria-label="流程小地图"
                onPointerDown={focusWorkflowMinimap}
              >
                <rect className="workflow-minimap-bg" x="0.5" y="0.5" width={minimapWidth - 1} height={minimapHeight - 1} rx="8" />
                {minimapModel.edges.map((edge) => (
                  <path
                    key={edge.id}
                    className="workflow-minimap-edge"
                    d={`M ${edge.sourceX} ${edge.sourceY} C ${edge.sourceX} ${(edge.sourceY + edge.targetY) / 2} ${edge.targetX} ${(edge.sourceY + edge.targetY) / 2} ${edge.targetX} ${edge.targetY}`}
                  />
                ))}
                {minimapModel.nodes.map((node) => (
                  <rect
                    key={node.id}
                    className={`workflow-minimap-node is-${node.status}`}
                    style={{ "--node-accent": node.accent, "--node-soft": node.soft } as CSSProperties}
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="2"
                  />
                ))}
                <rect
                  className="workflow-minimap-viewport"
                  x={minimapModel.viewport.x}
                  y={minimapModel.viewport.y}
                  width={Math.max(minimapModel.viewport.width, 8)}
                  height={Math.max(minimapModel.viewport.height, 8)}
                  rx="4"
                  onPointerDown={startWorkflowMinimapViewportDrag}
                  onPointerMove={dragWorkflowMinimapViewport}
                  onPointerUp={stopWorkflowMinimapViewportDrag}
                  onPointerCancel={stopWorkflowMinimapViewportDrag}
                />
              </svg>
            ) : null}
            <div className="workflow-zoom-control" aria-label="流程缩放控制">
              <button type="button" aria-label="缩小流程" onClick={() => applyWorkflowZoom(workflowZoom - workflowZoomStep)}>
                -
              </button>
              <span>{Math.round(workflowZoom * 100)}%</span>
              <button type="button" aria-label="放大流程" onClick={() => applyWorkflowZoom(workflowZoom + workflowZoomStep)}>
                +
              </button>
            </div>
          </div>
        </div>
        {inspectorOpen ? (
          <WorkflowInspector
            agent={agent}
            selectedStep={selectedStep}
            selectedEdgeId={selectedEdgeId}
            draft={draft}
            edgeDraft={edgeDraft}
            onDraftChange={onDraftChange}
            onEdgeDraftChange={onEdgeDraftChange}
            onSave={onSaveStep}
            onDelete={onDeleteStep}
            onOpenCodeEditor={(step) => onOpenCodeEditor(step.id)}
            onAddEdge={onAddEdge}
            onDeleteEdge={onDeleteEdge}
            onSelectEdge={onSelectEdge}
            onClose={() => setInspectorOpen(false)}
          />
        ) : null}
      </div>
      {nodeMenu && menuStep ? (
        <div
          className="workflow-node-menu"
          style={{ left: nodeMenu.x, top: nodeMenu.y } as CSSProperties}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          role="menu"
          aria-label={`${menuStep.label} 节点菜单`}
        >
          <div className="workflow-node-menu-head">
            <strong>{menuStep.label}</strong>
            <span>{getFlowStatusLabel(menuStep.status)}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setInspectorOpen(true);
              setNodeMenu(null);
              onSelectStep(menuStep.id);
              onSelectEdge(null);
            }}
          >
            查看详情
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setInspectorOpen(true);
              setNodeMenu(null);
              onAddConnectedStep(menuStep.id);
            }}
          >
            增加节点
          </button>
          {isCodeStep(menuStep) ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setNodeMenu(null);
                onOpenCodeEditor(menuStep.id);
              }}
            >
              编辑代码
            </button>
          ) : null}
          <button
            className="is-danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setNodeMenu(null);
              onSelectStep(menuStep.id);
              onSelectEdge(null);
              onDeleteStep(menuStep.id);
            }}
          >
            删除节点
          </button>
        </div>
      ) : null}
    </section>
  );
}

function CanvasViewport({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="canvas-scroll">
      <div className="canvas-pan-layer">{children}</div>
    </div>
  );
}

function WorkspaceView({
  agents,
  selectedAgentId,
  detailAgentId,
  detailDrawerSide,
  detailClosing,
  workflowAgentId,
  selectedWorkflowStepId,
  selectedWorkflowEdgeId,
  workflowDraft,
  workflowEdgeDraft,
  workflowTestState,
  contextMenu,
  newAgentId,
  pendingAgentSelection,
  onSelectAgent,
  onOpenAgentWorkflow,
  onSelectWorkflowStep,
  onSelectWorkflowEdge,
  onWorkflowDraftChange,
  onWorkflowEdgeDraftChange,
  onAddWorkflowStep,
  onAddWorkflowPaletteStep,
  onAddConnectedWorkflowStep,
  onTestWorkflow,
  onSaveWorkflow,
  onSaveWorkflowStep,
  onDeleteWorkflowStep,
  onOpenCodeEditor,
  onAddWorkflowEdge,
  onDeleteWorkflowEdge,
  onMoveWorkflowStep,
  onCloseAgent,
  onClosedAgent,
  onStartAgent,
  onStopAgent,
  onOpenAgentMenu,
  onCloseAgentMenu,
  onRenameAgent,
  onDeleteAgent,
  onAddAgent,
  onResetAgents,
  themeMode,
}: {
  agents: Agent[];
  selectedAgentId: number | null;
  detailAgentId: number | null;
  detailDrawerSide: DetailDrawerSide;
  detailClosing: boolean;
  workflowAgentId: number | null;
  selectedWorkflowStepId: string | null;
  selectedWorkflowEdgeId: string | null;
  workflowDraft: WorkflowNodeDraft;
  workflowEdgeDraft: WorkflowEdgeDraft;
  workflowTestState: WorkflowTestState;
  contextMenu: WorkstationMenuState;
  newAgentId: number | null;
  pendingAgentSelection: PendingAgentSelection;
  onSelectAgent: (id: number, side?: DetailDrawerSide) => void;
  onOpenAgentWorkflow: (id: number) => void;
  onSelectWorkflowStep: (stepId: string | null) => void;
  onSelectWorkflowEdge: (edgeId: string | null) => void;
  onWorkflowDraftChange: (field: keyof WorkflowNodeDraft, value: string) => void;
  onWorkflowEdgeDraftChange: (field: keyof WorkflowEdgeDraft, value: string) => void;
  onAddWorkflowStep: () => void;
  onAddWorkflowPaletteStep: (item: WorkflowPaletteItem, position?: { x: number; y: number }) => void;
  onAddConnectedWorkflowStep: (sourceStepId: string) => void;
  onTestWorkflow: () => void;
  onSaveWorkflow: () => void;
  onSaveWorkflowStep: () => void;
  onDeleteWorkflowStep: (stepId?: string) => void;
  onOpenCodeEditor: (stepId: string) => void;
  onAddWorkflowEdge: (draft?: WorkflowEdgeDraft) => void;
  onDeleteWorkflowEdge: (edgeId: string) => void;
  onMoveWorkflowStep: (stepId: string, position: { x: number; y: number }) => void;
  onCloseAgent: () => void;
  onClosedAgent: () => void;
  onStartAgent: (id: number) => void;
  onStopAgent: (id: number) => void;
  onOpenAgentMenu: (id: number, event: AgentMenuOpenEvent) => void;
  onCloseAgentMenu: () => void;
  onRenameAgent: (agent: Agent) => void;
  onDeleteAgent: (id: number) => void;
  onAddAgent: () => void;
  onResetAgents: () => void;
  themeMode: ThemeMode;
}) {
  const selectedAgent = detailAgentId ? agents.find((agent) => agent.id === detailAgentId) : undefined;
  const activeAgent = selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) : undefined;
  const menuAgent = contextMenu ? agents.find((agent) => agent.id === contextMenu.agentId) : undefined;
  const workflowAgent = workflowAgentId ? agents.find((agent) => agent.id === workflowAgentId) : undefined;
  const workbenchSubtitle = activeAgent ? `${activeAgent.name} · ${activeAgent.task}` : `${agents.length} 个 Agent 在线`;
  const detailVisible = Boolean(detailAgentId && !detailClosing);
  const workstationAgents = useMemo<WorkstationCardAgent[]>(
    () =>
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        title: agent.title,
        task: agent.task,
        accent: agent.accent,
        status: agent.status,
        completed: isAgentFlowCompleted(agent),
      })),
    [agents]
  );
  const handleSelectAgent = useCallback((id: number, side?: DetailDrawerSide) => onSelectAgent(id, side), [onSelectAgent]);
  const handleOpenAgentMenu = useCallback((id: number, event: AgentMenuOpenEvent) => onOpenAgentMenu(id, event), [onOpenAgentMenu]);

  useEffect(() => {
    if (!newAgentId || workflowAgent) return;

    const frame = window.requestAnimationFrame(() => {
      const scroller = document.querySelector<HTMLElement>(".canvas-scroll");
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [newAgentId, workflowAgent]);

  useEffect(() => {
    if (!pendingAgentSelection?.openDetail || workflowAgent) return;

    const openTimer = window.setTimeout(() => {
      const newNode = document.querySelector<HTMLElement>(`.workstation-node[data-agent-id="${pendingAgentSelection.agentId}"]`);
      onSelectAgent(pendingAgentSelection.agentId, newNode ? getDetailDrawerSide(newNode) : "right");
    }, 260);

    return () => window.clearTimeout(openTimer);
  }, [onSelectAgent, pendingAgentSelection, workflowAgent]);

  function closeDetailFromCanvas(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".workstation-node, .agent-detail-panel")) return;
    onCloseAgent();
  }

  return (
    <section className="workspace-view">
      <section className="canvas-panel">
        {workflowAgent ? (
          <AgentWorkflowView
            key={workflowAgent.id}
            agent={workflowAgent}
            selectedStepId={selectedWorkflowStepId}
            selectedEdgeId={selectedWorkflowEdgeId}
            draft={workflowDraft}
            edgeDraft={workflowEdgeDraft}
            onSelectStep={onSelectWorkflowStep}
            onSelectEdge={onSelectWorkflowEdge}
            onDraftChange={onWorkflowDraftChange}
            onEdgeDraftChange={onWorkflowEdgeDraftChange}
            onAddStep={onAddWorkflowStep}
            onAddPaletteStep={onAddWorkflowPaletteStep}
            onAddConnectedStep={onAddConnectedWorkflowStep}
            workflowTestState={workflowTestState}
            onTestWorkflow={onTestWorkflow}
            onSaveWorkflow={onSaveWorkflow}
            onSaveStep={onSaveWorkflowStep}
            onDeleteStep={onDeleteWorkflowStep}
            onOpenCodeEditor={onOpenCodeEditor}
            onAddEdge={onAddWorkflowEdge}
            onDeleteEdge={onDeleteWorkflowEdge}
            onMoveStep={onMoveWorkflowStep}
            themeMode={themeMode}
            onBack={() => onOpenAgentWorkflow(0)}
          />
        ) : (
          <>
            <div className="canvas-toolbar">
              <div>
                <h2>实时工作台</h2>
                <span>{workbenchSubtitle}</span>
              </div>
              <div className="canvas-tools">
                <button className="dark-button" type="button" onClick={onAddAgent}>
                  新增
                </button>
                <button type="button" onClick={onResetAgents}>
                  重置
                </button>
              </div>
            </div>
            <div className="canvas-body" onPointerDown={closeDetailFromCanvas}>
              <CanvasViewport>
                <div className="infinite-canvas">
                  {workstationAgents.map((agent, index) => (
                    <WorkstationNode
                      key={agent.id}
                      agent={agent}
                      index={index}
                      selected={selectedAgentId === agent.id}
                      isNew={newAgentId === agent.id}
                      onSelect={(side) => handleSelectAgent(agent.id, side)}
                      onOpenMenu={(event) => handleOpenAgentMenu(agent.id, event)}
                    />
                  ))}
                </div>
              </CanvasViewport>
              <AgentDetailPanel agent={selectedAgent} side={detailDrawerSide} visible={detailVisible} onClose={onCloseAgent} onClosed={onClosedAgent} onStart={onStartAgent} onStop={onStopAgent} />
            </div>
          </>
        )}
      </section>
      <WorkstationContextMenu menu={contextMenu} agent={menuAgent} onEnter={onOpenAgentWorkflow} onRename={onRenameAgent} onDelete={onDeleteAgent} onClose={onCloseAgentMenu} />
    </section>
  );
}

function ConfigView({
  config,
  showKey,
  onChange,
  onToggleKey,
  onSave,
}: {
  config: Config;
  showKey: boolean;
  onChange: (field: keyof Config, value: string) => void;
  onToggleKey: () => void;
  onSave: () => void;
}) {
  return (
    <section className="config-view">
      <form className="config-card" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <label className="field">
          <span>Base URL</span>
          <input value={config.baseUrl} placeholder="https://api.openai-compatible.com/v1" onChange={(event) => onChange("baseUrl", event.target.value)} />
        </label>
        <label className="field">
          <span>API Key</span>
          <div className="secret-field">
            <input type={showKey ? "text" : "password"} value={config.apiKey} placeholder="sk-..." onChange={(event) => onChange("apiKey", event.target.value)} />
            <button type="button" onClick={onToggleKey}>
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </label>
        <label className="field">
          <span>Model</span>
          <input value={config.model} onChange={(event) => onChange("model", event.target.value)} />
        </label>
        <label className="field">
          <span>默认任务</span>
          <textarea value={config.task} onChange={(event) => onChange("task", event.target.value)} />
        </label>
        <button className="primary-action" type="submit">
          保存配置
        </button>
      </form>

      <aside className="config-side">
        <div className="config-check">
          <Icon name="key" />
          <div>
            <strong>{config.apiKey ? "API Key 已填写" : "API Key 未填写"}</strong>
            <span>{config.baseUrl || "等待 Base URL"}</span>
          </div>
        </div>
        <div className="endpoint-card">
          <span>代理接口</span>
          <strong>/api/agent-chat</strong>
          <p>生成页会通过 Next API Route 转发到 OpenAI-compatible chat completions。</p>
        </div>
      </aside>
    </section>
  );
}

function GenerateView({
  config,
  isGenerating,
  error,
  output,
  usage,
  onChange,
  onGenerate,
}: {
  config: Config;
  isGenerating: boolean;
  error: string;
  output: string;
  usage: Usage | null;
  onChange: (field: keyof Config, value: string) => void;
  onGenerate: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="generate-view">
      <form className="generate-card" onSubmit={onGenerate}>
        <label className="field">
          <span>任务目标</span>
          <textarea value={config.task} onChange={(event) => onChange("task", event.target.value)} />
        </label>
        <button className="primary-action" type="submit" disabled={isGenerating}>
          {isGenerating ? "生成中" : "开始生成"}
        </button>
      </form>

      <section className="generation-result">
        <div className="result-head">
          <h2>模型返回</h2>
          <div className="usage-row">
            <span>Prompt {usage?.prompt_tokens ?? "-"}</span>
            <span>Completion {usage?.completion_tokens ?? "-"}</span>
            <span>Total {usage?.total_tokens ?? "-"}</span>
          </div>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <pre>{output || "生成后，模型返回内容会进入这里，并同步写入每个 Agent 的详情流。"}</pre>
      </section>
    </section>
  );
}

function LogsView({ logs }: { logs: LogEntry[] }) {
  return (
    <section className="logs-view">
      {logs.map((log) => (
        <article key={log.id} className="log-row" style={{ "--accent": log.accent } as CSSProperties}>
          <span className="log-bullet" />
          <time>{log.time}</time>
          <strong>{log.name}</strong>
          <p>{log.action}</p>
        </article>
      ))}
    </section>
  );
}

export default function StationPage() {
  const [activeView, setActiveView] = useState<ViewKey>("workspace");
  const [config, setConfig] = useState<Config>({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    task: "帮我整理这个产品页面的定位、卖点和下一步行动清单。",
  });
  const [showKey, setShowKey] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(() => seedAgentInput.map(makeAgent));
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<number | null>(null);
  const [detailDrawerSide, setDetailDrawerSide] = useState<DetailDrawerSide>("right");
  const [detailClosing, setDetailClosing] = useState(false);
  const [workflowAgentId, setWorkflowAgentId] = useState<number | null>(null);
  const [selectedWorkflowStepId, setSelectedWorkflowStepId] = useState<string | null>(null);
  const [selectedWorkflowEdgeId, setSelectedWorkflowEdgeId] = useState<string | null>(null);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowNodeDraft>({
    label: "",
    detail: "",
    status: "queued",
  });
  const [workflowEdgeDraft, setWorkflowEdgeDraft] = useState<WorkflowEdgeDraft>({ sourceId: "", targetId: "" });
  const [contextMenu, setContextMenu] = useState<WorkstationMenuState>(null);
  const [renameAgent, setRenameAgent] = useState<RenameAgentState>(null);
  const [newAgentId, setNewAgentId] = useState<number | null>(null);
  const [pendingAgentSelection, setPendingAgentSelection] = useState<PendingAgentSelection>(null);
  const [nextAgentId, setNextAgentId] = useState(seedAgentInput.length + 1);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "seed-log", time: "10:23:51", name: "数据研究员", action: "工作站已就绪", accent: accentColors[0] },
  ]);
  const [runtime, setRuntime] = useState("00:00:00");
  const [completedRuns, setCompletedRuns] = useState(0);
  const [processedTotal, setProcessedTotal] = useState(2841);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutput, setGeneratedOutput] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [workflowTestState, setWorkflowTestState] = useState<WorkflowTestState>({
    agentId: null,
    status: "idle",
    message: "测试通过后才能保存流程。",
  });
  const [codeEditor, setCodeEditor] = useState<CodeEditorState>(null);
  const startedAtRef = useRef<number | null>(null);
  const runtimeTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const detailCloseTimerRef = useRef<number | null>(null);
  const contextMenuCloseTimerRef = useRef<number | null>(null);

  function clearDetailCloseTimer() {
    if (detailCloseTimerRef.current) window.clearTimeout(detailCloseTimerRef.current);
    detailCloseTimerRef.current = null;
  }

  function clearContextMenuCloseTimer() {
    if (contextMenuCloseTimerRef.current) window.clearTimeout(contextMenuCloseTimerRef.current);
    contextMenuCloseTimerRef.current = null;
  }

  function selectAgent(agentId: number, side: DetailDrawerSide = "right") {
    clearDetailCloseTimer();
    setPendingAgentSelection((current) => (current?.agentId === agentId ? null : current));
    setDetailDrawerSide(side);
    setDetailAgentId(agentId);
    setDetailClosing(false);
    setSelectedAgentId(agentId);
  }

  function closeDetailAgent() {
    if (!detailAgentId || detailClosing) return;
    clearDetailCloseTimer();
    setSelectedAgentId(null);
    setDetailClosing(true);
    detailCloseTimerRef.current = window.setTimeout(() => {
      setDetailAgentId(null);
      setDetailClosing(false);
      detailCloseTimerRef.current = null;
    }, 380);
  }

  function finishDetailClose() {
    clearDetailCloseTimer();
    setSelectedAgentId(null);
    setDetailAgentId(null);
    setDetailClosing(false);
  }

  function addLog(name: string, action: string, accent: string) {
    setLogs((current) => [{ id: `${Date.now()}-${Math.random()}`, time: formatTime(), name, action, accent }, ...current].slice(0, 24));
  }

  function updateConfig(field: keyof Config, value: string) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  function saveConfig() {
    window.localStorage.setItem("agent-station-base-url", config.baseUrl.trim());
    window.localStorage.setItem("agent-station-model", config.model.trim());
    addLog("配置 API", "已保存接口配置", systemAccent);
  }

  function openAgentMenu(agentId: number, event: AgentMenuOpenEvent) {
    event.preventDefault();
    event.stopPropagation();

    const targetRect = event.currentTarget.getBoundingClientRect();
    const clientX = "clientX" in event && event.clientX ? event.clientX : targetRect.left + targetRect.width / 2;
    const clientY = "clientY" in event && event.clientY ? event.clientY : targetRect.top + targetRect.height / 2;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;

    clearContextMenuCloseTimer();
    selectAgent(agentId, getDetailDrawerSide(event.currentTarget));
    setContextMenu({
      agentId,
      name: agent.name,
      title: agent.title,
      accent: agent.accent,
      x: Math.min(clientX, window.innerWidth - 210),
      y: Math.min(clientY, window.innerHeight - 168),
      closing: false,
    });
  }

  function closeAgentMenu() {
    clearContextMenuCloseTimer();
    setContextMenu((current) => (current ? { ...current, closing: true } : null));
    contextMenuCloseTimerRef.current = window.setTimeout(() => {
      setContextMenu(null);
      contextMenuCloseTimerRef.current = null;
    }, 190);
  }

  function openRenameAgent(agent: Agent) {
    closeAgentMenu();
    setRenameAgent({ agentId: agent.id, name: agent.name });
  }

  function closeRenameAgent() {
    setRenameAgent(null);
  }

  function confirmRenameAgent() {
    if (!renameAgent) return;

    const nextName = renameAgent.name.trim();
    if (!nextName) return;

    const agent = agents.find((item) => item.id === renameAgent.agentId);
    if (!agent) {
      closeRenameAgent();
      return;
    }

    setAgents((current) =>
      current.map((item) =>
        item.id === renameAgent.agentId
          ? {
              ...item,
              name: nextName,
              lastUpdated: formatTime(),
              flow: item.flow.map((step) =>
                step.id === "token" && step.detail === `${item.name} 等待读取授权`
                  ? {
                      ...step,
                      detail: `${nextName} 等待读取授权`,
                    }
                  : step
              ),
            }
          : item
      )
    );
    addLog(agent.name, `重命名为 ${nextName}`, agent.accent);
    closeRenameAgent();
  }

  function selectWorkflowStep(stepId: string | null) {
    setSelectedWorkflowStepId(stepId);
    if (stepId) setSelectedWorkflowEdgeId(null);
    if (!stepId) return;

    const agent = agents.find((item) => item.id === workflowAgentId);
    const step = agent?.flow.find((item) => item.id === stepId);
    if (!step) return;

    setWorkflowDraft({
      label: step.label,
      detail: step.detail,
      status: step.status,
    });
  }

  function selectWorkflowEdge(edgeId: string | null) {
    setSelectedWorkflowEdgeId(edgeId);
    if (edgeId) setSelectedWorkflowStepId(null);

    const agent = agents.find((item) => item.id === workflowAgentId);
    const edge = agent?.flowEdges.find((item) => item.id === edgeId);
    if (!edge) return;

    setWorkflowEdgeDraft({ sourceId: edge.source, targetId: edge.target });
  }

  function updateWorkflowDraft(field: keyof WorkflowNodeDraft, value: string) {
    setWorkflowDraft((current) => ({
      ...current,
      [field]: field === "status" && flowStatusOptions.some((option) => option.value === value) ? (value as FlowStatus) : value,
    }));
  }

  function updateWorkflowEdgeDraft(field: keyof WorkflowEdgeDraft, value: string) {
    setWorkflowEdgeDraft((current) => {
      const next = { ...current, [field]: value };
      if (next.sourceId && next.sourceId === next.targetId) {
        return field === "sourceId" ? { ...next, targetId: "" } : { ...next, sourceId: "" };
      }
      return next;
    });
  }

  function updateWorkflowStep(agentId: number, updater: (agent: Agent) => Agent) {
    setWorkflowTestState((current) =>
      current.agentId === agentId ? { agentId, status: "idle", message: "流程已变更，请重新测试。" } : current
    );
    setAgents((current) => current.map((agent) => (agent.id === agentId ? updater(agent) : agent)));
  }

  function updateWorkflowStepSilently(agentId: number, updater: (agent: Agent) => Agent) {
    setAgents((current) => current.map((agent) => (agent.id === agentId ? updater(agent) : agent)));
  }

  function openCodeEditor(stepId: string) {
    if (!workflowAgentId) return;
    const agent = agents.find((item) => item.id === workflowAgentId);
    const step = agent?.flow.find((item) => item.id === stepId);
    if (!agent || !step || !isCodeStep(step)) return;
    const language = step.codeLanguage ?? "javascript";
    setCodeEditor({
      agentId: agent.id,
      stepId: step.id,
      title: step.label,
      language,
      code: step.code ?? codeTemplates[language],
    });
  }

  function closeCodeEditor() {
    setCodeEditor(null);
  }

  function updateCodeEditorLanguage(language: CodeLanguage) {
    setCodeEditor((current) =>
      current
        ? {
            ...current,
            language,
            code: current.code.trim() ? current.code : codeTemplates[language],
          }
        : current
    );
  }

  function saveCodeEditor() {
    if (!codeEditor) return;
    updateWorkflowStep(codeEditor.agentId, (agent) => ({
      ...agent,
      lastUpdated: formatTime(),
      flow: agent.flow.map((step) =>
        step.id === codeEditor.stepId
          ? {
              ...step,
              kind: "code",
              codeLanguage: codeEditor.language,
              code: codeEditor.code,
              detail: codeEditor.code.trim() ? `${codeLanguageOptions.find((item) => item.value === codeEditor.language)?.label ?? codeEditor.language} 代码已配置。` : step.detail,
            }
          : step
      ),
    }));
    addLog(codeEditor.title, "代码已保存到节点", systemAccent);
    closeCodeEditor();
  }

  function openAgentWorkflow(agentId: number) {
    closeAgentMenu();
    if (!agentId) {
      setWorkflowAgentId(null);
      setSelectedWorkflowStepId(null);
      setSelectedWorkflowEdgeId(null);
      setWorkflowEdgeDraft({ sourceId: "", targetId: "" });
      setWorkflowTestState({ agentId: null, status: "idle", message: "测试通过后才能保存流程。" });
      return;
    }
    const agent = agents.find((item) => item.id === agentId);
    if (agent?.status === "running") {
      addLog(agent.name, "执行中不可进入工作流", warningAccent);
      return;
    }
    const firstStep = agent?.flow[0];
    selectAgent(agentId, detailDrawerSide);
    setWorkflowAgentId(agentId);
    setSelectedWorkflowStepId(firstStep?.id ?? null);
    setSelectedWorkflowEdgeId(null);
    setWorkflowDraft({
      label: firstStep?.label ?? "",
      detail: firstStep?.detail ?? "",
      status: firstStep?.status ?? "queued",
    });
    setWorkflowEdgeDraft(createDefaultEdgeDraft(agent));
    setWorkflowTestState({ agentId, status: "idle", message: "测试通过后才能保存流程。" });
    addLog(agents.find((agent) => agent.id === agentId)?.name || "工位", "进入工作流视图", systemAccent);
  }

  function startAgent(agentId: number) {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent || agent.status === "running") return;

    setAgents((current) =>
      current.map((item) => {
        if (item.id !== agentId) return item;
        const nextFlow = item.flow.map((step, index) => ({
          ...step,
          status: index === 0 ? ("running" as FlowStatus) : ("queued" as FlowStatus),
        }));
        return {
          ...item,
          status: "running",
          output: "正在执行任务。",
          lastUpdated: formatTime(),
          flow: nextFlow,
        };
      })
    );
    addLog(agent.name, "开始执行", agent.accent);
    if (!runtimeTimerRef.current || !progressTimerRef.current) startSimulation();
  }

  function stopAgent(agentId: number) {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;

    setAgents((current) =>
      current.map((item) =>
        item.id === agentId
          ? {
              ...item,
              status: "resting",
              output: "任务已停止，当前休息中。",
              lastUpdated: formatTime(),
              flow: item.flow.map((step) => (step.status === "running" ? { ...step, status: "queued" } : step)),
            }
          : item
      )
    );
    if (agents.filter((item) => item.status === "running" && item.id !== agentId).length === 0) {
      clearTimers();
    }
    addLog(agent.name, "已停止并进入休息", agent.accent);
  }

  function addWorkflowStep() {
    const agent = agents.find((item) => item.id === workflowAgentId);
    if (!agent) return;
    const step = createWorkflowStep(agent);

    updateWorkflowStep(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
      flow: [...currentAgent.flow, step],
    }));
    setSelectedWorkflowStepId(step.id);
    setWorkflowDraft({
      label: step.label,
      detail: step.detail,
      status: step.status,
    });
    setWorkflowEdgeDraft({ sourceId: "", targetId: "" });
    addLog(agent.name, "新增工作流节点", agent.accent);
  }

  function addWorkflowPaletteStep(item: WorkflowPaletteItem, position?: { x: number; y: number }) {
    const agent = agents.find((entry) => entry.id === workflowAgentId);
    if (!agent) return;

    const step = createWorkflowPaletteStep(agent, item, position);
    updateWorkflowStep(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
      flow: [...currentAgent.flow, step],
    }));
    setSelectedWorkflowStepId(step.id);
    setSelectedWorkflowEdgeId(null);
    setWorkflowDraft({
      label: step.label,
      detail: step.detail,
      status: step.status,
    });
    setWorkflowEdgeDraft({ sourceId: "", targetId: "" });
    if (item.key === "code") {
      setCodeEditor({
        agentId: agent.id,
        stepId: step.id,
        title: step.label,
        language: step.codeLanguage ?? "javascript",
        code: step.code ?? codeTemplates.javascript,
      });
    }
    addLog(agent.name, `新增${item.title}节点`, agent.accent);
  }

  function addConnectedWorkflowStep(sourceStepId: string) {
    const agent = agents.find((entry) => entry.id === workflowAgentId);
    const sourceStep = agent?.flow.find((step) => step.id === sourceStepId);
    if (!agent || !sourceStep) return;

    const step = createConnectedWorkflowStep(agent, sourceStep);
    const edge: FlowEdge = {
      id: createWorkflowEdgeId(sourceStep.id, step.id),
      source: sourceStep.id,
      target: step.id,
    };

    updateWorkflowStep(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
      flow: [...currentAgent.flow, step],
      flowEdges: [...currentAgent.flowEdges.filter((item) => item.id !== edge.id), edge],
    }));
    setSelectedWorkflowStepId(step.id);
    setSelectedWorkflowEdgeId(null);
    setWorkflowDraft({
      label: step.label,
      detail: step.detail,
      status: step.status,
    });
    setWorkflowEdgeDraft({ sourceId: sourceStep.id, targetId: step.id });
    addLog(agent.name, `从 ${sourceStep.label} 增加节点`, agent.accent);
  }

  function saveWorkflowStep() {
    if (!workflowAgentId || !selectedWorkflowStepId) return;
    const label = workflowDraft.label.trim() || "未命名节点";
    const detail = workflowDraft.detail.trim() || "等待补充节点说明。";

    updateWorkflowStep(workflowAgentId, (agent) => ({
      ...agent,
      lastUpdated: formatTime(),
      flow: agent.flow.map((step) =>
        step.id === selectedWorkflowStepId
          ? {
              ...step,
              label,
              detail,
              status: workflowDraft.status,
            }
          : step
      ),
    }));
    setWorkflowDraft((current) => ({ ...current, label, detail }));
    const agent = agents.find((item) => item.id === workflowAgentId);
    if (agent) addLog(agent.name, "已保存工作流节点", agent.accent);
  }

  function deleteWorkflowStep(stepId = selectedWorkflowStepId ?? "") {
    if (!workflowAgentId || !stepId) return;
    const agent = agents.find((item) => item.id === workflowAgentId);
    if (!agent || agent.flow.length <= 1) return;

    const removedIndex = agent.flow.findIndex((step) => step.id === stepId);
    const nextFlow = agent.flow.filter((step) => step.id !== stepId);
    const nextStep = nextFlow[Math.max(0, Math.min(removedIndex, nextFlow.length - 1))];

    updateWorkflowStep(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
      flow: currentAgent.flow.filter((step) => step.id !== stepId),
      flowEdges: currentAgent.flowEdges.filter((edge) => edge.source !== stepId && edge.target !== stepId),
    }));
    setSelectedWorkflowStepId(nextStep?.id ?? null);
    setSelectedWorkflowEdgeId(null);
    setWorkflowDraft({
      label: nextStep?.label ?? "",
      detail: nextStep?.detail ?? "",
      status: nextStep?.status ?? "queued",
    });
    setWorkflowEdgeDraft(createDefaultEdgeDraft({ ...agent, flow: nextFlow, flowEdges: agent.flowEdges.filter((edge) => edge.source !== stepId && edge.target !== stepId) }));
    addLog(agent.name, "已删除工作流节点", warningAccent);
  }

  function addWorkflowEdge(nextDraft = workflowEdgeDraft) {
    if (!workflowAgentId) return;
    const sourceId = nextDraft.sourceId;
    const targetId = nextDraft.targetId;
    if (!sourceId || !targetId || sourceId === targetId) return;

    const agent = agents.find((item) => item.id === workflowAgentId);
    if (!agent) return;

    const sourceExists = agent.flow.some((step) => step.id === sourceId);
    const targetExists = agent.flow.some((step) => step.id === targetId);
    if (!sourceExists || !targetExists) return;

    const edgeId = createWorkflowEdgeId(sourceId, targetId);
    if (agent.flowEdges.some((edge) => edge.id === edgeId)) {
      setSelectedWorkflowStepId(null);
      setSelectedWorkflowEdgeId(edgeId);
      addLog(agent.name, "连线已存在，已定位到该连线", agent.accent);
      return;
    }

    const edge: FlowEdge = { id: edgeId, source: sourceId, target: targetId };
    setWorkflowEdgeDraft({ sourceId, targetId });
    updateWorkflowStep(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
      flowEdges: [...currentAgent.flowEdges, edge],
    }));
    setSelectedWorkflowStepId(null);
    setSelectedWorkflowEdgeId(edge.id);
    addLog(agent.name, `新增连线：${getWorkflowStepName(agent, sourceId)} → ${getWorkflowStepName(agent, targetId)}`, agent.accent);
  }

  function deleteWorkflowEdge(edgeId: string) {
    if (!workflowAgentId) return;
    const agent = agents.find((item) => item.id === workflowAgentId);
    if (!agent) return;
    const edge = agent.flowEdges.find((item) => item.id === edgeId);

    updateWorkflowStep(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
      flowEdges: currentAgent.flowEdges.filter((item) => item.id !== edgeId),
    }));
    if (selectedWorkflowEdgeId === edgeId) setSelectedWorkflowEdgeId(null);
    if (edge) {
      setWorkflowEdgeDraft({ sourceId: edge.source, targetId: edge.target });
      addLog(agent.name, `已删除连线：${getWorkflowStepName(agent, edge.source)} → ${getWorkflowStepName(agent, edge.target)}`, warningAccent);
    }
  }

  async function testWorkflow() {
    if (!workflowAgentId || workflowTestState.status === "running") return;
    const agent = agents.find((item) => item.id === workflowAgentId);
    if (!agent) return;

    const result = evaluateWorkflowConnectivity(agent);
    setWorkflowTestState({ agentId: agent.id, status: "running", message: "正在测试流程连通性。" });
    addLog(agent.name, "开始测试工作流", agent.accent);

    for (const stepId of result.orderedIds) {
      updateWorkflowStepSilently(agent.id, (currentAgent) => ({
        ...currentAgent,
        flow: currentAgent.flow.map((step) => ({
          ...step,
          status: step.id === stepId ? "running" : result.orderedIds.includes(step.id) ? step.status : "queued",
        })),
      }));
      await wait(520);
      updateWorkflowStepSilently(agent.id, (currentAgent) => ({
        ...currentAgent,
        flow: currentAgent.flow.map((step) => (step.id === stepId ? { ...step, status: "done" } : step)),
      }));
    }

    if (!result.passed) {
      updateWorkflowStepSilently(agent.id, (currentAgent) => ({
        ...currentAgent,
        flow: currentAgent.flow.map((step) => ({
          ...step,
          status: step.id === result.failedId ? "error" : result.orderedIds.includes(step.id) ? step.status : "queued",
        })),
      }));
      setWorkflowTestState({ agentId: agent.id, status: "failed", message: result.message });
      addLog(agent.name, `测试未通过：${result.message}`, warningAccent);
      return;
    }

    setWorkflowTestState({ agentId: agent.id, status: "passed", message: "测试通过，可以保存流程。" });
    addLog(agent.name, "工作流测试通过", successAccent);
  }

  function saveWorkflow() {
    if (!workflowAgentId || workflowTestState.agentId !== workflowAgentId || workflowTestState.status !== "passed") return;
    const agent = agents.find((item) => item.id === workflowAgentId);
    if (!agent) return;

    updateWorkflowStepSilently(agent.id, (currentAgent) => ({
      ...currentAgent,
      lastUpdated: formatTime(),
    }));
    addLog(agent.name, "工作流已保存", successAccent);
  }

  function moveWorkflowStep(stepId: string, position: { x: number; y: number }) {
    if (!workflowAgentId) return;
    setAgents((current) =>
      current.map((agent) =>
        agent.id === workflowAgentId
          ? {
              ...agent,
              flow: agent.flow.map((step) => (step.id === stepId ? { ...step, x: Math.round(position.x), y: Math.round(position.y) } : step)),
            }
          : agent
      )
    );
  }

  function deleteAgent(agentId: number) {
    const agent = agents.find((item) => item.id === agentId);
    setAgents((current) => current.filter((item) => item.id !== agentId));
    if (selectedAgentId === agentId) closeDetailAgent();
    setDetailAgentId((current) => (current === agentId ? null : current));
    setWorkflowAgentId((current) => (current === agentId ? null : current));
    if (workflowAgentId === agentId) setSelectedWorkflowStepId(null);
    setNewAgentId((current) => (current === agentId ? null : current));
    closeAgentMenu();
    if (agent) addLog(agent.name, "已删除工位", warningAccent);
  }

  function clearTimers() {
    if (runtimeTimerRef.current) window.clearInterval(runtimeTimerRef.current);
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    clearDetailCloseTimer();
    clearContextMenuCloseTimer();
    runtimeTimerRef.current = null;
    progressTimerRef.current = null;
  }

  function startSimulation() {
    startedAtRef.current = Date.now();
    clearTimers();
    runtimeTimerRef.current = window.setInterval(() => {
      if (startedAtRef.current) setRuntime(formatDuration(Date.now() - startedAtRef.current));
    }, 1000);
    progressTimerRef.current = window.setInterval(() => {
      setAgents((current) => {
        let changed = false;
        const updated = current.map((agent) => {
          if (agent.status !== "running") return agent;
          const nextFlow = advanceFlow(agent.flow);
          if (nextFlow === agent.flow) return agent;
          changed = true;
          return {
            ...agent,
            lastUpdated: formatTime(),
            flow: nextFlow,
          };
        });
        if (!changed) return current;
        const activeAgents = updated.filter((agent) => agent.status === "running");
        const agent = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        if (agent) {
          const action = sampleActions[Math.floor(Math.random() * sampleActions.length)];
          setLogs((currentLogs) => [{ id: `${Date.now()}-${agent.id}`, time: formatTime(), name: agent.name, action, accent: agent.accent }, ...currentLogs].slice(0, 24));
        }
        return updated;
      });
    }, 1100);
  }

  async function callModel(currentAgents: Agent[]) {
    const response = await fetch("/api/agent-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: config.baseUrl.trim(),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
        messages: [
          { role: "system", content: "你是一个高效、可靠的中文 AI 工作站调度器。" },
          { role: "user", content: buildPrompt(config.task, currentAgents) },
        ],
      }),
    });
    const payload = (await response.json()) as AgentChatResponse;
    if (!response.ok) throw new Error(payload.error || "模型调用失败");
    return payload;
  }

  async function runGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveView("generate");

    if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
      setError("请先在配置 API 页面填写 Base URL、API Key 和模型名称。");
      return;
    }

    if (!config.task.trim()) {
      setError("请先输入任务目标。");
      return;
    }

    const runningAgents = agents.map((agent) => {
      const flow = [
        { id: "token", label: "API Token", detail: "授权信息已进入代理接口", status: "done" as FlowStatus, x: 96, y: 56 },
        { id: "request", label: "请求拼装", detail: "正在拼接任务和工位上下文", status: "running" as FlowStatus, x: 96, y: 226 },
        { id: "model", label: "模型返回", detail: "等待第三方模型响应", status: "queued" as FlowStatus, x: 96, y: 396 },
        { id: "parse", label: "内容解析", detail: "等待返回文本", status: "queued" as FlowStatus, x: 96, y: 566 },
        { id: "output", label: "工位输出", detail: "等待写入", status: "queued" as FlowStatus, x: 96, y: 736 },
      ];
      return {
        ...agent,
        status: "running" as AgentStatus,
        output: "正在等待模型返回。",
        lastUpdated: formatTime(),
        flow,
        flowEdges: createLinearFlowEdges(flow),
      };
    });

    setAgents(runningAgents);
    setGeneratedOutput("");
    setError("");
    setUsage(null);
    setIsGenerating(true);
    addLog("生成", "已启动模型请求", systemAccent);
    startSimulation();

    try {
      const payload = await callModel(runningAgents);
      const content = payload.content || "模型已返回，但没有可展示的文本内容。";
      setGeneratedOutput(content);
      setUsage(payload.usage || null);
      setCompletedRuns((current) => current + 1);
      setProcessedTotal((current) => current + runningAgents.length * 86);
      setAgents((current) =>
        current.map((agent) => {
          const workflow = completedWorkflow(agent.name, content, payload.usage);
          return {
            ...agent,
            status: "idle",
            output: `${agent.name} 已处理：${content}`,
            lastUpdated: formatTime(),
            ...workflow,
          };
        })
      );
      addLog("生成", "模型返回已同步到全部工位", successAccent);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "请求失败";
      setError(message);
      setAgents((current) =>
        current.map((agent) => {
          const workflow = failedWorkflow(message);
          return {
            ...agent,
            status: "error",
            output: message,
            lastUpdated: formatTime(),
            ...workflow,
          };
        })
      );
      addLog("生成", `调用失败：${message}`, warningAccent);
    } finally {
      clearTimers();
      setIsGenerating(false);
    }
  }

  function addAgent() {
    const agent = createAgent(nextAgentId, agents.length);
    setAgents((current) => [...current, agent]);
    closeDetailAgent();
    setWorkflowAgentId(null);
    setSelectedWorkflowStepId(null);
    setSelectedWorkflowEdgeId(null);
    setNewAgentId(agent.id);
    setPendingAgentSelection({ agentId: agent.id, openDetail: true });
    setNextAgentId((current) => current + 1);
    addLog(agent.name, "已加入实时工作台", agent.accent);
    window.setTimeout(() => setNewAgentId(null), 900);
  }

  function resetAgents() {
    const nextAgents = seedAgentInput.map(makeAgent);
    setAgents(nextAgents);
    closeDetailAgent();
    setWorkflowAgentId(null);
    setSelectedWorkflowStepId(null);
    setSelectedWorkflowEdgeId(null);
    setWorkflowEdgeDraft({ sourceId: "", targetId: "" });
    setContextMenu(null);
    setPendingAgentSelection(null);
    setNextAgentId(seedAgentInput.length + 1);
    setNewAgentId(null);
    setGeneratedOutput("");
    setError("");
    setUsage(null);
    setCompletedRuns(0);
    setProcessedTotal(2841);
    setRuntime("00:00:00");
    clearTimers();
    addLog("工作站", "已重置全部工位", systemAccent);
  }

  useEffect(() => {
    const savedBaseUrl = window.localStorage.getItem("agent-station-base-url");
    const savedModel = window.localStorage.getItem("agent-station-model");
    setConfig((current) => ({
      ...current,
      baseUrl: savedBaseUrl || current.baseUrl,
      model: savedModel || current.model,
    }));
    setAgents((current) => current.map((agent, index) => ({ ...agent, accent: accentColors[index % accentColors.length] })));
    setLogs((current) =>
      current.map((log) => {
        const normalizedAccent = log.accent.toLowerCase();
        if (normalizedAccent === "#111111" || normalizedAccent === "#050505") return { ...log, accent: systemAccent };
        if (normalizedAccent === "#ff3442" || normalizedAccent === "#c91d2e") return { ...log, accent: warningAccent };
        if (normalizedAccent === "#22c76f") return { ...log, accent: successAccent };
        return log;
      })
    );
  }, []);

  useEffect(() => {
    window.localStorage.setItem("agent-station-theme", themeMode);
  }, [themeMode]);

  useEffect(() => clearTimers, []);

  return (
    <AppShell
      activeView={activeView}
      setActiveView={setActiveView}
      navCollapsed={navCollapsed}
      onToggleNav={() => setNavCollapsed((current) => !current)}
      themeMode={themeMode}
      onToggleTheme={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
      agents={agents}
      runtime={runtime}
      processedTotal={processedTotal}
      completedRuns={completedRuns}
    >
      {activeView !== "workspace" ? <TopBar activeView={activeView} /> : null}
      {activeView === "workspace" ? (
        <WorkspaceView
          agents={agents}
          selectedAgentId={selectedAgentId}
          detailAgentId={detailAgentId}
          detailDrawerSide={detailDrawerSide}
          detailClosing={detailClosing}
          workflowAgentId={workflowAgentId}
          selectedWorkflowStepId={selectedWorkflowStepId}
          selectedWorkflowEdgeId={selectedWorkflowEdgeId}
          workflowDraft={workflowDraft}
          workflowEdgeDraft={workflowEdgeDraft}
          workflowTestState={workflowTestState}
          contextMenu={contextMenu}
          newAgentId={newAgentId}
          pendingAgentSelection={pendingAgentSelection}
          onSelectAgent={selectAgent}
          onOpenAgentWorkflow={openAgentWorkflow}
          onSelectWorkflowStep={selectWorkflowStep}
          onSelectWorkflowEdge={selectWorkflowEdge}
          onWorkflowDraftChange={updateWorkflowDraft}
          onWorkflowEdgeDraftChange={updateWorkflowEdgeDraft}
          onAddWorkflowStep={addWorkflowStep}
          onAddWorkflowPaletteStep={addWorkflowPaletteStep}
          onAddConnectedWorkflowStep={addConnectedWorkflowStep}
          onTestWorkflow={testWorkflow}
          onSaveWorkflow={saveWorkflow}
          onSaveWorkflowStep={saveWorkflowStep}
          onDeleteWorkflowStep={deleteWorkflowStep}
          onOpenCodeEditor={openCodeEditor}
          onAddWorkflowEdge={addWorkflowEdge}
          onDeleteWorkflowEdge={deleteWorkflowEdge}
          onMoveWorkflowStep={moveWorkflowStep}
          onCloseAgent={closeDetailAgent}
          onClosedAgent={finishDetailClose}
          onStartAgent={startAgent}
          onStopAgent={stopAgent}
          onOpenAgentMenu={openAgentMenu}
          onCloseAgentMenu={closeAgentMenu}
          onRenameAgent={openRenameAgent}
          onDeleteAgent={deleteAgent}
          onAddAgent={addAgent}
          onResetAgents={resetAgents}
          themeMode={themeMode}
        />
      ) : null}
      {activeView === "config" ? <ConfigView config={config} showKey={showKey} onChange={updateConfig} onToggleKey={() => setShowKey((current) => !current)} onSave={saveConfig} /> : null}
      {activeView === "generate" ? <GenerateView config={config} isGenerating={isGenerating} error={error} output={generatedOutput} usage={usage} onChange={updateConfig} onGenerate={runGeneration} /> : null}
      {activeView === "logs" ? <LogsView logs={logs} /> : null}
      <Modal
        title="重命名工位"
        open={Boolean(renameAgent)}
        okText="保存"
        cancelText="取消"
        onCancel={closeRenameAgent}
        onOk={confirmRenameAgent}
        okButtonProps={{ disabled: !renameAgent?.name.trim() }}
        destroyOnHidden
      >
        <Input
          autoFocus
          aria-label="工位名称"
          value={renameAgent?.name ?? ""}
          maxLength={24}
          showCount
          onChange={(event) => setRenameAgent((current) => (current ? { ...current, name: event.target.value } : current))}
          onPressEnter={confirmRenameAgent}
        />
      </Modal>
      <Modal
        title={codeEditor ? `${codeEditor.title} · 代码框` : "代码框"}
        open={Boolean(codeEditor)}
        okText="保存代码"
        cancelText="取消"
        width={760}
        onCancel={closeCodeEditor}
        onOk={saveCodeEditor}
        destroyOnHidden
      >
        {codeEditor ? (
          <div className="code-editor-modal">
            <label className="field" htmlFor="code-language">
              <span>语言</span>
              <Select
                id="code-language"
                className="code-language-select"
                value={codeEditor.language}
                options={codeLanguageOptions}
                onChange={(value) => updateCodeEditorLanguage(value)}
              />
            </label>
            <label className="field" htmlFor="workflow-code-input">
              <span>代码</span>
              <CodeMirrorEditor
                value={codeEditor.code}
                language={codeEditor.language}
                onChange={(nextCode) => setCodeEditor((current) => (current ? { ...current, code: nextCode } : current))}
              />
            </label>
            <div className="code-hints" aria-label="代码提示">
              {getCodeHints(codeEditor.language, codeEditor.code).map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() =>
                    setCodeEditor((current) =>
                      current
                        ? {
                            ...current,
                            code: `${current.code}${current.code.endsWith("\n") || !current.code ? "" : "\n"}${hint}`,
                          }
                        : current
                    )
                  }
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}
