import type { Metadata } from "next";
import type { ReactNode } from "react";
import "antd/dist/reset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 员工站",
  description: "多 Agent 工作台、API 配置和模型生成画布",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
