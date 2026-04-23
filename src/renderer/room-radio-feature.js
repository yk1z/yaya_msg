(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createRoomRadioFeature = function createRoomRadioFeature(deps) {
        const {
            getAppToken,
            getMemberData,
            getMemberDataLoaded,
            loadMemberData,
            getPinyinInitials,
            memberSortLogic,
            getTeamStyle,
            applyRoomRadioChannelValue,
            ipcRenderer,
            showToast
        } = deps;

        let radioMpegtsPlayer = null;
        let radioMediaElement = null;
        let roomRadioEndWatchdog = null;
        let roomRadioLastCurrentTime = 0;
        let roomRadioStallCount = 0;
        let roomRadioRecorder = null;
        let roomRadioChunks = [];
        let isRoomRadioRecording = false;

        function getRoomRadioSearchResultBox() {
            return document.getElementById('room-radio-search-results');
        }

        function handleRoomRadioSearch(keyword) {
            const resultBox = getRoomRadioSearchResultBox();
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
                         onclick="selectRoomRadioMember('${member.ownerName}', '${member.channelId}', '${member.serverId}', '${member.yklzId || ''}')"
                         style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight:bold; ${baseStyle}">${member.ownerName}</span>
                        <span class="team-tag" style="${baseStyle} ${colorStyle}">${member.team}</span>
                    </div>`;
            }).join('');
            resultBox.style.display = 'block';
        }

        function selectRoomRadioMember(name, channelId, serverId, smallChannelId = '') {
            const inputEl = document.getElementById('room-radio-member-input');
            const channelInput = document.getElementById('room-radio-channel-id');
            const serverInput = document.getElementById('room-radio-server-id');
            const resultBox = getRoomRadioSearchResultBox();

            if (inputEl) inputEl.value = name || '';
            if (channelInput) {
                channelInput.dataset.bigChannelId = channelId || '';
                channelInput.dataset.smallChannelId = smallChannelId || '';
            }
            applyRoomRadioChannelValue();
            if (serverInput) serverInput.value = serverId || '';
            if (resultBox) resultBox.style.display = 'none';
        }

        function handleRoomRadioEnded(reason = 'ended') {
            const statusEl = document.getElementById('radio-status-text');
            const statusText = reason === 'stalled'
                ? '上麦已结束，录制已自动停止'
                : '上麦已结束，录制已自动停止';

            if (isRoomRadioRecording) {
                toggleRoomRadioRecord();
            }

            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#faad14; font-weight:bold;">${statusText}</span>`;
            }
        }

        function clearRoomRadioEndWatchdog() {
            if (roomRadioEndWatchdog) {
                clearInterval(roomRadioEndWatchdog);
                roomRadioEndWatchdog = null;
            }
            roomRadioLastCurrentTime = 0;
            roomRadioStallCount = 0;
        }

        function setupRoomRadioEndWatchdog() {
            clearRoomRadioEndWatchdog();
            if (!radioMediaElement) return;

            roomRadioEndWatchdog = setInterval(() => {
                if (!radioMediaElement) {
                    clearRoomRadioEndWatchdog();
                    return;
                }

                if (radioMediaElement.ended) {
                    handleRoomRadioEnded('ended');
                    clearRoomRadioEndWatchdog();
                    return;
                }

                if (radioMediaElement.paused || radioMediaElement.readyState < 2) {
                    return;
                }

                const currentTime = Number(radioMediaElement.currentTime || 0);
                if (Math.abs(currentTime - roomRadioLastCurrentTime) < 0.01) {
                    roomRadioStallCount += 1;
                } else {
                    roomRadioLastCurrentTime = currentTime;
                    roomRadioStallCount = 0;
                }

                if (roomRadioStallCount >= 8) {
                    handleRoomRadioEnded('stalled');
                    clearRoomRadioEndWatchdog();
                }
            }, 1000);
        }

        async function connectRoomRadio() {
            const container = document.getElementById('room-radio-result-container');
            const channelId = String(document.getElementById('room-radio-channel-id')?.value || '').trim();
            const serverId = String(document.getElementById('room-radio-server-id')?.value || '').trim() || 0;
            const memberName = String(document.getElementById('room-radio-member-input')?.value || '').trim() || '该房间';
            const token = getAppToken ? getAppToken() : (localStorage.getItem('yaya_p48_token') || '');

            if (!token) {
                showToast('⚠️ 请先在“账号设置”中登录');
                return;
            }

            if (!channelId || channelId === 'undefined') {
                showToast('⚠️ 请先搜索成员，或手动输入 Channel ID');
                return;
            }

            stopRoomRadio(false);

            if (container) {
                container.innerHTML = '<div class="empty-state">正在连接电台并启动音频引擎...</div>';
            }

            try {
                const pa = window.getPA ? window.getPA() : null;
                const result = await ipcRenderer.invoke('fetch-room-radio', {
                    token,
                    pa,
                    channelId,
                    serverId
                });

                if (result.success && result.content) {
                    if (!result.content.streamUrl) {
                        if (container) {
                            container.innerHTML = '<div class="placeholder-tip"><h3>未开启</h3><p>该房间当前没有开启语音电台。</p></div>';
                        }
                        return;
                    }
                    playAudioOnlyStream(result.content.streamUrl, memberName, container);
                } else if (container) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 连接失败</h3><p>${result.msg}</p></div>`;
                }
            } catch (error) {
                if (container) {
                    container.innerHTML = `<div class="placeholder-tip"><h3>❌ 发生错误</h3><p>${error.message}</p></div>`;
                }
            }
        }

        async function playAudioOnlyStream(remoteUrl, memberName, container) {
            if (!container) return;
            container.innerHTML = '<div class="empty-state">正在解析音频流，请稍候...</div>';

            try {
                const localUrl = await ipcRenderer.invoke('start-radio-proxy', remoteUrl);
                await new Promise(resolve => setTimeout(resolve, 300));

                container.innerHTML = `
            <style>
                @keyframes radioPulse {
                    0% { box-shadow: 0 0 0 0 rgba(155, 106, 156, 0.4); transform: scale(1); }
                    70% { box-shadow: 0 0 0 20px rgba(155, 106, 156, 0); transform: scale(1.05); }
                    100% { box-shadow: 0 0 0 0 rgba(155, 106, 156, 0); transform: scale(1); }
                }
            </style>
            <div style="background: var(--input-bg); border: 1px solid var(--border); border-radius: 12px; padding: 40px 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 10px;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, #d49bc6 100%); margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; animation: radioPulse 2s infinite;">
                    <span style="font-size: 36px; color: white;">📻</span>
                </div>
                <h3 style="margin: 0 0 10px 0; color: var(--primary);">${memberName} 的房间电台</h3>
                <div style="font-size: 13px; color: var(--text-sub); margin-bottom: 25px;" id="radio-status-text">正在缓冲音频数据...</div>
                
                <div style="display: flex; justify-content: center; gap: 15px; align-items: center;">
                    <button class="btn btn-secondary" onclick="toggleRadioMute()" id="btn-radio-mute" style="width: 100px;">静音</button>
                    <button class="btn btn-secondary" onclick="toggleRoomRadioRecord()" id="btn-radio-record" style="width: 100px;">开始录制</button>
                    <button class="btn btn-primary" onclick="stopRoomRadio(true)" style="background: #ff4d4f; border-color: #ff4d4f; width: 100px;">停止收听</button>
                </div>
                <video id="hidden-radio-audio" style="display: none;" crossorigin="anonymous"></video>
            </div>
        `;

                radioMediaElement = document.getElementById('hidden-radio-audio');
                if (window.mpegts && window.mpegts.isSupported()) {
                    radioMpegtsPlayer = window.mpegts.createPlayer(
                        {
                            type: 'flv',
                            url: localUrl,
                            isLive: true,
                            hasVideo: false,
                            hasAudio: true
                        },
                        {
                            enableWorker: false,
                            enableStashBuffer: false,
                            stashInitialSize: 128,
                            liveBufferLatencyChasing: true,
                            liveBufferLatencyMaxLatency: 1.5
                        }
                    );

                    radioMpegtsPlayer.attachMediaElement(radioMediaElement);
                    radioMpegtsPlayer.load();

                    radioMediaElement.addEventListener('playing', () => {
                        const statusEl = document.getElementById('radio-status-text');
                        if (statusEl) statusEl.innerHTML = '<span style="color:#28a745; font-weight:bold;">▶ 正在收听</span>';
                        roomRadioLastCurrentTime = Number(radioMediaElement.currentTime || 0);
                        roomRadioStallCount = 0;
                    });

                    radioMediaElement.addEventListener('error', () => {
                        const statusEl = document.getElementById('radio-status-text');
                        if (statusEl) statusEl.innerHTML = '<span style="color:#ff4d4f;">⚠️ 播放断开或解码出错</span>';
                        handleRoomRadioEnded('error');
                    });

                    radioMediaElement.addEventListener('ended', () => {
                        handleRoomRadioEnded('ended');
                    });

                    radioMediaElement.addEventListener('emptied', () => {
                        handleRoomRadioEnded('emptied');
                    });

                    setupRoomRadioEndWatchdog();
                    radioMpegtsPlayer.play();
                } else {
                    container.innerHTML = '<div class="placeholder-tip"><h3>❌ 播放引擎错误</h3><p>您的环境不支持该格式的音频解码。</p></div>';
                }
            } catch (error) {
                container.innerHTML = `<div class="placeholder-tip"><h3>❌ 启动代理失败</h3><p>${error.message}</p></div>`;
            }
        }

        function toggleRadioMute() {
            if (!radioMediaElement) return;
            const buttonEl = document.getElementById('btn-radio-mute');
            if (radioMediaElement.muted) {
                radioMediaElement.muted = false;
                if (buttonEl) buttonEl.innerText = '静音';
            } else {
                radioMediaElement.muted = true;
                if (buttonEl) buttonEl.innerText = '取消静音';
            }
        }

        function stopRoomRadio(updateUI = true) {
            clearRoomRadioEndWatchdog();
            if (isRoomRadioRecording) {
                toggleRoomRadioRecord();
            }

            if (radioMpegtsPlayer) {
                try {
                    radioMpegtsPlayer.pause();
                    radioMpegtsPlayer.unload();
                    radioMpegtsPlayer.detachMediaElement();
                    radioMpegtsPlayer.destroy();
                } catch (error) { }
                radioMpegtsPlayer = null;
            }

            if (radioMediaElement) {
                radioMediaElement.pause();
                radioMediaElement.src = '';
                radioMediaElement = null;
            }

            ipcRenderer.invoke('stop-live-proxy');

            if (updateUI) {
                const container = document.getElementById('room-radio-result-container');
                if (container) {
                    container.innerHTML = `
                <div class="placeholder-tip">
                    <h3>已停止收听</h3>
                    <p>电台已关闭。您可以重新搜索其他成员并连接。</p>
                </div>
            `;
                }
            }
        }

        function toggleRoomRadioRecord() {
            const buttonEl = document.getElementById('btn-radio-record');
            if (!radioMediaElement) return;

            if (!isRoomRadioRecording) {
                try {
                    const stream = radioMediaElement.captureStream ? radioMediaElement.captureStream() : radioMediaElement.mozCaptureStream();

                    if (stream.getAudioTracks().length === 0) {
                        alert('音频流尚未准备好，请等声音出来后再点击录制！');
                        return;
                    }

                    roomRadioRecorder = new MediaRecorder(stream);
                    roomRadioChunks = [];

                    roomRadioRecorder.ondataavailable = function (event) {
                        if (event.data.size > 0) roomRadioChunks.push(event.data);
                    };

                    roomRadioRecorder.onstop = async function () {
                        const blob = new Blob(roomRadioChunks, { type: 'audio/webm' });
                        const now = new Date();
                        const timeStr = `${now.getMonth() + 1}月${now.getDate()}日_${now.getHours()}时${now.getMinutes()}分`;
                        const fileNameBase = `房间电台录音_${timeStr}`;

                        try {
                            const arrayBuffer = await blob.arrayBuffer();
                            const result = await ipcRenderer.invoke('save-room-radio-recording', {
                                arrayBuffer,
                                fileNameBase,
                                savePath: localStorage.getItem('yaya_path_room_radio') || ''
                            });

                            if (result?.success) {
                                showToast('录音已保存为 MP3');
                            } else if (result?.fallback) {
                                showToast(result.msg || 'MP3 转换失败，已保存为 WebM');
                            } else {
                                showToast('录音保存失败');
                            }
                        } catch (error) {
                            console.error('电台录音保存失败:', error);
                            showToast('录音保存失败');
                        }
                    };

                    roomRadioRecorder.start();
                    isRoomRadioRecording = true;

                    if (buttonEl) {
                        buttonEl.innerHTML = '正在录制';
                        buttonEl.style.color = '#ff4d4f';
                        buttonEl.style.borderColor = '#ff4d4f';
                    }
                } catch (error) {
                    console.error('电台录制失败:', error);
                    alert('无法录制！环境可能不支持。错误信息：' + error.message);
                }
            } else {
                if (roomRadioRecorder && roomRadioRecorder.state !== 'inactive') {
                    roomRadioRecorder.stop();
                }
                isRoomRadioRecording = false;

                if (buttonEl) {
                    buttonEl.innerHTML = '开始录制';
                    buttonEl.style.color = '';
                    buttonEl.style.borderColor = '';
                }
            }
        }

        return {
            handleRoomRadioSearch,
            selectRoomRadioMember,
            connectRoomRadio,
            toggleRadioMute,
            stopRoomRadio,
            toggleRoomRadioRecord
        };
    };
})();
