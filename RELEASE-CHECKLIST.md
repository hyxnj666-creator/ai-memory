# 发布检查清单

## 发布前

### 代码质量
- [ ] `npm run typecheck` 通过（零错误）
- [ ] `npm test` 通过（所有测试）
- [ ] `npm run build` 成功

### 文档
- [ ] `README.md` 切换为英文发布版（当前中英双语，README.md 已是英文）
- [ ] `README.zh-CN.md` 中文版保留
- [ ] `CHANGELOG.md` 更新（如需要）

### npm 包
- [ ] `package.json` 版本号正确
- [ ] `files` 字段包含 `dist`、`README.md`、`LICENSE`
- [ ] `bin` 字段指向 `./dist/index.js`
- [ ] `engines.node` 设为 `>=18`

### 最终验证
- [ ] `npx tsx src/index.ts --help` 输出正确
- [ ] `npx tsx src/index.ts init` 正常运行
- [ ] `npx tsx src/index.ts extract --dry-run` 可以检测到 Cursor

## 发布步骤

```bash
# 1. 构建
npm run build

# 2. 登录 npm（如果未登录）
npm login

# 3. 发布
npm publish --access public

# 4. 打 git tag
git tag v0.1.0
git push origin v0.1.0
```

## 发布后

- [ ] 推送 GitHub 仓库
- [ ] 写掘金中文文章
- [ ] 写 Dev.to 英文文章
- [ ] 发 Reddit r/webdev / r/programming
- [ ] 更新 `MEMORY.md` 状态
