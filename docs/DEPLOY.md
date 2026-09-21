# 金庸群侠传 3 Web Remake 部署说明

本发布包是纯静态站点。服务器运行游戏时不需要 Node.js、npm、Lua 或数据库，只需要能够正确提供当前目录中的 HTML、JavaScript、Lua、图片、音频和其他静态文件。

## 1. 获取发布包

推荐从 GitHub Actions 的成功 CI 运行中下载名为：

```text
jy3-web-remake-v<版本号>
```

的 artifact。下载并解压后，目录根部应至少包含：

```text
index.html
runtime-config.js
service-worker.js
build-info.json
release-manifest.json
SHA256SUMS
VERSION
src/
lua/
vendor/
```

也可以在有完整 `vendor/` 缓存的源码目录执行：

```bash
npm run build:offline
npm run release:prepare
npm run release:verify
```

生成：

```text
release/jy3-web-remake-v<版本号>/
```

## 2. 完整性校验

Linux 可在发布目录执行：

```bash
sha256sum -c SHA256SUMS
```

macOS 可使用：

```bash
shasum -a 256 -c SHA256SUMS
```

`release-manifest.json` 同时记录运行时版本、协议版本、固定上游 revision、构建时间、Service Worker 缓存版本以及每个文件的 SHA-256。

## 3. 最简单的临时启动

在发布目录中执行：

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

然后访问：

```text
http://服务器IP:8080/
```

不要直接双击 `index.html` 使用 `file://` 打开，浏览器对模块加载、Fetch 和 Service Worker 有安全限制。

游戏本体可以通过普通 HTTP 运行，但 Service Worker 在浏览器中要求 HTTPS，只有 `localhost` / `127.0.0.1` 属于例外。正式远程部署建议配置 HTTPS。

## 4. Nginx 部署示例

假设发布包解压到：

```text
/var/www/jy3/
```

可使用：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    root /var/www/jy3;
    index index.html;

    location = /service-worker.js {
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /runtime-config.js {
        try_files $uri =404;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location = /index.html {
        try_files $uri =404;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location ~* \.(png|jpg|jpeg|gif|webp|mp3|wav|ogg|swf)$ {
        try_files $uri =404;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
```

正式公网环境建议在此基础上配置 HTTPS，并将 HTTP 重定向到 HTTPS。

## 5. 部署到子目录

发布包使用相对路径，可部署到类似：

```text
https://example.com/jy3/
```

的位置。需要保证服务器实际将整个发布目录映射到 `/jy3/`，并保留末尾斜杠。Service Worker 的作用域会限制在该部署目录，不会接管同域名下的其他站点路径。

## 6. 更新版本

建议每个版本使用独立目录，例如：

```text
/var/www/releases/jy3-web-remake-v0.1.0/
/var/www/releases/jy3-web-remake-v0.1.1/
```

再通过 Nginx root 或软链接切换当前版本。不要只覆盖部分文件，因为 JavaScript、Lua、运行时配置和 Service Worker 必须来自同一次构建。

更新后首次打开页面时，新的版本化 Service Worker 会建立新的缓存并清理旧的 `jy3-web-shell-*` 缓存。

## 7. 回滚

保留上一版发布目录。需要回滚时，将 Web 根目录重新指向上一版本的完整目录，然后刷新页面。由于 `service-worker.js` 和 `runtime-config.js` 建议禁用强缓存，浏览器会检测到上一版本的缓存标识并重新接管。

## 8. 排查

如果标题页提示启动失败，优先检查提示中给出的具体资源文件，然后确认：

- 发布目录是否完整上传；
- URL 是否区分大小写；
- Lua / SWF / MP3 等扩展名是否被服务器拒绝；
- 是否通过 HTTP/HTTPS 访问而不是 `file://`；
- `service-worker.js`、`runtime-config.js`、`index.html` 是否被 CDN 或反向代理长期强缓存。

可以打开浏览器开发者工具查看 Console / Network；项目自己的开发者诊断面板也会记录运行时异常和资源加载失败。
