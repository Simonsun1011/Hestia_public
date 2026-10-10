---
description: 不依赖 NAS 和定时任务的 Infans Studio Mac 手动备份方法
tags: [Mac, 备份, 使用说明]
---

# Mac 备份方法

清洁版不安装自动备份任务。建议使用 Mac 自带 Time Machine 或手动复制两份同级目录：

```text
Infans_Studio/
Infans_Support/
```

## 简单做法

1. 修改前退出开发服务。
2. 在 Finder 中把上述两个目录复制到外置硬盘或可信的加密云盘。
3. 文件夹名加日期，例如 `Infans_Studio_2026-08-30`。
4. 随机打开几份 Markdown、图片，并在备份副本中运行一次 `pnpm install && pnpm build`。
5. 保留至少“最近一次”和“上一次确认可用”两份备份。

不要备份 `node_modules/` 和 `dist/`；它们可由 `pnpm install` 与 `pnpm build` 重建。不要把密码、令牌或银行卡资料补进 Studio 后再同步到普通云盘。
