# 部署到自己的域名（Cloudflare Pages，手把手）

> 目标：`https://你的域名` 打开就是这间小屋，两个人用同一个暗号进入，谁改了另一台设备刷新就能看到。
> 全程免费（除了域名），不用备案，不需要服务器。大概 20 分钟，主要时间花在等 DNS 生效。

---

## 0. 先买域名

| 选项 | 说明 |
|---|---|
| 在哪买 | 阿里云 / 腾讯云（实名方便、可支付宝）；或 Porkbun / NameSilo（美元、无实名要求） |
| 后缀 | **.com 最稳**（首年 ¥60–90，续费 ¥80–100）；.cn 更便宜但实名更严；.love/.top 便宜但不如 .com 通用 |
| 名字 | 两个人拼音缩写 + 年份，例如 `ax2023.com`、`wodexiaowu.com`。全小写、别用连字符、别太长 |

买完**先别做任何解析**，下一步整体交给 Cloudflare。

### 用 .cn 后缀可以吗？

可以，技术上和 .com 没区别（Cloudflare 能托管，证书自动签发）。但有两点要知道：

1. **必须实名认证**：.cn 由 CNNIC 直管，买完要立刻在注册商后台上传身份证，审核 1–2 天。一般 5 天内不实名会被 `serverHold`（暂停解析），实名通过后才能改 NS。
2. **备案跟服务器走，不跟后缀走**：站点放在 Cloudflare（境外），.cn 也不需要 ICP 备案。反过来，以后若想换成阿里云 OSS/腾讯云 COS 这类境内托管，.cn 和 .com 一样都要备案。

价格：.cn 首年约 ¥25–35、续费 ¥35–50；.com 首年 ¥60–90、续费 ¥80–100。
另外 Cloudflare Registrar 不支持 .cn 转入，所以域名继续留在国内注册商续费即可（用 NS 托管不影响）。

> 换域名不影响数据：KV 里存的是内容，域名只是入口；以后想从 .cn 换成 .com，在 Pages 的 Custom domains 里加新域名即可。


---

## 1. 注册 Cloudflare，把域名托管过来（免费）

1. 打开 <https://dash.cloudflare.com/sign-up>，用邮箱注册（不用信用卡，不用实名）。
2. 控制台 → **Add a site** → 输入你的域名 → 选 **Free** → Continue。
3. 它自动扫一遍现有 DNS 记录，直接 **Continue**。
4. 页面会给你两个 **nameserver**，形如：
   ```
   ada.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```
5. 回到你的域名注册商后台 → 找「DNS 服务器 / 修改 DNS / DNS Servers」→ 把原来的换成这两个 → 保存。
6. 回 Cloudflare 点 **Done**，等状态从 *Pending* 变成 **Active**（几分钟到 24 小时）。

> 改 NS 不会影响域名所有权，续费仍然在原注册商。这一步只是让 Cloudflare 接管解析。

---

## 2. 把网站文件放到 GitHub

Cloudflare Pages 要从一个仓库构建。用 GitHub 网页上传最省事（不用装 Git）。

1. 登录 GitHub → 右上 **+** → **New repository**
   - Repository name: `our-room`（随意）
   - 选 **Private**（私有，别人看不到源码）
   - Create repository
2. 页面里点 **uploading an existing file**
3. 打开本机的 `our-room` 文件夹，把里面的**全部内容**拖进浏览器：
   ```
   index.html   assets/   functions/   _headers   robots.txt   README.md   preview.png
   ```
   ⚠️ 拖的是**里面的东西**，不是 `our-room` 文件夹本身——仓库根目录必须能直接看到 `index.html`。
4. 底部 **Commit changes**。

---

## 3. 在 Cloudflare 建 Pages 项目

1. 控制台左侧 **Workers & Pages** → **Create** → 选 **Pages** → **Connect to Git**
2. 授权 GitHub，选 `our-room` 仓库 → **Begin setup**
3. 按下面填：

   | 项 | 值 |
   |---|---|
   | Project name | `our-room` |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | **留空** |
   | Build output directory | `/`（一个斜杠；留空也行） |

4. **Save and Deploy**，等 1 分钟左右。
5. 你会拿到一个 `our-room-xxx.pages.dev` 地址，先打开一次：此时大概率提示「服务端未配置」——正常，接着配 KV。

