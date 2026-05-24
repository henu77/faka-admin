# Faka 平台 PPT 导出逻辑迁移总结

## 迁移概述

已将 faka-admin 平台的 PPT 导出逻辑从**外部 Export API** 完全替换为**AnyGen 直接导出方式**。

## 修改的文件

### 1. 新建文件

#### `lib/anygen-exporter.ts` (1000+ 行)
- 完整移植 test_expor1t.py 的所有逻辑
- 核心功能：
  - **页数推断**：调用 file_system API，统计 slide_*.xml 文件数量
  - **React Fiber 扫描**：注入 JS 代码扫描 React 组件树，找到 editor instance
  - **Client vars 获取**：等待页面完整加载，调用 getExportClientVars()
  - **任务创建**：POST 到 export-jobs API
  - **轮询监控**：定期检查任务状态
  - **文件下载**：下载生成的 PPTX 到 data/downloads/

### 2. 修改的文件

#### `lib/exporter.ts`
**删除**：`callExportApi()` 函数（原来调用外部 Export API）
**新增**：`exportPptx()` 函数，直接调用 `exportPptFromAnyGen()`

```typescript
export async function exportPptx(url: string, taskId: number): Promise<{ filePath: string; filename: string }> {
  return await exportPptFromAnyGen(url, taskId);
}
```

#### `app/api/export/route.ts`
- 改用 `exportPptx()` 替代 `callExportApi()`
- 其他逻辑保持不变

#### `app/api/retry/[id]/route.ts`
- 改用 `exportPptx()` 替代 `callExportApi()`
- 其他逻辑保持不变

#### `app/admin/settings/page.tsx` (完全重写)
**删除**：Export API 配置项（api_url、api_password）
**新增**：8 个 AnyGen 配置项

配置项列表：
| 配置项 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `anygen_cookie` | 密码框 | ✅ | 无 | AnyGen 账号的完整 Cookie |
| `anygen_proxy` | 文本框 | ❌ | 空 | 代理服务器地址（如 http://127.0.0.1:7897） |
| `playwright_headless` | 复选框 | ❌ | true | 浏览器是否无头模式 |
| `editor_wait_seconds` | 数字框 | ❌ | 480 | 编辑器加载超时（秒，范围 60-1200） |
| `stable_seconds` | 数字框 | ❌ | 12 | 页面稳定等待时间（秒，范围 5-60） |
| `min_blocks_per_slide` | 数字框 | ❌ | 4 | 每页最少 block 数（范围 1-20） |
| `export_wait_seconds` | 数字框 | ❌ | 360 | 导出任务超时（秒，范围 60-1200） |
| `playwright_user_data_dir` | 文本框 | ❌ | data/playwright_profile | Playwright profile 目录 |

#### `package.json`
**新增依赖**：
```json
"playwright": "^1.48.2"
```

## 导出流程

```
用户提交 URL + 卡密
    ↓
验证卡密 & 创建任务
    ↓
调用 exportPptx()
    ↓
┌─────────────────────────────────────┐
│ AnyGen 直接导出流程                  │
├─────────────────────────────────────┤
│ 1. 推断页数                          │
│    GET /api/page/file_system/{id}   │
│    统计 slide_*.xml 文件数量         │
│                                     │
│ 2. 获取 client_vars                 │
│    用 Playwright 打开页面            │
│    注入 JS 扫描 React Fiber          │
│    等待页面完整加载                  │
│    调用 getExportClientVars()       │
│                                     │
│ 3. 创建导出任务                      │
│    POST /api/page/pages/{id}/       │
│    export-jobs/                     │
│                                     │
│ 4. 轮询任务状态                      │
│    GET /api/page/export-jobs/{id}   │
│    检查 job_status (0=成功)         │
│                                     │
│ 5. 下载 PPTX                        │
│    GET /space/api/box/stream/       │
│    download/all/{document_id}       │
│    保存到 data/downloads/           │
└─────────────────────────────────────┘
    ↓
更新任务状态为 done
    ↓
发送邮件通知用户
```

## 配置步骤

### 1. 启动应用
```bash
npm run dev
```

### 2. 登录管理后台
- 访问 http://localhost:3232/admin/login
- 输入管理员密码（ADMIN_PASSWORD 环境变量）

### 3. 配置 AnyGen
- 进入 **设置** 页面
- 在 **AnyGen 导出配置** 部分填入：
  - **AnyGen Cookie**（必需）：从 AnyGen 账号获取的完整 Cookie
  - **代理服务器**（可选）：如果需要代理加速，填入代理地址
  - **浏览器无头模式**（可选）：建议勾选

