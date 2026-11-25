# Debian 13 单机部署
保留原 root 会话。通过云控制台核对主机指纹，轮换此前泄露的 root 密码。创建 `burnhero-deploy` 并写入操作员公钥后，root 运行 `openssl rand -hex 32 >/run/burnhero-ssh-challenge && chmod 644 /run/burnhero-ssh-challenge`。从另一终端使用该账号及密钥登录，运行 `cp /run/burnhero-ssh-challenge ~/.burnhero-login-proof`。然后在原 root 会话运行 `bash ops/harden.sh`。验证新会话的 `sudo -v`、`fail2ban-client status sshd`、`sshd -T` 和 `ufw status` 后退出 root。核对既有 UFW 规则和云安全组，仅放行业务端口及 SSH。

将经过验收的 ops、server 和 web 放在 `/opt/burnhero`。首次启动在 `/opt/burnhero/ops` 下执行：
```sh
umask 077
(test ! -e .env && set -C && { echo "DB_PASSWORD=$(openssl rand -hex 32)"; echo "JWT_SECRET=$(openssl rand -hex 48)"; } >.env)
sudo docker compose -f compose.yml up -d --build
sudo install -m 644 nginx.conf /etc/nginx/sites-enabled/burnhero.conf
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1:8080/health
sudo install -m 644 burnhero-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now burnhero-backup.timer
sudo systemctl start burnhero-backup.service
```
HTTP 演示使用虚构账号和样例健康数据。真实数据可通过 `ssh -L 8080:127.0.0.1:8080 burnhero-deploy@主机` 访问本机 8080。切换 HTTPS 时，把 nginx 的 listen 改为 `443 ssl`，配置域名、证书与私钥，更新防火墙和客户端服务地址。数据库没有宿主机端口。

恢复演练应使用隔离数据库与空图片目录，核对校验和后用 `pg_restore --exit-on-error` 恢复，解包 images.tar，逐条核对 media 行对应的图片并请求健康接口。主机备份目录只限 root 读取，账号删除后历史副本随七天轮换清理。生产恢复前重新执行在备份之后收到的删除请求。

执行恢复演练用 `sudo bash restore-drill.sh /var/backups/burnhero/备份目录名`。若客户端在其他源运行，可在部署 .env 中把 APP_ORIGINS 设为逗号分隔的明确来源。

模型转发的建连期限为 10 秒（包含 DNS、TCP 和 TLS），请求总期限为 150 秒。Nginx 的 `/api/llm` 等待期限为 165 秒，前端为 175 秒。发布时应同时更新应用和 Nginx 配置，并先运行 `nginx -t`。连接超时与响应超时不会自动再请求模型，用户可保留输入后手动重试。

部署前应从生产主机检查所用 API 域名的 HTTPS 连通性。无法建立连接时，需要服务商提供可达的官方入口或另行配置经确认的出网网络；调整等待期限无法修复出口连通性。
