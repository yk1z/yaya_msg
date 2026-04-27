        let memberData = [];
        let isMemberDataLoaded = false;
        let currentSelectedMemberName = '';
        let currentLiveListRaw = [];

        function showShield(status = '正在处理', detail = '') {
            const shield = document.getElementById('loading-shield');
            const statusEl = document.getElementById('shield-status');
            const detailEl = document.getElementById('shield-detail');

            if (shield) {
                window.__shieldVisible = true;
                shield.style.display = 'flex';
                shield.style.opacity = '1';
            }
            if (statusEl) statusEl.textContent = status;
            if (detailEl) detailEl.textContent = detail;
        }

        function hideShield() {
            const shield = document.getElementById('loading-shield');
            if (shield) {
                shield.style.opacity = '0';
                setTimeout(() => {
                    shield.style.display = 'none';
                    window.__shieldVisible = false;
                    window.dispatchEvent(new Event('app-shield-hidden'));
                }, 300);
            }
        }

        window.__shieldVisible = false;
        window.__appStartupComplete = false;
        window.__appStartupFailed = false;

        function reportFatalInitError(error, fallbackDetail = '请重启软件后重试') {
            if (window.__appStartupComplete || window.__appStartupFailed) return;

            window.__appStartupFailed = true;

            const detail = typeof error === 'string'
                ? error
                : (error && error.message) || fallbackDetail;

            console.error('启动阶段发生异常:', error);
            showShield('初始化失败', detail);
        }

        window.addEventListener('error', (event) => {
            reportFatalInitError(event.error || event.message, '页面脚本加载失败');
        });

        window.addEventListener('unhandledrejection', (event) => {
            reportFatalInitError(event.reason, '初始化任务执行失败');
        });

        async function loadMemberData() {
            if (isMemberDataLoaded) return;
            const statusSpan = document.getElementById('sdk-status');
            if (statusSpan) statusSpan.innerText = '正在更新成员列表...';
            try {
                const url = `https://yaya-data.pages.dev/members.json?t=${Date.now()}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data && data.roomId) {
                    memberData = data.roomId;
                    isMemberDataLoaded = true;
                    if (statusSpan) statusSpan.innerText = `✅ 成员列表已更新 (${memberData.length}人)`;
                }
            } catch (e) {
                if (statusSpan) statusSpan.innerText = '⚠️ 成员列表加载失败';
            }
        }

        const TEAM_COLORS = {
            'SII': '#A1D5ED', 'TEAM SII': '#A1D5ED',
            'NII': '#BE98C7', 'TEAM NII': '#BE98C7',
            'HII': '#F8941D', 'TEAM HII': '#F8941D',
            'X': '#B1D61B', 'TEAM X': '#B1D61B',
            'B': '#FF4083', 'TEAM B': '#FF4083',
            'E': '#0CC8C3', 'TEAM E': '#0CC8C3',
            'G': '#9FBF40', 'TEAM G': '#9FBF40',
            'NIII': '#FFE249', 'TEAM NIII': '#FFE249',
            'Z': '#EA617B', 'TEAM Z': '#EA617B',
            'C': '#FEB90D', 'TEAM C': '#FEB90D',
            'K': '#FF5043', 'TEAM K': '#FF5043',
            'CII': '#D21217', 'TEAM CII': '#D21217',
            'GII': '#0061C0', 'TEAM GII': '#0061C0',
            'IDFT': '#900058'
        };

        var POCKET_GIFT_DATA = [
            { name: "荧光棒-SII", cost: 5, id: "266592587658117120" },
            { name: "荧光棒-NII", cost: 5, id: "266592588102713344" },
            { name: "荧光棒-HII", cost: 5, id: "266592588543115264" },
            { name: "荧光棒-X", cost: 5, id: "266592588983517184" },
            { name: "荧光棒-G", cost: 5, id: "266592608512196608" },
            { name: "荧光棒-NIII", cost: 5, id: "266592608860323840" },
            { name: "荧光棒-Z", cost: 5, id: "266592610735177728" },
            { name: "荧光棒-B", cost: 5, id: "266592593270095872" },
            { name: "荧光棒-E", cost: 5, id: "266592593718886400" },
            { name: "荧光棒-C", cost: 5, id: "266592630343548928" },
            { name: "荧光棒-K", cost: 5, id: "266592630712647680" },
            { name: "荧光棒-CII", cost: 5, id: "875790439471190016" },
            { name: "荧光棒-GII", cost: 5, id: "875790628684632064" },

            { name: "巧克力", cost: 10, id: "266592613964791808" },
            { name: "玫瑰花", cost: 20, id: "266592591995027456" },
            { name: "冰美式", cost: 48, id: "670237101300404224" },
            { name: "秋天的奶茶", cost: 48, id: "517760052235145216", description: "普通礼物" },
            { name: "生日礼物", cost: 48, id: "266592634915340288", description: "成员直播礼物" },
            { name: "生日帽", cost: 48, id: "266592633254395904", description: "成员直播礼物" },

            { name: "高级马卡龙", cost: 1048, id: "691322274260520960" },
            { name: "夜蝶", cost: 1500, id: "566341364751339520", description: "qrlw" },
            { name: "生日蛋糕", cost: 2880, id: "266592635540291584", description: "成员直播礼物" },
            { name: "权杖", cost: 3000, id: "266592611095887872", description: "新权杖" },
            { name: "皇冠", cost: 5000, id: "266592614883344384", description: "新皇冠" },
            { name: "大饼", cost: 9999, id: "325232177465593856", description: "成员直播礼物" },
            { name: "用爱发电", cost: 19999, id: "325233801525268480", description: "成员直播礼物" },

            { name: "心锁", cost: 480, id: "1161700584686686208", description: "技能礼物" },

            { name: "爱心礼盒", cost: 1200, id: "1223675156709052416", description: "2026情人节" },
            { name: "恋人牌", cost: 1200, id: "1223674950697422848", description: "2026情人节" },
            { name: "弦音予你", cost: 48, id: "1223674709768212480", description: "2026情人节" },
            { name: "花束寄情", cost: 48, id: "1223674321786703872", description: "2026情人节" },
            { name: "香入心扉", cost: 48, id: "1223674130916511744", description: "2026情人节" },
            { name: "狂飙爱意", cost: 48, id: "1223673853681405952", description: "2026情人节" },

            { name: "穹宇猫萌一", cost: 5050, id: "1159142638064832512", description: "张琼予定制" },
            { name: "招财进宝", cost: 688, id: "1223654183268061184", description: "柏欣妤定制" },
            { name: "豆鸡腿饱饱", cost: 5255, id: "1124398455441920000", description: "徐楚雯定制" },
            { name: "鸟皇登基", cost: 11800, id: "1123956702633070592", description: "唐莉佳定制" },
            { name: "宝宝是我", cost: 4545, id: "1123955157879296000", description: "方琪定制" },
            { name: "第九次", cost: 9422, id: "1121167706391646208", description: "朱怡欣定制" },
            { name: "圭矩", cost: 8888, id: "1120075775402119168", description: "韩家乐定制" },
            { name: "怪可爱的", cost: 3689, id: "1117101004603330560", description: "刘力菲定制" },
            { name: "沝啧", cost: 3726, id: "1104487300200206336", description: "杨冰怡定制" },
            { name: "好想润", cost: 11150, id: "1104484678495965184", description: "张润定制" },
            { name: "啵啵", cost: 5200, id: "1102284508739997696", description: "段艺璇定制" },
            { name: "晴空霹雳掌", cost: 5280, id: "1101194508199858176", description: "林舒晴定制" },

        ];

        function updateLocalGiftDatabase() {
            try {
                const cacheApi = window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
                const cachedData = cacheApi && typeof cacheApi.getCacheValueSync === 'function'
                    ? cacheApi.getCacheValueSync('POCKET_GIFT_DATA_CACHE', null)
                    : localStorage.getItem('POCKET_GIFT_DATA_CACHE');
                if (cachedData) {
                    const parsed = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        parsed.forEach(g => {
                            const id = String(g.id || g.giftId || '').trim();
                            const name = String(g.name || g.giftName || '').trim();
                            const cost = Number(g.cost || g.money || 0);
                            if ((!id && !name) || !cost) return;

                            const existing = POCKET_GIFT_DATA.find(item => (id && String(item.id) === id) || (name && item.name === name));
                            if (existing) {
                                existing.id = id || existing.id;
                                existing.name = name || existing.name;
                                existing.cost = cost;
                            } else {
                                POCKET_GIFT_DATA.push({ id, name: name || id, cost });
                            }
                        });
                    }
                    if (cacheApi && typeof cacheApi.removeCacheValueSync === 'function') {
                        localStorage.removeItem('POCKET_GIFT_DATA_CACHE');
                    }
                }
            } catch (e) {
                console.warn('读取礼物缓存失败:', e);
            }
        }

        window.addEventListener('DOMContentLoaded', updateLocalGiftDatabase);

        function hexToRgb(hex) {
            if (!hex) return '0, 0, 0';
            let c = hex.substring(1).split('');
            if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            c = '0x' + c.join('');
            return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(', ');
        }

        (function injectTeamCss() {
            const oldStyle = document.getElementById('team-dynamic-css');
            if (oldStyle) oldStyle.remove();

            const style = document.createElement('style');
            style.id = 'team-dynamic-css';
            style.innerHTML = `

        .team-tag[style*="--team-rgb"] {
            background-color: rgba(var(--team-rgb), 0.15) !important;
            color: rgb(var(--team-rgb)) !important;
            border: 1px solid rgba(var(--team-rgb), 0.5) !important;
            text-shadow: none !important;
            font-weight: 700 !important; 
        }


        html[data-theme="light"] .team-tag[style*="--team-rgb"] {
             filter: brightness(0.9);
        }


        html[data-theme="dark"] .team-tag[style*="--team-rgb"] {
            background-color: rgba(var(--team-rgb), 0.2) !important;
            box-shadow: 0 0 8px rgba(var(--team-rgb), 0.2);
        }
    `;
            document.head.appendChild(style);
        })();

        function getTeamStyle(teamName, isInactive) {
            if (!teamName || isInactive) return '';

            const upperName = teamName.toUpperCase();
            const color = TEAM_COLORS[upperName] || TEAM_COLORS[upperName.replace('TEAM ', '')];

            if (color) {
                const rgb = hexToRgb(color);
                return `--team-rgb: ${rgb};`;
            }
            return '';
        }
