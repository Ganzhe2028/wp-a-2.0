# 旧 Person 显式映射迁移说明

本工具只在管理员已经人工确认旧 `Person.id` 与正式 `User.accountCode` 的一一对应关系后建立可审计链接。它不会按姓名、旧 username、邮箱或相似度自动匹配，也不会把 `Person.code` 写成 OIDC subject。

## 映射文件

```csv
legacyPersonId,accountCode
cm旧Person主键,OWK-正式账号编号
```

两个字段在文件内都必须唯一；目标正式账号必须属于同一个 Event。已有冲突链接、缺失 Person 或缺失 User 都会让整批停止。

## 执行

先执行只读预览：

```bash
DOTENV_CONFIG_PATH=.env.local npm run migrate:legacy -- --mapping=/绝对路径/person-user-map.csv
```

确认预览数量后显式写入：

```bash
DOTENV_CONFIG_PATH=.env.local npm run migrate:legacy -- --mapping=/绝对路径/person-user-map.csv --apply
```

如需撤销同一批链接：

```bash
DOTENV_CONFIG_PATH=.env.local npm run migrate:legacy -- --mapping=/绝对路径/person-user-map.csv --rollback
```

工具在 Serializable 事务中完成整批校验和写入，并写 `AdminAuditLog`。数据库只保存映射文件 SHA-256 摘要，不保存 CSV 内容。

## 内容迁移边界

`Person`、`Image` 和旧 Day 3 JSON 不会被删除或改写。当前正式 Day 1 slot 与 Day 3 bottle 的最终活动模板仍缺少外部确认，因此工具只建立身份映射并报告仍含旧内容的记录数；在精确转换规则到位之前，不能猜测旧图片对应哪个 slot，也不能猜测旧答案对应哪个 bottle。
