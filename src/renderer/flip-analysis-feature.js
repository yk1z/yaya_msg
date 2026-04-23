(function () {
    window.YayaRendererFeatures = window.YayaRendererFeatures || {};

    window.YayaRendererFeatures.createFlipAnalysisFeature = function createFlipAnalysisFeature(deps) {
        const { getAllFlipData } = deps;

        let currentFlipAnalysisYear = 'all';

        function formatDurationSimple(ms) {
            if (!ms || ms < 0) return '-';

            const totalSeconds = Math.floor(ms / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            if (days > 0) return `${days}天${hours}小时`;
            if (hours > 0) return `${hours}小时${minutes}分`;
            if (minutes > 0) return `${minutes}分${seconds}秒`;
            return `${seconds}秒`;
        }

        function toggleFlipYearDropdown() {
            const list = document.getElementById('flip-year-dropdown');
            if (list) {
                list.style.display = list.style.display === 'block' ? 'none' : 'block';
            }
        }

        function selectFlipYear(year) {
            currentFlipAnalysisYear = year;
            performFlipAnalysis();
        }

        function openFlipAnalysis() {
            const allFlipData = getAllFlipData();
            if (!allFlipData || allFlipData.length === 0) return;

            const modal = document.getElementById('flipAnalysisModal');
            if (modal) {
                modal.style.display = 'flex';
                currentFlipAnalysisYear = 'all';
                performFlipAnalysis();
            }
        }

        function closeFlipAnalysis() {
            const modal = document.getElementById('flipAnalysisModal');
            if (modal) modal.style.display = 'none';
        }

        function performFlipAnalysis() {
            const container = document.getElementById('flipAnalysisContainer');
            if (!container) return;

            const allFlipData = getAllFlipData();
            const years = [...new Set(allFlipData.map(item => {
                const timestamp = Number(item.qtime);
                return timestamp ? new Date(timestamp).getFullYear() : null;
            }))].filter(year => year).sort((a, b) => b - a);

            let filteredData = allFlipData;
            if (currentFlipAnalysisYear !== 'all') {
                filteredData = allFlipData.filter(item => {
                    const timestamp = Number(item.qtime);
                    return timestamp && new Date(timestamp).getFullYear() == currentFlipAnalysisYear;
                });
            }

            let dropdownItemsHtml = `
        <div class="suggestion-item" onclick="selectFlipYear('all')">全部年份</div>
    `;
            years.forEach(year => {
                dropdownItemsHtml += `
            <div class="suggestion-item" onclick="selectFlipYear(${year})">${year}年</div>
        `;
            });

            const currentYearText = currentFlipAnalysisYear === 'all' ? '全部年份' : `${currentFlipAnalysisYear}年`;

            let totalCount = filteredData.length;
            let totalCost = 0;
            let globalDurationSum = 0;
            let globalAnsweredCount = 0;
            let globalMinDuration = Infinity;
            let globalMaxDuration = 0;
            let typeStats = { text: 0, audio: 0, video: 0 };
            let memberStats = {};

            filteredData.forEach(item => {
                const cost = Number(item.cost) || 0;
                totalCost += cost;

                if (item.answerType === 1) typeStats.text++;
                else if (item.answerType === 2) typeStats.audio++;
                else if (item.answerType === 3) typeStats.video++;

                const name = item.baseUserInfo ? item.baseUserInfo.nickname : '未知成员';

                if (!memberStats[name]) {
                    memberStats[name] = {
                        count: 0,
                        cost: 0,
                        name,
                        durationSum: 0,
                        answeredCount: 0,
                        minDuration: Infinity,
                        maxDuration: 0,
                        minSingleCost: Infinity,
                        maxSingleCost: 0,
                        typeCounts: { text: 0, audio: 0, video: 0 }
                    };
                }

                const member = memberStats[name];
                member.count++;
                member.cost += cost;

                if (item.answerType === 1) member.typeCounts.text++;
                else if (item.answerType === 2) member.typeCounts.audio++;
                else if (item.answerType === 3) member.typeCounts.video++;

                if (cost < member.minSingleCost) member.minSingleCost = cost;
                if (cost > member.maxSingleCost) member.maxSingleCost = cost;

                if (item.status === 2 && item.qtime && item.answerTime) {
                    const diff = Number(item.answerTime) - Number(item.qtime);
                    if (diff > 0) {
                        globalDurationSum += diff;
                        globalAnsweredCount++;
                        if (diff < globalMinDuration) globalMinDuration = diff;
                        if (diff > globalMaxDuration) globalMaxDuration = diff;

                        member.durationSum += diff;
                        member.answeredCount++;
                        if (diff < member.minDuration) member.minDuration = diff;
                        if (diff > member.maxDuration) member.maxDuration = diff;
                    }
                }
            });

            if (globalMinDuration === Infinity) globalMinDuration = 0;
            let globalAvgTimeStr = '-';
            let globalRangeStr = '-';

            if (globalAnsweredCount > 0) {
                globalAvgTimeStr = formatDurationSimple(globalDurationSum / globalAnsweredCount);
                const minStr = formatDurationSimple(globalMinDuration);
                const maxStr = formatDurationSimple(globalMaxDuration);
                globalRangeStr = `${minStr} ~ ${maxStr}`;
            }

            const memberRank = Object.values(memberStats).sort((a, b) => {
                if (b.cost !== a.cost) return b.cost - a.cost;
                return b.count - a.count;
            });

            let html = `
        <div style="padding: 16px 20px; background: linear-gradient(to bottom, var(--bg), var(--input-bg)); border-bottom: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; text-align: center; margin-bottom: 15px;">
                <div style="flex: 1; border-right: 1px solid var(--border);">
                    <div style="font-size: 22px; font-weight: bold; color: var(--primary); font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${totalCount}</div>
                    <div style="font-size: 13px; color: var(--text-sub); margin-top:6px;">总翻牌数</div>
                </div>
                <div style="flex: 1; border-right: 1px solid var(--border);">
                    <div style="font-size: 22px; font-weight: bold; color: #fa8c16; font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${totalCost}</div>
                    <div style="font-size: 13px; color: var(--text-sub); margin-top:6px;">总消耗(鸡腿)</div>
                </div>
                <div style="flex: 1.4;">
                    <div style="font-size: 20px; font-weight: bold; color: #722ed1; font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${globalAvgTimeStr}</div>
                    <div style="font-size: 13px; color: var(--text-sub); margin-top:6px;">平均耗时</div>
                    <div style="font-size: 12px; color: #888; margin-top: 4px;">${globalRangeStr}</div>
                </div>
            </div>
            
            <div style="display:flex; gap: 10px; font-size: 12px; justify-content: center; margin-top: 15px;">
                <span style="background:rgba(24, 144, 255, 0.1); color:#1890ff; padding:4px 10px; border-radius:12px;">文字 ${typeStats.text}</span>
                <span style="background:rgba(114, 46, 209, 0.1); color:#722ed1; padding:4px 10px; border-radius:12px;">语音 ${typeStats.audio}</span>
                <span style="background:rgba(235, 47, 150, 0.1); color:#eb2f96; padding:4px 10px; border-radius:12px;">视频 ${typeStats.video}</span>
            </div>
        </div>
        
        <div style="padding: 10px 20px; font-weight: bold; color: var(--text-sub); font-size: 13px; background: var(--bg); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <span>成员排行</span>
            
            <div id="flip-year-wrapper" style="position: relative; width: 100px;">
                <input type="text" id="flip-year-display" class="input-control" 
                       value="${currentYearText}" readonly 
                       onclick="toggleFlipYearDropdown()"
                       style="cursor: pointer; text-align: left; padding-right: 25px; height: 28px; font-size: 12px;">
                
                <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-sub); font-size: 10px;">
                    ▼
                </div>
                
                <div id="flip-year-dropdown" class="suggestion-box" style="display: none; top: 32px; width: 100%;">
                    ${dropdownItemsHtml}
                </div>
            </div>
        </div>
    `;

            if (memberRank.length === 0) {
                html += '<div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-sub); font-size: 14px;">该年份暂无数据</div>';
            } else {
                memberRank.forEach((member, index) => {
                    let rankClass = 'rank-other';
                    let rankNum = index + 1;
                    if (index === 0) rankClass = 'rank-1';
                    else if (index === 1) rankClass = 'rank-2';
                    else if (index === 2) rankClass = 'rank-3';

                    const topCost = memberRank[0].cost || 1;
                    const percent = (member.cost / topCost) * 100;
                    const avgPrice = (member.cost / (member.count || 1)).toFixed(0);
                    const minPrice = member.minSingleCost === Infinity ? 0 : member.minSingleCost;
                    const maxPrice = member.maxSingleCost;

                    let countParts = [];
                    countParts.push(`<span style="font-weight: bold; color: var(--text);">共 ${member.count} 条</span>`);
                    if (member.typeCounts.text > 0) countParts.push(`<span style="color:#1890ff;">文字 ${member.typeCounts.text}</span>`);
                    if (member.typeCounts.audio > 0) countParts.push(`<span style="color:#722ed1;">语音 ${member.typeCounts.audio}</span>`);
                    if (member.typeCounts.video > 0) countParts.push(`<span style="color:#eb2f96;">视频 ${member.typeCounts.video}</span>`);
                    const countLineHtml = countParts.join('<span style="margin: 0 6px; color:var(--border);">|</span>');

                    let timeLineHtml = '<span style="color:#999;">暂无回答数据</span>';
                    if (member.answeredCount > 0) {
                        const avgTime = formatDurationSimple(member.durationSum / member.answeredCount);
                        const minTime = formatDurationSimple(member.minDuration);
                        const maxTime = formatDurationSimple(member.maxDuration);

                        timeLineHtml = `
                    <span style="color: #722ed1; font-weight:500;">平均耗时 ${avgTime}</span>
                    <span style="margin: 0 6px; color:var(--border);">|</span>
                    <span>最快 ${minTime}</span>
                    <span style="margin: 0 6px; color:var(--border);">|</span>
                    <span>最慢 ${maxTime}</span>
                `;
                    }

                    html += `
            <div class="list-item" style="cursor: default; padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start;">
                <div class="rank-num ${rankClass}" style="width: 30px; min-width: 30px; text-align: center; margin-right: 15px; font-weight: bold; font-size: 16px; line-height: 24px; margin-top: 2px;">${rankNum}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: bold; font-size: 15px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${member.name}</span>
                        <span style="font-weight: bold; font-size: 16px; color: #fa8c16; font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;">${member.cost} <span style="font-size:12px;">🍗</span></span>
                    </div>
                    <div style="height: 4px; background: var(--border); border-radius: 3px; overflow: hidden; margin-bottom: 10px;">
                        <div style="width: ${percent}%; height: 100%; background: #fa8c16; opacity: 0.7;"></div>
                    </div>
                    <div style="font-size: 13px; color: var(--text-sub); line-height: 1.8;">
                        <div style="display:flex; align-items:center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${countLineHtml}
                        </div>

                        <div style="display:flex; align-items:center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span style="color: #fa8c16; font-weight:500;">平均鸡腿 ${avgPrice} 🍗</span>
                            <span style="margin: 0 6px; color:var(--border);">|</span>
                            <span>最高 ${maxPrice} 🍗</span>
                            <span style="margin: 0 6px; color:var(--border);">|</span>
                            <span>最低 ${minPrice} 🍗</span>
                        </div>

                        <div style="display:flex; align-items:center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${timeLineHtml}
                        </div>
                    </div>
                </div>
            </div>`;
                });
            }

            container.innerHTML = html;
        }

        return {
            closeFlipAnalysis,
            openFlipAnalysis,
            selectFlipYear,
            toggleFlipYearDropdown
        };
    };
})();
