(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createMemberPhotosFeature = function createMemberPhotosFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            ipcRenderer,
            showToast,
            createCustomAudioPlayer,
            getAlbumVideoObserver,
            getCurrentPlayingAudio,
            getCurrentPlayingVideo,
            setCurrentPlayingVideo,
            getOptimizedThumbUrl,
            openImageModal
        } = deps;

        let currentPhotoPage = 1;
        let isFetchingPhotos = false;
        let isPhotosAutoLoading = false;

        function getPhotoSearchResultBox() {
            return document.getElementById('photo-search-results');
        }

        async function fetchAllMemberPhotos() {
            const buttonEl = document.getElementById('btn-photos-query');
            const memberId = String(document.getElementById('photo-member-id')?.value || '').trim();
            const statusEl = document.getElementById('photos-status');

            if (!memberId) {
                showToast('⚠️ 请先搜索并选择成员');
                return;
            }

            if (isPhotosAutoLoading) {
                isPhotosAutoLoading = false;
                if (buttonEl) {
                    buttonEl.innerText = '查询';
                    buttonEl.style.background = '';
                    buttonEl.style.color = '';
                }
                return;
            }

            isPhotosAutoLoading = true;
            if (buttonEl) {
                buttonEl.innerText = '停止查询';
                buttonEl.style.background = '#ff4d4f';
                buttonEl.style.color = 'white';
            }

            await fetchMemberPhotos(false);

            while (isPhotosAutoLoading) {
                const previousPage = currentPhotoPage;
                await fetchMemberPhotos(true);
                await new Promise(resolve => setTimeout(resolve, 50));

                const statusText = statusEl ? statusEl.innerText : '';
                if (statusText.includes('已到底部') || statusText.includes('已加载全部') || currentPhotoPage === previousPage) {
                    break;
                }
            }

            isPhotosAutoLoading = false;
            if (buttonEl) {
                buttonEl.innerText = '查询';
                buttonEl.style.background = '';
                buttonEl.style.color = '';
            }

            if (statusEl) {
                const totalCount = document.querySelectorAll('#photos-result-container .photo-nft-card').length;
                statusEl.innerHTML = `共获取 ${totalCount} 条 <span style="font-size:12px; color:#28a745">(已加载全部)</span>`;
            }
        }

        function handlePhotoSearch(keyword) {
            const resultBox = getPhotoSearchResultBox();
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
                                 onclick="selectPhotoMember('${member.ownerName}', '${member.id || member.userId || member.memberId}')"
                                 style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight:bold; ${baseStyle}">${member.ownerName}</span>
                                <span class="team-tag" style="${baseStyle} ${colorStyle}">${member.team}</span>
                            </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectPhotoMember(name, userId) {
            const inputEl = document.getElementById('photo-member-input');
            const idEl = document.getElementById('photo-member-id');
            const resultBox = getPhotoSearchResultBox();

            if (inputEl) inputEl.value = name || '';
            if (idEl) idEl.value = userId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        async function fetchMemberPhotos(isLoadMore) {
            const container = document.getElementById('photos-result-container');
            const memberId = String(document.getElementById('photo-member-id')?.value || '').trim();
            const token = getAppToken ? getAppToken() : (typeof window.getAppToken === 'function' ? window.getAppToken() : '');
            const statusEl = document.getElementById('photos-status');

            if (!token) {
                showToast('⚠️ 请先在“账号设置”中登录');
                return;
            }

            if (!memberId) {
                showToast('⚠️ 请先搜索并选择成员');
                return;
            }

            if (!container || isFetchingPhotos) return;
            isFetchingPhotos = true;

            if (!isLoadMore) {
                currentPhotoPage = 0;
                container.innerHTML = '<div class="empty-state">正在读取相册...</div>';
                container.className = '';
                if (statusEl) statusEl.innerText = '';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-member-photos', {
                    token,
                    pa,
                    memberId,
                    page: currentPhotoPage,
                    size: 20
                });

                if (!result?.success || !result.content) {
                    if (!isLoadMore) {
                        container.innerHTML = `<div class="placeholder-tip"><h3>❌ 加载失败</h3><p>${result?.msg || '未知错误'}</p></div>`;
                    }
                    return;
                }

                const list = normalizePhotoList(result.content);
                if (!isLoadMore) {
                    container.innerHTML = '';
                }

                if (!list || !list.length) {
                    if (!isLoadMore) {
                        container.innerHTML = '<div class="empty-state">该成员暂无相册内容</div>';
                    }
                    if (statusEl && !isPhotosAutoLoading) statusEl.innerText = '已到底部';
                    return;
                }

                if (!isLoadMore) {
                    container.className = 'photo-card-grid';
                }

                renderPhotoItems(list, container);
                currentPhotoPage++;

                const totalCount = container.querySelectorAll('.photo-nft-card').length;
                if (list.length < 20) {
                    if (statusEl && !isPhotosAutoLoading) statusEl.innerText = `共获取 ${totalCount} 条 (已到底部)`;
                } else if (statusEl) {
                    statusEl.innerText = `已获取 ${totalCount} 条...`;
                }
            } catch (error) {
                if (!isLoadMore) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${error.message}</p></div>`;
                }
            } finally {
                isFetchingPhotos = false;
            }
        }

        function normalizePhotoList(content) {
            if (Array.isArray(content)) {
                return content;
            }

            if (!content || typeof content !== 'object') {
                return [];
            }

            let list = content.nftList || content.list || content.data || content.records || content.message || [];
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

        function renderPhotoItems(list, container) {
            const memberName = document.getElementById('photo-member-input')?.value || '成员';

            list.forEach(item => {
                const card = document.createElement('div');
                card.className = 'photo-nft-card';

                const isAudio = item.sourceType === 3 || (item.url && (item.url.endsWith('.aac') || item.url.endsWith('.mp3'))) || item.audioInfo;
                const isVideo = item.sourceType === 2 || (item.url && item.url.endsWith('.mp4')) || item.videoInfo;
                const safeUrl = item.url ? (item.url.startsWith('http') ? item.url : `https://source.48.cn${item.url}`) : '';
                const extMatch = safeUrl.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
                const ext = extMatch ? extMatch[1] : (isAudio ? 'aac' : (isVideo ? 'mp4' : 'png'));
                const dlFilename = `【${memberName}】个人相册_${item.dataId || item.id || Date.now()}.${ext}`;

                let dateStr = '未知时间';
                if (item.createTime || item.ctime) {
                    const date = new Date(Number(item.createTime || item.ctime));
                    const pad = value => String(value).padStart(2, '0');
                    dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
                }

                const costHtml = item.money
                    ? `<span style="color: #fa8c16; font-weight: bold; font-size: 13px;">${item.money} 🍗</span>`
                    : `<span style="color: #52c41a; font-weight: bold; font-size: 13px;">免费</span>`;

                const downloadIcon = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>保存
        `;

                const mediaContainer = document.createElement('div');
                mediaContainer.style.cssText = 'aspect-ratio: 1 / 1; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--input-bg); border-bottom: 1px solid var(--border); overflow: hidden; position: relative;';

                if (isAudio) {
                    renderAudioPhoto(mediaContainer, safeUrl);
                } else if (isVideo) {
                    renderVideoPhoto(mediaContainer, safeUrl, item.picPath);
                } else {
                    renderImagePhoto(mediaContainer, safeUrl);
                }

                const infoContainer = document.createElement('div');
                infoContainer.style.padding = '12px';
                infoContainer.innerHTML = `
            <div style="font-size: 12px; color: var(--text-sub); margin-bottom: 6px;">${dateStr}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                ${costHtml}
                <span style="font-size: 12px; color: var(--text-sub);">发行: ${item.total || '不限'} | 已售: ${item.sold || 0}</span>
            </div>
            <div style="margin-top: 12px;">
                <button class="btn btn-secondary btn-full" style="height: 32px; font-size: 12px; border-radius: 16px;" onclick="downloadMediaFileIconMode('${safeUrl}', '${dlFilename}', this, this.innerHTML)">
                    ${downloadIcon}
                </button>
            </div>
        `;

                card.appendChild(mediaContainer);
                card.appendChild(infoContainer);
                container.appendChild(card);
            });
        }

        function renderAudioPhoto(mediaContainer, safeUrl) {
            const audioPlayer = createCustomAudioPlayer(safeUrl);
            mediaContainer.style.flexDirection = 'column';
            mediaContainer.style.background = 'linear-gradient(145deg, var(--input-bg) 0%, rgba(155, 106, 156, 0.06) 100%)';
            mediaContainer.innerHTML = `
                <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, #d49bc6 100%); box-shadow: 0 6px 16px rgba(155, 106, 156, 0.35); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; user-select: none;">
                    <svg viewBox="0 0 24 24" width="30" height="30" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="18" x2="12" y2="6"></line><line x1="8" y1="14" x2="8" y2="10"></line><line x1="16" y1="16" x2="16" y2="8"></line><line x1="4" y1="13" x2="4" y2="11"></line><line x1="20" y1="15" x2="20" y2="9"></line>
                    </svg>
                </div>
            `;
            mediaContainer.appendChild(audioPlayer);
        }

        function renderVideoPhoto(mediaContainer, safeUrl, picPath) {
            const coverUrl = picPath ? (picPath.startsWith('http') ? picPath : `https://source.48.cn${picPath}`) : '';
            mediaContainer.innerHTML = `
                <video data-src="${safeUrl}#t=0.1" preload="none" ${coverUrl ? `poster="${coverUrl}"` : ''} 
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

        function renderImagePhoto(mediaContainer, safeUrl) {
            const thumbUrl = typeof getOptimizedThumbUrl === 'function' ? getOptimizedThumbUrl(safeUrl) : safeUrl;
            mediaContainer.innerHTML = `<img src="${thumbUrl}" loading="lazy" decoding="async" onclick="openImageModal('${safeUrl}')" style="width:100%; height:100%; object-fit:cover; object-position:center; cursor:zoom-in; transition: transform 0.3s;">`;
            const imgEl = mediaContainer.querySelector('img');
            imgEl.onmouseenter = () => { imgEl.style.transform = 'scale(1.05)'; };
            imgEl.onmouseleave = () => { imgEl.style.transform = 'scale(1)'; };
        }

        window.openImageModal = window.openImageModal || openImageModal;

        return {
            fetchAllMemberPhotos,
            handlePhotoSearch,
            selectPhotoMember,
            fetchMemberPhotos
        };
    };
})();
