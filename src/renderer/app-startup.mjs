export function startApp({
    isWebRuntime, appNavigation, messageArchive, mediaCatalog, migrateLegacyPersistentState, BILIBILI_LIVE_CONFIG_CACHE_KEY,
    initTheme, checkGitHubNotice, loadMemberIdMap, syncAutoCheckinUi, getStoredAppToken, setAppToken, checkToken,
    reportFatalInitError
}) {
    if (window.desktop?.isRoomWindow) return;

    const initializeApplicationRuntime = async function () {
        try {
            messageArchive.setMessageIndexLoadingState(true, '正在初始化', '正在准备运行环境');

            window.addEventListener('keydown', function (e) {
                if (e.key === 'F11') {
                    e.preventDefault();
                }
            });

            appNavigation.mountSidebarPanelsToViews();
            migrateLegacyPersistentState(BILIBILI_LIVE_CONFIG_CACHE_KEY);
            initTheme();

            Promise.resolve(checkGitHubNotice()).catch((error) => {
                console.warn('公告检查失败:', error);
            });

            Promise.resolve(loadMemberIdMap()).catch((error) => {
                console.warn('成员列表预加载失败:', error);
            });

            await messageArchive.loadWebMessageData();

            mediaCatalog.renderVodGroupOptions();
            syncAutoCheckinUi();
            const savedToken = getStoredAppToken();
            if (savedToken) {
                setAppToken(savedToken);
                console.log("启动自动登录...");
                setTimeout(() => {
                    Promise.resolve(checkToken()).catch((error) => {
                        console.warn('自动登录检查失败:', error);
                    });
                }, 500);
            }
            appNavigation.initBackToTopListener();
            messageArchive.setupSearchControls();
            window.__appStartupComplete = true;
            window.dispatchEvent(new CustomEvent('yaya:app-startup-complete'));
        } catch (error) {
            if (typeof reportFatalInitError === 'function') {
                reportFatalInitError(error, '启动流程执行失败');
                return;
            }

            throw error;
        }
    };

    if (isWebRuntime) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeApplicationRuntime, { once: true });
        } else {
            initializeApplicationRuntime();
        }
    } else if (document.documentElement.dataset.desktopShell === 'true') {
        window.addEventListener('yaya:desktop-workspace-ready', () => {
            setTimeout(initializeApplicationRuntime, 0);
        }, { once: true });
    } else {
        window.addEventListener('load', initializeApplicationRuntime, { once: true });
    }
}
