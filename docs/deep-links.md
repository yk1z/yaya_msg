# 牙牙消息深链

使用 `yayamsg://` 唤起桌面版。路径沿用网页命名，不加 `page` 前缀。
首次启动新版后注册系统协议；已经运行时在现有窗口跳转。
需要登录的页面会先进入登录页，登录后继续打开目标。

| 功能 | 链接 |
| --- | --- |
| 首页 | `yayamsg://home` |
| 直播、回放、海外直播、海外回放 | `yayamsg://live`、`yayamsg://vod`、`yayamsg://meet-live`、`yayamsg://meet-vod` |
| 具体直播或回放 | `yayamsg://live/直播ID`、`yayamsg://vod/回放ID`、`yayamsg://meet-live/直播ID`、`yayamsg://meet-vod/回放ID` |
| 口袋房间 | `yayamsg://room`、`yayamsg://room/频道ID` |
| 个人主页弹窗 | `yayamsg://user/用户ID` |
| 私信 | `yayamsg://message`、`yayamsg://message/用户ID` |
| 房间相册 | `yayamsg://img`、`yayamsg://img/频道ID` |
| 公演 | `yayamsg://stage`、`yayamsg://stage/公演ID` |
| 成员动态、微博、资料、行程、发送翻牌、写真 | `yayamsg://post`、`yayamsg://weibo`、`yayamsg://profile`、`yayamsg://trip`、`yayamsg://send`、`yayamsg://nft`，均可再接 `/成员ID` |
| 社区与话题 | `yayamsg://community`、`yayamsg://community/话题ID` |
| 官方音乐 | `yayamsg://music`、`yayamsg://music/GNZ/专辑名`、`yayamsg://music/favorite/GNZ/专辑名` |
| 音频节目、视频库、音乐库 | `yayamsg://audio`、`yayamsg://video`、`yayamsg://music-library` |
| 房间电台 | `yayamsg://voice`、`yayamsg://voice/频道ID` |
| 翻牌记录、B站直播、PBC、面对面 | `yayamsg://flip`、`yayamsg://bilibili-live`、`yayamsg://pbc`、`yayamsg://netface` |
| 消息检索、消息抓取、数据库 | `yayamsg://messages`、`yayamsg://fetch`、`yayamsg://database` |
| 发票、乱斗榜、下载、设置 | `yayamsg://invoice`、`yayamsg://melee`、`yayamsg://downloads`、`yayamsg://settings` |
| 登录、账号设置 | `yayamsg://login`、`yayamsg://account` |

所有功能页也接受内部页面标识，如 `yayamsg://followed-rooms`、`yayamsg://private-messages`。
成员、用户、频道 ID 使用原始数字字符串。直播/回放 ID 也支持字母、数字、连字符和下划线，保持原值，不转换为数字。专辑名中的空格、中文等按 URL 编码。
房间不在成员目录中时，会按频道 ID 查询官方房间资料，能获取且有权访问时继续打开。
电台详情链接会选择对应的大/小房间频道并检查状态，正在上麦时自动收听，未上麦时显示“未开启”。仅打开 `yayamsg://voice` 列表不会自动收听。深链不会开启录制。
链接仅用于打开页面，不接受本地文件、脚本、命令或付款、发送消息等操作。
Windows ZIP 版本移动文件夹后重新启动一次，即可更新协议指向的位置。