---

## 4. 建 KV（存数据的地方）

1. 控制台 → **Workers & Pages** → 左侧 **KV** → **Create a namespace**
2. 名字填 `room-kv` → **Add**
3. 回到 **Pages → our-room → Settings → Functions → KV namespace bindings → Add binding**：

   | 字段 | 值 |
   |---|---|
   | Variable name | `ROOM_KV`（一字不差） |
   | KV namespace | `room-kv` |
   | 环境 | Production（Preview 也加上更好） |

4. 保存。

---

## 5. 设置暗号

1. 同一页 **Settings → Environment variables → Add variable**：

   | 字段 | 值 |
   |---|---|
   | Variable name | `SITE_PASS` |
   | Value | 你们的暗号（8 位以上，别用生日） |
   | 环境 | Production + Preview |

2. 保存。

> 这个暗号就是进门密码。两个人共用同一个；想换随时在后台改，改完记得下一步重新部署。

---

## 6. 重新部署，让配置生效

**Deployments** → 最新那条 → 右侧 **⋯** → **Retry deployment**。

环境变量和 KV 绑定只对**新部署**生效，所以这一步不能省。

再打开 `xxx.pages.dev`：应该出现「请输入暗号」的卡片。输入刚才的 SITE_PASS，能进就说明后端通了。

---

## 7. 绑上你自己的域名

1. Pages 项目 → **Custom domains** → **Set up a domain**
2. 填 `你的域名`（根域）→ Continue
3. 再点一次，填 `www.你的域名`（可选）
4. 因为域名已经托管在 Cloudflare，DNS 记录会自动加好，证书几分钟内签发
5. 打开 `https://你的域名` → 完成 🎉

---

## 8. 验收清单（逐条打勾）

- [ ] 打开域名出现「请输入暗号」
- [ ] 输错口令有红色提示，输对能进
- [ ] 手机上（Safari / 微信内置浏览器）也能打开并进入
- [ ] 手机上加一条回忆，电脑刷新后能看到 → **说明云端真的通了**
- [ ] 关掉页面再开，不用重新输口令（口令记在这台设备的浏览器里）
- [ ] 页脚显示「已同步云端 · 时:分」
- [ ] 手机浏览器「添加到主屏幕」，打开像 App 一样（可选）

---

## 9. 日常怎么更新

**内容**（照片、文字、日期）→ 在网站里点「编辑」直接改，**不用重新部署**，数据存在 KV 里。

**代码/样式**（想改外观）→ 在 GitHub 里改 `assets/css/style.css` 等文件，Commit 后 Cloudflare 会自动重新部署（约 1 分钟）。

---

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 打开就提示「服务端未配置（还没绑定 KV）」 | 第 4 步没做完，或变量名不叫 `ROOM_KV`；改完要 **Retry deployment** |
| 口令一直提示不对 | `SITE_PASS` 有空格、或改完没重新部署 |
| 手机上改了，另一台看不到 | 看页脚：显示「云端未同步」说明网络/权限问题；点开 Cloudflare 的 **Functions 日志**看报错 |
| 保存提示「内容太大」 | KV 单值上限 25MB。删几张照片，或把照片压到 1200px 再传 |
| 想换域名 | Custom domains 里加新域名、删旧的即可（KV 数据不受影响） |
| 想彻底停用 | 删掉 Pages 项目；KV 里的数据也随之失效 |
| 不想公开被搜到 | 已内置：`_headers` 里有 `X-Robots-Tag: noindex`，`robots.txt` 也是 Disallow；再有口令门，别人拿不到内容 |

---

## 附：不想用 GitHub？命令行 3 条命令也能部署

本机装好 Node 之后：

```powershell
npm i -g wrangler
wrangler login                      # 浏览器里登录一次
wrangler pages project create our-room
wrangler kv namespace create ROOM_KV # 把输出的 id 填进 wrangler.toml
wrangler pages secret put SITE_PASS --project-name our-room
wrangler pages deploy . --project-name our-room
```

`wrangler.toml` 已经放在项目里，把 KV 的 `id` 填进去即可。
（这种情况下，域名仍在 Cloudflare 后台 → Pages → Custom domains 里绑。）
