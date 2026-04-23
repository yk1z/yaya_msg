(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createRoomAlbumFeature = function createRoomAlbumFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            applyRoomAlbumChannelValue,
            ipcRenderer,
            showToast,
            downloadMediaFileIconMode,
            getAlbumVideoObserver,
            getCurrentPlayingAudio,
            getCurrentPlayingVideo,
            setCurrentPlayingVideo,
            getOptimizedThumbUrl,
            openImageModal
        } = deps;

        let currentRoomAlbumNextTime = 0;
        let isFetchingRoomAlbum = false;
        let isRoomAlbumAutoLoading = false;
        let isBatchDownloadingRoom = false;

        function getRoomAlbumChannelId() {
            return String(document.getElementById('room-album-channel-id')?.value || '').trim();
        }

        function getRoomAlbumSearchResultBox() {
            return document.getElementById('room-album-search-results');
        }

        async function fetchAllRoomAlbum() {
            const buttonEl = document.getElementById('btn-room-album-all');
            const channelId = getRoomAlbumChannelId();
            const statusEl = document.getElementById('room-album-status');

            if (!channelId) {
                showToast('⚠️ 请先搜索并选择成员');
                return;
            }

            if (isRoomAlbumAutoLoading) {
                isRoomAlbumAutoLoading = false;
                if (buttonEl) {
                    buttonEl.innerText = '加载全部';
                    buttonEl.style.background = '';
                    buttonEl.style.color = '';
                }
                return;
            }

            isRoomAlbumAutoLoading = true;
            if (buttonEl) {
                buttonEl.innerText = '停止加载';
                buttonEl.style.background = '#ff4d4f';
                buttonEl.style.color = 'white';
            }

            if (currentRoomAlbumNextTime === 0) {
                await fetchRoomAlbum(false);
            }

            while (isRoomAlbumAutoLoading) {
                if (!currentRoomAlbumNextTime || currentRoomAlbumNextTime === 0 || currentRoomAlbumNextTime === '0') {
                    break;
                }

                const previousCursor = currentRoomAlbumNextTime;
                await fetchRoomAlbum(true);
                await new Promise(resolve => setTimeout(resolve, 50));

                if (currentRoomAlbumNextTime === previousCursor && currentRoomAlbumNextTime !== 0) {
                    console.warn('游标未更新，强制停止');
                    break;
                }
            }

            isRoomAlbumAutoLoading = false;
            if (buttonEl) {
                buttonEl.innerText = '加载全部';
                buttonEl.style.background = '';
                buttonEl.style.color = '';
            }

            if (statusEl && (!currentRoomAlbumNextTime || currentRoomAlbumNextTime === 0)) {
                const totalCount = document.querySelectorAll('#room-album-result-container .photo-nft-card').length;
                statusEl.innerHTML = `共获取 ${totalCount} 条 <span style="font-size:12px; color:#28a745">(已加载全部)</span>`;
            }
        }

        async function downloadAllRoomAlbum() {
            const buttonEl = document.getElementById('btn-room-album-dl-all');
            const allDownloadButtons = document.querySelectorAll('#room-album-result-container .album-single-dl-btn');
            const memberName = document.getElementById('room-album-member-input')?.value || '未知成员';

            if (!allDownloadButtons.length) {
                showToast('⚠️ 当前没有可下载的媒体，请先查询或加载内容');
                return;
            }

            if (isBatchDownloadingRoom) {
                isBatchDownloadingRoom = false;
                if (buttonEl) buttonEl.innerText = '正在中止...';
                return;
            }

            let currentMediaDir = localStorage.getItem('yaya_path_media');
            if (!currentMediaDir) {
                showToast('尚未设置相册下载路径，请选择一个保存文件夹');
                try {
                    const selectedPath = await ipcRenderer.invoke('dialog-open-directory');
                    if (selectedPath) {
                        localStorage.setItem('yaya_path_media', selectedPath);
                        const pathInput = document.getElementById('path-media');
                        if (pathInput) pathInput.value = selectedPath;
                        showToast('路径设置成功，开始一键下载');
                    } else {
                        showToast('已取消批量下载 (未选择文件夹)');
                        return;
                    }
                } catch (error) {
                    console.error('打开文件夹选择框失败:', error);
                    showToast('无法打开系统选择框，请先前往“设置”手动配置路径。');
                    return;
                }
            }

            const folderName = `【房间相册】${memberName}`;
            isBatchDownloadingRoom = true;
            const originalText = '一键下载';
            const originalBg = '';
            let successCount = 0;
            let failCount = 0;

            if (buttonEl) buttonEl.style.background = '#ff4d4f';

            for (let index = 0; index < allDownloadButtons.length; index++) {
                if (!isBatchDownloadingRoom) {
                    showToast('批量下载已中止');
                    break;
                }

                const singleButton = allDownloadButtons[index];
                const url = singleButton.getAttribute('data-url');
                const filename = singleButton.getAttribute('data-filename');

                if (buttonEl) buttonEl.innerText = `点击停止 (${index + 1}/${allDownloadButtons.length})`;

                const isSuccess = await downloadMediaFileIconMode(url, filename, singleButton, singleButton.innerHTML, 'media', folderName);
                if (isSuccess) successCount++;
                else failCount++;

                if (!isBatchDownloadingRoom) {
                    showToast('批量下载已中止');
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 400));
            }

            isBatchDownloadingRoom = false;

            if (buttonEl) {
                if (failCount === 0) {
                    buttonEl.innerText = `✅ 结束 (共${successCount}个)`;
                    buttonEl.style.background = '#52c41a';
                } else {
                    buttonEl.innerText = `⚠️ 结束 (成功${successCount}, 失败${failCount})`;
                    buttonEl.style.background = '#fa8c16';
                }

                setTimeout(() => {
                    if (!isBatchDownloadingRoom) {
                        buttonEl.innerText = originalText;
                        buttonEl.style.background = originalBg;
                    }
                }, 3000);
            }
        }

        function handleRoomAlbumSearch(keyword) {
            const resultBox = getRoomAlbumSearchResultBox();
            if (!resultBox) return;

            if (!keyword || !keyword.trim()) {
                resultBox.style.display = 'none';
                return;
            }

            if (!getMemberDataLoaded() && typeof loadMemberData === 'function') {
                loadMemberData();
            }

            const lowerKeyword = keyword.toLowerCase();
            const memberList = Array.isArray(getMemberData()) ? getMemberData() : [];
            const matches = memberList.filter(member => {
                const matchName = String(member.ownerName || '').includes(keyword);
                const pinyin = String(member.pinyin || '');
                const matchPinyin = pinyin.toLowerCase().includes(lowerKeyword);
                const initials = typeof getPinyinInitials === 'function' ? getPinyinInitials(pinyin) : '';
                return matchName || matchPinyin || String(initials).toLowerCase().includes(lowerKeyword);
            });

            matches.sort(memberSortLogic);

            if (!matches.length) {
                resultBox.style.display = 'none';
                return;
            }

            resultBox.innerHTML = matches.slice(0, 10).map(member => {
                const isInactive = member.isInGroup === false;
                const baseStyle = isInactive ? 'opacity:0.6; color:#999;' : '';
                const colorStyle = typeof getTeamStyle === 'function'
                    ? (getTeamStyle(member.team, isInactive) || '')
                    : '';

                return `<div class="suggestion-item"
                                 onclick="selectRoomAlbumMember('${member.ownerName}', '${member.channelId}', '${member.yklzId || ''}')"
                                 style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight:bold; ${baseStyle}">${member.ownerName}</span>
                                <span class="team-tag" style="${baseStyle} ${colorStyle}">${member.team}</span>
                            </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectRoomAlbumMember(name, channelId, smallChannelId = '') {
            const inputEl = document.getElementById('room-album-member-input');
            const channelInput = document.getElementById('room-album-channel-id');
            const resultBox = getRoomAlbumSearchResultBox();

            if (inputEl) inputEl.value = name || '';
            if (channelInput) {
                channelInput.dataset.bigChannelId = channelId || '';
                channelInput.dataset.smallChannelId = smallChannelId || '';
            }
            applyRoomAlbumChannelValue();
            if (resultBox) resultBox.style.display = 'none';
        }

        async function fetchRoomAlbum(isLoadMore) {
            const container = document.getElementById('room-album-result-container');
            const channelId = getRoomAlbumChannelId();
            const token = getAppToken ? getAppToken() : (localStorage.getItem('yaya_p48_token') || '');
            const statusEl = document.getElementById('room-album-status');

            if (!token) {
                showToast('⚠️ 请先在“账号设置”中登录');
                return;
            }

            if (!channelId || channelId === 'undefined') {
                showToast('⚠️ 请先搜索成员，或手动输入房间 Channel ID');
                return;
            }

            if (!container || isFetchingRoomAlbum) return;
            isFetchingRoomAlbum = true;

            if (!isLoadMore) {
                currentRoomAlbumNextTime = 0;
                container.innerHTML = '<div class="empty-state">正在抓取房间相册...</div>';
                container.className = '';
                if (statusEl) statusEl.innerText = '';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-room-album', {
                    token,
                    pa,
                    channelId,
                    nextTime: currentRoomAlbumNextTime
                });

                if (!result?.success || !result.content) {
                    if (!isLoadMore) {
                        container.innerHTML = `<div class="placeholder-tip"><h3>❌ 加载失败</h3><p>${result?.msg || '未知错误'}</p></div>`;
                    }
                    return;
                }

                console.log('房间相册 API 返回数据:', result.content);
                const list = normalizeRoomAlbumList(result.content);
                if (result.content.nextTime !== undefined) {
                    currentRoomAlbumNextTime = result.content.nextTime;
                }

                if (!isLoadMore) {
                    container.innerHTML = '';
                }

                if (!list || !list.length) {
                    if (!isLoadMore) {
                        container.innerHTML = '<div class="empty-state">该房间暂无照片/视频记录</div>';
                    }
                    if (statusEl && !isRoomAlbumAutoLoading) statusEl.innerText = '已到底部';
                    return;
                }

                if (!isLoadMore) {
                    container.className = 'photo-card-grid';
                }

                renderRoomAlbumItems(list, container);
                const totalCount = container.querySelectorAll('.photo-nft-card').length;

                if (!currentRoomAlbumNextTime || currentRoomAlbumNextTime === 0) {
                    if (statusEl && !isRoomAlbumAutoLoading) statusEl.innerText = `共获取 ${totalCount} 条 (已到底部)`;
                } else if (statusEl) {
                    statusEl.innerText = `已获取 ${totalCount} 条...`;
                }
            } catch (error) {
                if (!isLoadMore) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${error.message}</p></div>`;
                }
            } finally {
                isFetchingRoomAlbum = false;
            }
        }

        function normalizeRoomAlbumList(content) {
            if (Array.isArray(content)) {
                return content;
            }

            if (!content || typeof content !== 'object') {
                return [];
            }

            let list = content.messageList || content.message || content.data || [];
            if (list.length) {
                return list;
            }

            for (const key in content) {
                if (Array.isArray(content[key])) {
                    return content[key];
                }
            }

            return [];
        }

        function parseRoomAlbumBody(item) {
            try {
                if (typeof item.bodys === 'string') {
                    let cleanBodys = item.bodys.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    if (cleanBodys.startsWith('"') && cleanBodys.endsWith('"')) {
                        cleanBodys = cleanBodys.substring(1, cleanBodys.length - 1);
                    }
                    return JSON.parse(cleanBodys);
                }

                return item.bodys || {};
            } catch (error) {
                return null;
            }
        }

        function renderRoomAlbumItems(list, container) {
            const memberName = document.getElementById('room-album-member-input')?.value || '成员';

            list.forEach(item => {
                const bodyObj = parseRoomAlbumBody(item);
                if (!bodyObj) return;

                const isVideo = item.sourceType === 'VIDEO';
                const safeUrl = bodyObj.url || '';
                if (!safeUrl) return;

                const card = document.createElement('div');
                card.className = 'photo-nft-card';
                const ext = bodyObj.ext || (isVideo ? 'mp4' : 'jpg');
                const dlFilename = `【${memberName}】房间记录_${item.createTime || Date.now()}.${ext}`;
                const dateStr = formatRoomAlbumTime(item.createTime);
                const downloadIcon = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>保存
        `;

                const mediaContainer = document.createElement('div');
                mediaContainer.style.cssText = 'aspect-ratio: 1 / 1; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--input-bg); border-bottom: 1px solid var(--border); overflow: hidden; position: relative;';

                if (isVideo) {
                    renderRoomAlbumVideo(mediaContainer, safeUrl);
                } else {
                    renderRoomAlbumImage(mediaContainer, safeUrl);
                }

                const infoContainer = document.createElement('div');
                infoContainer.style.padding = '12px';
                const senderName = item.starName || memberName;
                infoContainer.innerHTML = `
            <div style="font-size: 13px; font-weight: bold; color: var(--text); margin-bottom: 2px;">
                ${senderName}
            </div>
            <div style="font-size: 11px; color: var(--text-sub); margin-bottom: 10px;">${dateStr}</div>
            
            <div>
                <button class="btn btn-secondary btn-full album-single-dl-btn" data-url="${safeUrl}" data-filename="${dlFilename}" style="height: 30px; font-size: 12px; border-radius: 6px;" onclick="downloadMediaFileIconMode('${safeUrl}', '${dlFilename}', this, this.innerHTML, 'media', '【房间相册】${memberName}')">
                    ${downloadIcon}
                </button>
            </div>
        `;

                card.appendChild(mediaContainer);
                card.appendChild(infoContainer);
                container.appendChild(card);
            });
        }

        function formatRoomAlbumTime(timestamp) {
            if (!timestamp) return '未知时间';
            const date = new Date(Number(timestamp));
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function renderRoomAlbumVideo(mediaContainer, safeUrl) {
            mediaContainer.innerHTML = `
                <video data-src="${safeUrl}#t=0.1" preload="none" 
                       style="width: 100%; height: 100%; object-fit: cover; background: #000; transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);"></video>
                
                <div class="album-video-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.15); cursor: pointer; transition: opacity 0.3s;">
                    <div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.5); color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px; backdrop-filter: blur(4px);">🎬 视频</div>
                    <div class="album-play-btn" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="white" style="margin-left: 4px;"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            `;

            const overlay = mediaContainer.querySelector('.album-video-overlay');
            const playBtn = mediaContainer.querySelector('.album-play-btn');
            const videoEl = mediaContainer.querySelector('video');
            const observer = getAlbumVideoObserver ? getAlbumVideoObserver() : null;
            if (observer) {
                observer.observe(videoEl);
            }

            overlay.onmouseenter = () => {
                playBtn.style.transform = 'scale(1.15)';
                playBtn.style.background = 'var(--primary)';
                playBtn.style.borderColor = 'var(--primary)';
                videoEl.style.transform = 'scale(1.05)';
            };
            overlay.onmouseleave = () => {
                playBtn.style.transform = 'scale(1)';
                playBtn.style.background = 'rgba(255,255,255,0.25)';
                playBtn.style.borderColor = 'rgba(255,255,255,0.6)';
                videoEl.style.transform = 'scale(1)';
            };
            overlay.onclick = event => {
                event.stopPropagation();
                if (!videoEl.src) videoEl.src = videoEl.dataset.src;

                overlay.style.opacity = '0';
                overlay.style.pointerEvents = 'none';
                videoEl.style.transform = 'scale(1)';
                videoEl.style.objectFit = 'contain';
                videoEl.controls = true;

                const currentVideo = getCurrentPlayingVideo ? getCurrentPlayingVideo() : null;
                const currentAudio = getCurrentPlayingAudio ? getCurrentPlayingAudio() : null;
                if (currentVideo && currentVideo !== videoEl) currentVideo.pause();
                if (currentAudio) currentAudio.pause();
                setCurrentPlayingVideo(videoEl);
                videoEl.play();
            };
        }

        function renderRoomAlbumImage(mediaContainer, safeUrl) {
            const thumbUrl = typeof getOptimizedThumbUrl === 'function' ? getOptimizedThumbUrl(safeUrl) : safeUrl;
            mediaContainer.innerHTML = `<img src="${thumbUrl}" loading="lazy" decoding="async" onclick="openImageModal('${safeUrl}')" style="width: 100%; height: 100%; object-fit: cover; object-position: center; cursor: zoom-in; transition: transform 0.3s;">`;
            const imgEl = mediaContainer.querySelector('img');
            imgEl.onmouseenter = () => { imgEl.style.transform = 'scale(1.05)'; };
            imgEl.onmouseleave = () => { imgEl.style.transform = 'scale(1)'; };
        }

        window.openImageModal = window.openImageModal || openImageModal;

        return {
            fetchAllRoomAlbum,
            downloadAllRoomAlbum,
            handleRoomAlbumSearch,
            selectRoomAlbumMember,
            fetchRoomAlbum
        };
    };
})();
