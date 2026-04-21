# 发布检查清单

## 发布前

### 代码质量
- [ ] `npm run typecheck` 通过（零错误）
- [ ] `npm test` 通过（所有测试）
- [ ] `npm run build` 成功

### 文档
- [ ] `README.md` 英文版已更新
- [ ] `README.zh-CN.md` 中文版已更新
- [ ] `CHANGELOG.md` 已更新

### npm 包
- [ ] `package.json` 版本号正确
- [ ] `files` 字段包含 `dist`、`README.md`、`LICENSE`
- [ ] `bin` 字段指向 `./dist/index.js`
- [ ] `engines.node` 设为 `>=22`

### 最终验证
- [ ] `npx tsx src/index.ts --help` 输出正确（显示所有命令）
- [ ] `npx tsx src/index.ts init` 正常运行
- [ ] `npx tsx src/index.ts extract --dry-run` 可以检测到 Cursor
- [ ] `npx tsx src/index.ts search "test"` 搜索正常
- [ ] `npx tsx src/index.ts rules` 生成 .mdc 文件

## 发布步骤

```bash
# 1. 构建
npm run build

# 2. 登录 npm（如果未登录）
npm login

# 3. 发布
npm publish --access public

# 4. 打 git tag
git tag v1.4.0
git push origin v1.4.0
```

## 发布后

- [ ] 推送 GitHub 仓库
- [ ] 写掘金中文文章
- [ ] 写 Dev.to 英文文章
- [ ] 发 Reddit r/webdev / r/programming
