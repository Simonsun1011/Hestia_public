import { defineConfig } from "vitest/config";

// 测试不加载工作台的数据插件（插件会起定时器）
export default defineConfig({
  test: { include: ["src/**/*.test.mjs"], environment: "node" },
});
