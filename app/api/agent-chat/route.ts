import { NextResponse } from "next/server";

type ChatRequestBody = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
};

function resolveEndpoint(baseUrl: string) {
  const trimmed = String(baseUrl || "").trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Base URL 必须以 http:// 或 https:// 开头");
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");

  if (withoutTrailingSlash.endsWith("/chat/completions")) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/chat/completions`;
}

function getAssistantContent(payload: unknown) {
  const record = payload as {
    choices?: Array<{
      message?: { content?: string | Array<string | { text?: string; content?: string }> };
      text?: string;
    }>;
  };
  const messageContent = record.choices?.[0]?.message?.content;

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === "string") return part;
        return part.text || part.content || "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof messageContent === "string") return messageContent;
  if (typeof record.choices?.[0]?.text === "string") return record.choices[0].text;

  return "";
}

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求体不是有效 JSON" }, { status: 400 });
  }

  const baseUrl = body.baseUrl?.trim();
  const apiKey = body.apiKey?.trim();
  const model = body.model?.trim();
  const messages = body.messages;

  if (!baseUrl || !apiKey || !model || !messages?.length) {
    return NextResponse.json({ error: "缺少 Base URL、API Key、模型名称或消息内容" }, { status: 400 });
  }

  let endpoint: string;
  try {
    endpoint = resolveEndpoint(baseUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Base URL 无效" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        stream: false,
      }),
      signal: controller.signal,
    });

    const text = await upstreamResponse.text();
    let payload: unknown = {};

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { text };
    }

    if (!upstreamResponse.ok) {
      const record = payload as { error?: { message?: string }; message?: string; text?: string };
      return NextResponse.json(
        {
          error: record.error?.message || record.message || record.text || `第三方模型返回 ${upstreamResponse.status}`,
          raw: payload,
        },
        { status: upstreamResponse.status }
      );
    }

    return NextResponse.json({
      content: getAssistantContent(payload),
      raw: payload,
      usage: (payload as { usage?: unknown }).usage || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error && error.name === "AbortError" ? "第三方模型请求超时" : error instanceof Error ? error.message : "第三方模型请求失败",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