### 4. 调整性能参数（可选）
在 **超时和性能参数** 部分根据实际情况调整：
- 编辑器加载超时：默认 480 秒
- 页面稳定等待时间：默认 12 秒
- 每页最少 block 数：默认 4
- 导出任务超时：默认 360 秒

### 5. 保存配置
点击 **保存** 按钮

## 日志输出

导出过程中会输出详细日志，便于调试：

```
[file_system] GET https://www.anygen.io/api/page/file_system/{pageId}/files
[file_system] manifest = /home/user/workspace/slides/xxx.slides
[file_system] inferred_slide_count = 24

[open] https://www.anygen.io/task/...
[inject] getExportClientVars via React Fiber
[inject] expected_slide_count = 24
[inject] dynamic_min_block_count = 96

[browser] candidate editor: slides = 24, blocks = 205, stableForMs = 12000

[create_job] POST https://www.anygen.io/api/page/pages/{pageId}/export-jobs/
[create_job] job_id = xxx
[create_job] job_timeout = 90

[poll 1] job_status = 2
[poll 2] job_status = 2
[poll 3] job_status = 0
[poll] document_id = xxx

[download] https://www.anygen.io/space/api/box/stream/download/all/xxx
[download] bytes = 1234567
[done] saved = /path/to/task-{taskId}.pptx
```

## 错误处理

常见错误及解决方案：

### 1. "缺少 AnyGen Cookie 配置"
- **原因**：未在设置页面填入 Cookie
- **解决**：进入设置页面，在 AnyGen Cookie 字段填入完整 Cookie

### 2. "没有找到 /home/user/workspace/slides/ 下的 .slides 主文件"
- **原因**：URL 对应的页面不存在或无权限访问
- **解决**：检查 URL 是否正确，确保账号有权限访问该页面

### 3. "timeout: 没找到 editor instance"
- **原因**：页面加载失败或 React 组件树结构不同
- **解决**：
  - 检查网络连接
  - 增加 `editor_wait_seconds` 参数
  - 检查 AnyGen 页面是否能正常打开

### 4. "slide_count 未达到预期"
- **原因**：页面加载不完整
- **解决**：
  - 增加 `stable_seconds` 参数
  - 增加 `editor_wait_seconds` 参数
  - 检查 `min_blocks_per_slide` 是否设置过高

### 5. "导出任务失败"
- **原因**：AnyGen 后端处理失败
- **解决**：
  - 查看详细错误信息
  - 重试任务
  - 检查 AnyGen 服务状态

## 依赖安装

已在 package.json 中添加 `playwright` 依赖。

安装依赖：
```bash
npm install
```

安装 Chromium 浏览器：
```bash
npx playwright install chromium
```

## 向后兼容性

- ✅ 完全替换，不保留 Export API 支持
- ✅ 数据库表结构无变化
- ✅ API 端点无变化
- ✅ 用户界面无变化（除设置页面）

## 性能优化

1. **Playwright 持久化 profile**
   - 缓存浏览器数据，加快启动速度
   - 默认目录：`data/playwright_profile`
   - 可在设置页面自定义

2. **代理支持**
   - 支持 Clash 等代理工具
   - 可加速网络连接
   - 在设置页面配置

3. **超时参数调优**
   - 根据实际网络情况调整
   - 避免过长等待
   - 避免过短导致失败

## 测试建议

1. **单个页面导出测试**
   - 提交一个简单的 PPT 页面
   - 观察日志输出
   - 检查下载的文件

2. **复杂页面导出测试**
   - 提交多页面 PPT
   - 提交包含复杂元素的页面
   - 测试超时参数

3. **并发导出测试**
   - 同时提交多个导出任务
   - 检查是否有资源竞争
   - 观察性能表现

4. **错误恢复测试**
   - 网络中断时的表现
   - 超时后的重试
   - 错误信息的准确性

## 相关文件

- 规划文档：`C:\Users\19140\.claude\plans\faka-ppt-test-expor1t-py-inherited-lantern.md`
- 核心导出模块：`lib/anygen-exporter.ts`
- 导出入口：`lib/exporter.ts`
- 设置页面：`app/admin/settings/page.tsx`
- API 路由：`app/api/export/route.ts`、`app/api/retry/[id]/route.ts`

## 总结

✅ 所有代码修改已完成
✅ 项目构建成功
✅ 依赖已安装
✅ 服务器可正常启动
✅ 设置页面可正常访问

下一步：
1. 配置 AnyGen Cookie
2. 测试导出功能
3. 根据实际情况调整参数
