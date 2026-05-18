# 求职轨迹 Trail

> 会写、会练、会复盘的求职操作系统。  
> 用 ChatGPT 改简历每次都是从零开始；用 Trail，每一次投递都让下一次更准。

🔗 **Live Demo**：_部署完成后回填_

---

## 这是什么

**Trail** 是一个为应届产品 / 运营 / AI 方向求职者打造的个人副项目。把每一次"找 JD → 改简历 → 面试 → 复盘"的循环结构化沉淀下来，让项目库随每场面试自动迭代。

它的定位是个人作品集，不是商业 SaaS。

## 解决什么问题

```
传统流程                            Trail 的差异
─────────────                       ─────────────
每次改简历从零开始        →         项目库一次构建，AI 按 JD 自动定制
面试问答靠回忆            →         结构化复盘 + 失分点沉淀
项目讲不深、答不出数据      →        AI 反向标注被追问 / 答崩的项目
投了 N 家不知道哪条改进     →        投递反馈数据构成闭环
```

## 核心功能

- 📚 **项目历程库**：上传一份完整简历 PDF，AI 自动拆解出 Profile / 基础简历 / 项目库三块
- 🎯 **JD 定制简历**：粘贴 JD → AI 从项目库挑最相关的项目 → 重组简历 markdown / HTML 片段
- 📝 **投递管理**：每个 JD 一条投递记录，自动联动面试轮次推进状态
- 🎙️ **面试复盘**：记问答、失分点、下一步行动；AI **同步**从每场面试抽出"涉及哪些项目、追问到哪里、应该补什么"，反向沉淀回项目库
- 🔁 **项目库反向视图**：每条项目能看到"曾被追问 N 次"，下次定制简历时优先打磨答崩过的

## 技术栈

| 层 | 用了什么 |
|---|---|
| 框架 | Next.js 16 (App Router, Turbopack), React 19 |
| 样式 | Tailwind CSS v4 |
| 数据 | Supabase (Postgres + Auth + RLS) |
| Migrations | Supabase CLI |
| AI | Anthropic SDK · DeepSeek v4 Pro (Anthropic 兼容端点) |
| 部署 | Vercel |

## 本地开发

```bash
git clone https://github.com/<你的 username>/<这个 repo>.git
cd <repo>/web
npm install

cp .env.local.example .env.local
# 填入你的 Supabase + DeepSeek 凭据

npm run dev
```

需要的环境变量参见 [.env.local.example](.env.local.example)。

## 数据库

所有 schema 变更走 Supabase CLI migrations（`supabase/migrations/`）。本地有 Docker 时可以：

```bash
npx supabase db reset --local   # 验证 migration 重放
npx supabase db push            # 推到远端
```

## Roadmap

- [x] v0.1 Skill 形态零成本起步（job-hunt-copilot）
- [x] v0.2 Web 化 · 投递 / 面试 / 项目 / Profile 数据层
- [x] v0.3 AI 同步抽取面试 → 项目库反向信号
- [ ] v0.4 UI 打磨 + 移动端
- [ ] v0.5 周度复盘 / 投递反馈数据可视化

## 作者

黄子强 · zharzyc@gmail.com

## License

[MIT](./LICENSE)
