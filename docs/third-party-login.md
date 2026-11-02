# 桌面端第三方登录

当前状态：桌面端和网页端均隐藏第三方登录入口，只显示现有验证码／Token 登录。百度和 QQ 的真实账号授权未通过完整验证，不能把授权页能够打开视为可用登录。

保留的“第三方登录”选项卡实现包含百度贴吧、丝瓜、微信、QQ、微博五个入口，供后续排查。

- 百度贴吧、QQ、微博：在独立的官方网页授权窗口中完成登录，获取第三方身份后换取口袋 Token。
- 丝瓜：使用官方 `/user/api/v1/login/app/sg`，填写丝瓜账号和密码。
- 微信：显示“暂不可用”。官方 Android App 调用微信客户端的 SendAuth；跨设备二维码授权则需要服务端的 SDK ticket 签名。目前没有可用的官方签名来源，因此不会生成无法完成登录的二维码，也不会把网页版登录 Cookie 当作口袋 Token。

第三方方式沿用当前选择的“口袋48／塞纳河48”请求身份及本机设备标识。账号资料查询及消息功能仍使用现有 Token 检查和账号初始化流程。第三方账户若需官方进一步注册或绑定，将提示先在官方 App 完成。

授权流程设计为仅用于桌面端，不经 Yaya API 代理；目前由 `pocket-social-login-feature.js` 的 `enabled = false` 统一停用，现有验证码／Token 登录不受影响。

## 实现与取消

官方参数来自本地反编译的 Pocket48 7.1.45：`LoginRequest`、`tf0`、`BaiduLoginActivity`、`SiguaLoginViewModel`、`QQLoginActivity`、`SinaLoginActivity` 及 `KCommonLoginViewModel`。

百度、QQ、微博使用官方公开 App ID 的 implicit authorization；QQ 保留官方回调 `auth://tauth.qq.com/`，微博使用官方登记的默认回调。实际登录是否受平台风控或授权策略限制仍需账号实测。

QQ 使用 `https://graph.qq.com/oauth2.0/authorize` 的 `display=mobile` 网页入口。服务器跳到 `xui.ptlogin2.qq.com/cgi-bin/xlogin` 后，只在当前 state、口袋 App ID 和回调均匹配时，恢复其密码输入区。保留原 `style=35` 授权引擎、服务器签名与 `pt_openlogin_data`，不改成普通 `style=40` 桌面登录。普通桌面登录会丢失第三方授权数据，成功后落到 QQ 互联首页；现在检测到这种异常返回会明确报错。

旧 QR 模式生成的二维码包含 PT 内部应用标识 `716027609`，手机实测报“请求的应用不存在”，不能将轮询等待扫码当作第三方授权有效。因此目前停用该 QR 模式与一键拉起手机 QQ，只显示密码授权。已在真实 Electron 窗口验证密码区和原口袋授权数据均存在；没有提交真实账号密码。模拟回调覆盖身份查询、最终口袋 Token、去重及取消，真实账户完整密码授权仍待用户实测。

每次授权使用独立的内存会话和随机 state，核对回调地址以及 QQ／微博应用标识。授权窗口无 Node、无 preload，启用隔离和 sandbox。第三方密码、access token 和 Cookie 不写入应用设置；只保存最终口袋 Token。

取消、关闭授权窗口、切换身份、切换登录方式、离开账号页、切换账号或退出软件都会结束当前授权。重复回调只提交一次，迟到的结果不会覆盖当前登录。授权最长五分钟；资料查询和换取 Token 的请求有独立超时，不自动重复提交登录。

百度资料中的数字用户 ID 按原始十进制文本保留，避免超出 JavaScript 安全整数范围后改变账号标识。登录响应按官方 LoginResponse 区分结果：`type=1` 是后续绑定流程，其临时票据不会保存成已登录账号；仅返回 `OK`、缺少 Token 或明确失败时，显示 HTTP／业务状态和结果类型。失败诊断只包含状态、类型与字段是否存在，不返回第三方令牌、用户 ID 或绑定票据。真实账号失败的具体返回仍需重试后确认，不能仅凭 `OK` 判断未绑定。

测试：`node --test test/pocket-social-login.test.cjs`。另用隔离的 Electron 会话验证实际导航拦截、弹窗、取消、重复提交和迟到结果；未发送短信、注册账户或替用户授权第三方账户。
