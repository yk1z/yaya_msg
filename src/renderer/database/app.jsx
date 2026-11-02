        import React, { useState, useMemo, useRef, useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { pinyin } from 'pinyin-pro';
        import { loadProfilePhotoHistory, selectProfilePhotoHistory } from './profile-photo-history.mjs';
        import { Search, Users, Upload, Heart, MapPin, Calendar, Hash, X, Layers, ChevronDown, Check, Cake, Trophy, FileText, Clock, ArrowUpCircle, LogOut, GraduationCap, Copy, Moon, Sun, List, UserSquare2, Sparkles, TrendingUp, TrendingDown, Minus, Music, Disc, AlertCircle, Mic2, Loader2, ExternalLink, ClipboardCopy, Star, Ruler, Droplet, UserCircle, CalendarDays, Activity } from 'lucide-react';
        const DEMO_DATA = [];
        const DATABASE_UI_STATE_KEY = 'yaya_database_ui_state_v1';
        const DATABASE_DEFAULT_MESSAGES = {
            'database.showAllSongs': '查看全部 {count} 首',
            'database.triedPath': '尝试路径：{path}',
            'database.electionEdition': '{edition}选',
            'database.searchResult': '搜索“{query}”的结果',
            'database.memberCount': '{count} 人',
            'database.electionResult': '第 {edition} 届总选结果',
            'database.searchLyricsRepo': '在歌词仓库中搜索“{query}”'
        };
        const t = (key, variables = {}) => {
            const translated = window.YayaRendererUtils?.t?.(key, variables);
            const template = translated != null && translated !== key
                ? translated : (DATABASE_DEFAULT_MESSAGES[key] ?? key);
            return Object.entries(variables).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                String(template)
            );
        };

        function useYayaLocale() {
            const [locale, setLocale] = useState(() => window.YayaI18n?.locale || 'zh-CN');
            useEffect(() => {
                const refresh = () => setLocale(window.YayaI18n?.locale || 'zh-CN');
                window.addEventListener('yaya:locale-change', refresh);
                return () => window.removeEventListener('yaya:locale-change', refresh);
            }, []);
            return locale;
        }

        const COS_BASE = 'https://data.gnz.hk';
        const LYRICS_REPO_URL = 'https://github.com/yk1z/yaya_data/tree/main/lyrics';
        const LYRICS_SEARCH_URL = 'https://github.com/yk1z/yaya_data/search?q=';

        const DATA_URLS = {
            members: `${COS_BASE}/members.json`,
            zx: `${COS_BASE}/zx.json`,
            stages: `${COS_BASE}/stages.json`,
            fxzp: `${COS_BASE}/fxzp.json`,
            lyrics: `${COS_BASE}/lyrics/`
        };

        const LYRICS_INDEX_URL = `${COS_BASE}/lyrics-index.json`;
        let lyricsIndexPromise = null;

        const getDesktopCacheApi = () => {
            if (typeof window === 'undefined') return null;
            return window.desktop && window.desktop.appCache ? window.desktop.appCache : null;
        };

        const getDesktopSettingsApi = () => {
            if (typeof window === 'undefined') return null;
            return window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
        };

        const getInitialDatabaseUiState = () => {
            if (typeof window === 'undefined') return {};
            try {
                const cacheApi = getDesktopCacheApi();
                if (cacheApi && typeof cacheApi.getCacheValueSync === 'function') {
                    const stored = cacheApi.getCacheValueSync(DATABASE_UI_STATE_KEY, null);
                    if (stored && typeof stored === 'object') {
                        return stored;
                    }
                }

                const raw = localStorage.getItem(DATABASE_UI_STATE_KEY);
                if (!raw) return {};
                const parsed = JSON.parse(raw);
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync(DATABASE_UI_STATE_KEY, parsed);
                    localStorage.removeItem(DATABASE_UI_STATE_KEY);
                }
                return parsed;
            } catch (error) {
                console.error('Failed to parse database UI state:', error);
                return {};
            }
        };

        const fetchLyricsIndex = () => {
            if (window.YayaDataSync) return window.YayaDataSync.read(LYRICS_INDEX_URL);
            if (!lyricsIndexPromise) {
                lyricsIndexPromise = fetch(LYRICS_INDEX_URL)
                    .then(res => {
                        if (!res.ok) throw new Error('Lyrics index not found');
                        return res.json();
                    })
                    .catch(err => {
                        lyricsIndexPromise = null;
                        throw err;
                    });
            }
            return lyricsIndexPromise;
        };

        const encodeLyricPath = (path) => path.split('/').map(encodeURIComponent).join('/');

        const normalizeLyricToken = (value) => String(value || '')
            .normalize('NFKC')
            .replace(/[’'＇]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/[（]/g, '(')
            .replace(/[）]/g, ')')
            .replace(/[《〈]/g, '<')
            .replace(/[》〉]/g, '>')
            .replace(/[！]/g, '!')
            .replace(/[？]/g, '?')
            .replace(/[：]/g, ':')
            .replace(/[·•・]/g, '·')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();

        const buildLyricNameVariants = (name) => {
            const raw = String(name || '').trim();
            if (!raw) return [];
            const variants = new Set([raw]);
            const push = (value) => value && variants.add(value);

            push(raw.replace(/[！]/g, '!'));
            push(raw.replace(/!/g, '！'));
            push(raw.replace(/[（]/g, '(').replace(/[）]/g, ')'));
            push(raw.replace(/\(/g, '（').replace(/\)/g, '）'));
            push(raw.replace(/[《〈]/g, '<').replace(/[》〉]/g, '>'));
            push(raw.replace(/[<>]/g, ''));
            push(raw.replace(/[《》〈〉]/g, ''));
            push(raw.replace(/[·•・]/g, '·'));
            push(raw.replace(/[·•・]/g, ''));
            push(raw.replace(/\s+/g, ''));

            return [...variants];
        };

        const buildLegacyLyricPaths = (song) => {
            const paths = [];
            const titleVariants = buildLyricNameVariants(song.歌曲名);

            if (song.lrcPath) {
                paths.push(song.lrcPath);
            }

            if (song.分团 && song.类型 && song.专辑序号 && song.专辑) {
                const folderName = `${song.类型}${song.专辑序号} ${song.专辑}`;
                for (const title of titleVariants) {
                    paths.push(`${song.分团}/${folderName}/${song.分团} - ${title}.lrc`);
                }
            }

            if (song.分团 && song.专辑) {
                const folderCandidates = new Set();
                if (song.类型) {
                    folderCandidates.add(`${song.类型}${song.专辑序号 ? `${song.专辑序号} ` : ' '}${song.专辑}`.trim());
                    folderCandidates.add(`${song.类型} ${song.专辑}`.trim());
                }
                if (song.类型 === '其它歌曲' || song.类型 === '音乐影片') {
                    folderCandidates.add('Single');
                }
                if (song.类型 === '周年主题曲') {
                    folderCandidates.add('Single');
                }

                for (const folderName of folderCandidates) {
                    for (const title of titleVariants) {
                        paths.push(`${song.分团}/${folderName}/${song.分团} - ${title}.lrc`);
                    }
                }
            }

            for (const title of titleVariants) {
                paths.push(`${title}.lrc`);
            }

            return [...new Set(paths)];
        };

        const buildIndexedLyricPaths = (song, index) => {
            if (!Array.isArray(index) || !song) return [];
            const titleVariants = buildLyricNameVariants(song.歌曲名).map(normalizeLyricToken);
            const titleSet = new Set(titleVariants);
            const normalizedAlbum = normalizeLyricToken(song.专辑);
            const normalizedType = normalizeLyricToken(song.类型);
            const normalizedSeq = normalizeLyricToken(song.专辑序号);

            const scored = index
                .filter(item => item && item.group === song.分团)
                .filter(item => titleSet.has(normalizeLyricToken(item.songTitle)))
                .map(item => {
                    const folder = String(item.folder || '');
                    const normalizedFolder = normalizeLyricToken(folder);
                    let score = 0;

                    if (song.lrcPath && item.path === song.lrcPath) score += 1000;
                    if (normalizedAlbum && normalizedFolder.includes(normalizedAlbum)) score += 300;

                    if (song.类型 === '公演专辑' && folder.startsWith('公演专辑')) score += 180;
                    if (song.类型 === 'EP' && folder.startsWith('EP')) score += 180;
                    if (song.类型 === '专辑' && folder.startsWith('专辑')) score += 180;
                    if ((song.类型 === '其它歌曲' || song.类型 === '音乐影片') && folder === 'Single') score += 180;
                    if (song.类型 === '周年主题曲' && (folder === 'Single' || folder.startsWith('EP'))) score += 120;

                    if (normalizedType && normalizedFolder.startsWith(normalizedType)) score += 80;
                    if (normalizedSeq && normalizedFolder.includes(normalizedSeq)) score += 40;

                    if (normalizeLyricToken(item.file).includes(normalizeLyricToken(`${song.分团}-${song.歌曲名}`))) score += 20;

                    return { path: item.path, score };
                })
                .sort((a, b) => b.score - a.score);

            return [...new Set(scored.map(item => item.path))];
        };

        const GROUP_COLORS = {
            "SNH48": "bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
            "GNZ48": "bg-green-100 text-green-600 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
            "BEJ48": "bg-pink-100 text-pink-600 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800",
            "CKG48": "bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
            "CGT48": "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
            "SHY48": "bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
            "7SENSES": "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700",
            "IDFT": "bg-[#900058]/10 text-[#900058] border-[#900058]/30 dark:bg-[#900058]/20 dark:text-[#ffb3d9] dark:border-[#900058]/50",
            "明星殿堂": "bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
            "官方": "bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600",
            "default": "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
        };

        const GROUP_ACCENT_COLORS = {
            "SNH48": "#2563EB",
            "GNZ48": "#16A34A",
            "BEJ48": "#DB2777",
            "CKG48": "#EA580C",
            "CGT48": "#DC2626",
            "SHY48": "#9333EA",
            "IDFT": "#900058",
            "明星殿堂": "#9333EA",
            "default": "#6B7280"
        };

        const ALBUM_CARD_STYLES = {
            "SNH48": "bg-white border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50",
            "GNZ48": "bg-white border-green-200 dark:bg-green-900/20 dark:border-green-800/50",
            "BEJ48": "bg-white border-pink-200 dark:bg-pink-900/20 dark:border-pink-800/50",
            "CKG48": "bg-white border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/50",
            "CGT48": "bg-white border-red-200 dark:bg-red-900/20 dark:border-red-800/50",
            "SHY48": "bg-white border-purple-200 dark:bg-purple-900/20 dark:border-purple-800/50",
            "7SENSES": "bg-white border-gray-300 dark:bg-gray-800/40 dark:border-gray-600",
            "DEMOON": "bg-white border-fuchsia-200 dark:bg-fuchsia-900/20 dark:border-fuchsia-800/50",
            "BLUEV": "bg-white border-cyan-200 dark:bg-cyan-900/20 dark:border-cyan-800/50",
            "IDFT": "bg-white border-[#900058]/20 dark:bg-[#900058]/10 dark:border-[#900058]/30",
            "明星殿堂": "bg-white border-purple-200 dark:bg-purple-900/20 dark:border-purple-800/50",
            "官方": "bg-white border-gray-200 dark:bg-gray-800/40 dark:border-gray-700",
            "default": "bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-800"
        };
        const getAlbumCardStyle = (group) => ALBUM_CARD_STYLES[group] || ALBUM_CARD_STYLES["default"];

        const TEAM_COLORS = {
            "TEAM SII": "text-[#A1D5ED] bg-[#A1D5ED]/10 border-[#A1D5ED]/30 dark:bg-[#A1D5ED]/20",
            "TEAM NII": "text-[#BE98C7] bg-[#BE98C7]/10 border-[#BE98C7]/30 dark:bg-[#BE98C7]/20",
            "TEAM HII": "text-[#F8941D] bg-[#F8941D]/10 border-[#F8941D]/30 dark:bg-[#F8941D]/20",
            "TEAM X": "text-[#B1D61B] bg-[#B1D61B]/10 border-[#B1D61B]/30 dark:bg-[#B1D61B]/20",
            "TEAM B": "text-[#FF4083] bg-[#FF4083]/10 border-[#FF4083]/30 dark:bg-[#FF4083]/20",
            "TEAM E": "text-[#0CC8C3] bg-[#0CC8C3]/10 border-[#0CC8C3]/30 dark:bg-[#0CC8C3]/20",
            "TEAM J": "text-[#192F6B] bg-[#192F6B]/10 border-[#192F6B]/30 dark:text-[#6a8be8] dark:bg-[#6a8be8]/20 dark:border-[#6a8be8]/30",
            "TEAM G": "text-[#9FBF40] bg-[#9FBF40]/10 border-[#9FBF40]/30 dark:bg-[#9FBF40]/20",
            "TEAM NIII": "text-[#FFE249] bg-[#FFE249]/10 border-[#FFE249]/30 dark:bg-[#FFE249]/20",
            "TEAM Z": "text-[#EA617B] bg-[#EA617B]/10 border-[#EA617B]/30 dark:bg-[#EA617B]/20",
            "TEAM C": "text-[#FEB90D] bg-[#FEB90D]/10 border-[#FEB90D]/30 dark:bg-[#FEB90D]/20",
            "TEAM K": "text-[#FF5043] bg-[#FF5043]/10 border-[#FF5043]/30 dark:bg-[#FF5043]/20",
            "TEAM CII": "text-[#D21217] bg-[#D21217]/10 border-[#D21217]/30 dark:text-[#ff6b6e] dark:bg-[#ff6b6e]/20 dark:border-[#ff6b6e]/30",
            "TEAM GII": "text-[#0061C0] bg-[#0061C0]/10 border-[#0061C0]/30 dark:text-[#4d9eff] dark:bg-[#4d9eff]/20 dark:border-[#4d9eff]/30",
            "荣誉毕业生": "text-gray-500 bg-gray-100 border-gray-200 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700",
            "预备生": "text-gray-500 bg-gray-100 border-gray-200 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700",
            "海外练习生": "text-gray-500 bg-gray-100 border-gray-200 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700",
            "default": "text-gray-500 bg-gray-50 border-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-700"
        };

        const TEAM_SORT_ORDER = [
            "TEAM SII", "TEAM NII", "TEAM HII", "TEAM X",
            "TEAM G", "TEAM NIII", "TEAM Z",
            "TEAM B", "TEAM E", "TEAM J",
            "TEAM C", "TEAM K",
            "TEAM CII", "TEAM GII", "TEAM CGT",
            "预备生", "海外练习生", "荣誉毕业生", "明星殿堂"
        ];

        const MEMBER_GROUP_SORT_ORDER = ['SNH48', 'BEJ48', 'GNZ48', 'CKG48', 'CGT48', 'SHY48', 'IDFT', '明星殿堂'];

        const getGroupStyle = (groupName) => GROUP_COLORS[groupName] || GROUP_COLORS["default"];
        const getGroupAccentColor = (groupName) => GROUP_ACCENT_COLORS[groupName] || GROUP_ACCENT_COLORS["default"];

        const getTeamStyle = (teamName) => {
            if (!teamName) return TEAM_COLORS["default"];
            const upperName = teamName.toUpperCase();
            if (TEAM_COLORS[upperName]) return TEAM_COLORS[upperName];
            if (TEAM_COLORS[`TEAM ${upperName}`]) return TEAM_COLORS[`TEAM ${upperName}`];
            if (upperName.startsWith("TEAM ")) {
                if (TEAM_COLORS[upperName]) return TEAM_COLORS[upperName];
            } else {
                if (TEAM_COLORS[`TEAM ${upperName}`]) return TEAM_COLORS[`TEAM ${upperName}`];
            }
            if (TEAM_COLORS[teamName]) return TEAM_COLORS[teamName];
            return TEAM_COLORS["default"];
        };

        const checkIsActive = (member) => {
            if (member.isy === 'y' || member.isy === 'Y') return true;
            if (member.isInGroup === true) return true;
            return false;
        };

        const parseChinesePeriod = (name) => {
            if (!name) return 9999;
            const match = name.match(/([一二三四五六七八九十]+)期/);
            if (!match) return 9999;
            const cn = match[1];
            const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
            if (map[cn]) return map[cn];
            if (cn.startsWith('十')) return 10 + (map[cn[1]] || 0);
            if (cn.startsWith('二十')) return (cn === '二十' ? 20 : 20 + (map[cn[2]] || 0));
            if (cn.startsWith('三十')) return 30 + (map[cn[2]] || 0);
            return 9999;
        };

        const parsePeriodGroupOrder = (name) => {
            const normalized = String(name || '').toUpperCase();
            const order = ['SNH48', 'BEJ48', 'GNZ48', 'CKG48', 'CGT48', 'SHY48'];
            const index = order.findIndex(group => normalized.includes(group) || normalized.includes(group.replace('48', '')));
            return index === -1 ? 9999 : index;
        };

        const comparePeriodName = (a, b) => {
            const groupIndexA = parsePeriodGroupOrder(a);
            const groupIndexB = parsePeriodGroupOrder(b);
            if (groupIndexA !== groupIndexB) return groupIndexA - groupIndexB;
            const periodIndexA = parseChinesePeriod(a);
            const periodIndexB = parseChinesePeriod(b);
            if (periodIndexA !== periodIndexB) return periodIndexA - periodIndexB;
            return a.localeCompare(b);
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return null;
            const match = dateStr.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
            if (match) {
                const year = match[1];
                const month = match[2].padStart(2, '0');
                const day = match[3].padStart(2, '0');
                return `${year}.${month}.${day}`;
            }
            return dateStr;
        };

        const getPinyinInitials = (pinyin) => {
            if (!pinyin) return '';
            return pinyin
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .split(/[\s_-]+/)
                .filter(Boolean)
                .map(part => part[0]?.toLowerCase() || '')
                .join('');
        };

        const getSearchPinyin = (value) => {
            const text = String(value || '').trim();
            if (!text) return '';
            try {
                return pinyin(text, { toneType: 'none' }).toLowerCase();
            } catch (error) {
                return '';
            }
        };

        const normalizeSearchToken = (value) => String(value || '').toLowerCase().replace(/[\s_-]+/g, '');

        const matchesTextSearch = (fields, searchText) => {
            const normalizedSearch = normalizeSearchToken(searchText);
            const rawSearch = String(searchText || '').toLowerCase().trim();
            if (!normalizedSearch) return true;

            return fields.some((field) => {
                const rawText = String(field || '');
                if (!rawText) return false;

                const lowerText = rawText.toLowerCase();
                const normalizedText = normalizeSearchToken(rawText);
                if (lowerText.includes(rawSearch) || normalizedText.includes(normalizedSearch)) return true;

                const pinyinText = getSearchPinyin(rawText);
                if (!pinyinText) return false;

                return pinyinText.includes(rawSearch)
                    || normalizeSearchToken(pinyinText).includes(normalizedSearch)
                    || getPinyinInitials(pinyinText).includes(normalizedSearch);
            });
        };

        const StageCard = ({ data, index }) => {
            const isLeftCard = index % 2 === 0;

            return (
                <div className={`rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-all duration-300 animate-content group flex flex-col justify-between h-full text-left ${isLeftCard ? 'md:text-right' : 'md:text-left'}`}>
                    <div>
                        <div className={`flex items-start mb-2 ${isLeftCard ? 'md:flex-row-reverse justify-between' : 'justify-between'}`}>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getTeamStyle(data.队伍)}`}>
                                {t(data.队伍)}
                            </span>
                            <span className={`text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded border ${getGroupStyle(data.分团)}`}>
                                {t(data.分团)}
                            </span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-pink-500 transition-colors">
                            {data.名称}
                        </h3>

                        <div className="space-y-2 mt-4">
                            <div className={`flex items-start text-xs text-gray-600 dark:text-gray-400 ${isLeftCard ? 'md:flex-row-reverse' : ''}`}>
                                <Calendar className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400 mr-2 ${isLeftCard ? 'md:ml-2 md:mr-0' : 'mr-2'}`} />
                                <span className="break-words">{data.日期}</span>
                            </div>
                            <div className={`flex items-center text-xs text-gray-600 dark:text-gray-400 ${isLeftCard ? 'md:flex-row-reverse' : ''}`}>
                                <List className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 ${isLeftCard ? 'md:ml-2 mr-2 md:mr-0' : 'mr-2'}`} />
                                <span>{data.场次}</span>
                            </div>
                        </div>
                    </div>

                    {data.备注 && (
                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 italic">
                            {data.备注}
                        </div>
                    )}
                </div>
            );
        };

        const AlbumCard = ({ album, onSongClick }) => {
            const [isExpanded, setIsExpanded] = useState(false);
            const displayedSongs = isExpanded ? album.songs : album.songs.slice(0, 3);
            const hasMore = album.songs.length > 3;
            const cardStyle = getAlbumCardStyle(album.分团);

            return (
                <div className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 animate-content group ${cardStyle}`}>
                    <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] px-1.5 py-0.5 rounded border border-black/10 dark:border-white/10 bg-white dark:bg-black/20 text-gray-700 dark:text-gray-300 font-bold">
                                    {t(album.分团)}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded border border-black/10 dark:border-white/10 bg-white dark:bg-black/10 text-gray-600 dark:text-gray-400">
                                    {t(album.类型)}
                                </span>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                                {album.专辑名}
                            </h3>
                            <div className="flex items-center text-xs text-gray-600 dark:text-gray-400 mt-1">
                                <Calendar className="w-3.5 h-3.5 mr-1" />
                                {album.hasMultipleDates ? (
                                    <span>{t('多种日期 / 见详情')}</span>
                                ) : (
                                    <span>{album.发行日期}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-3 bg-white dark:bg-black/20">
                        <div className="space-y-1">
                            {displayedSongs.map((song, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center text-sm p-2 rounded hover:bg-white/60 dark:hover:bg-black/30 transition-colors cursor-pointer group/song"
                                    onClick={() => onSongClick(song)}
                                >
                                    <span className="text-gray-500 dark:text-gray-500 w-6 font-mono text-xs flex-shrink-0">{song.歌曲序号}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-800 dark:text-gray-200 truncate group-hover/song:text-pink-600 dark:group-hover/song:text-pink-400 transition-colors">{song.歌曲名}</div>
                                        <div className="flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-500">
                                            {song.演唱者 && <span className="truncate max-w-[150px]">{song.演唱者}</span>}
                                            {album.hasMultipleDates && song.发行日期 && (
                                                <span className="text-gray-400 dark:text-gray-600">{song.发行日期}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center text-gray-400 dark:text-gray-500 flex-shrink-0 group-hover/song:text-pink-500 dark:group-hover/song:text-pink-400">
                                        <span className="text-[10px] mr-1 opacity-0 group-hover/song:opacity-100 transition-opacity">{t('查看歌词')}</span>
                                        <Mic2 className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {hasMore && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="w-full mt-2 py-1.5 text-xs text-gray-600 hover:text-pink-600 dark:text-gray-400 dark:hover:text-pink-400 transition-colors flex items-center justify-center border-t border-black/5 dark:border-white/5"
                            >
                                {isExpanded ? t('收起') : t('database.showAllSongs', { count: album.songs.length })}
                                <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                        )}
                    </div>
                </div>
            );
        };

        const LyricModal = ({ song, onClose }) => {
            if (!song) return null;
            const [lyrics, setLyrics] = useState(null);
            const [loading, setLoading] = useState(true);
            const [error, setError] = useState(false);
            const [fullUrl, setFullUrl] = useState('');
            const [copySuccess, setCopySuccess] = useState(false);

            useEffect(() => {
                let cancelled = false;

                const fetchLyric = async (url) => {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error("Lyrics not found");
                    return res.text();
                };

                const tryLyricUrls = async (urls) => {
                    for (const url of urls) {
                        try {
                            const text = await fetchLyric(url);
                            if (cancelled) return;
                            setFullUrl(url);
                            setLyrics(text);
                            setLoading(false);
                            return;
                        } catch (err) {
                            console.error("Failed to load lyrics from:", url, err);
                        }
                    }

                    if (!cancelled) {
                        setError(true);
                        setLoading(false);
                    }
                };

                const resolveAndFetchLyrics = async () => {
                    const urls = [];

                    if (song.lrcPath) {
                        urls.push(`${DATA_URLS.lyrics}${encodeLyricPath(song.lrcPath)}`);
                    }

                    try {
                        const index = await fetchLyricsIndex();
                        buildIndexedLyricPaths(song, index).forEach(path => {
                            urls.push(`${DATA_URLS.lyrics}${encodeLyricPath(path)}`);
                        });
                    } catch (err) {
                        console.error('Failed to load lyrics index:', err);
                    }

                    buildLegacyLyricPaths(song).forEach(path => {
                        urls.push(`${DATA_URLS.lyrics}${encodeLyricPath(path)}`);
                    });

                    const uniqueUrls = [...new Set(urls)];
                    if (uniqueUrls.length > 0) {
                        setFullUrl(uniqueUrls[0]);
                    }
                    await tryLyricUrls(uniqueUrls);
                };

                setLoading(true);
                setError(false);
                setLyrics(null);
                setCopySuccess(false);
                resolveAndFetchLyrics();

                return () => {
                    cancelled = true;
                };
            }, [song]);

            const parsedLyrics = useMemo(() => {
                if (!lyrics) return [];
                return lyrics.split('\n')
                    .filter(line => !/^\[(ti|ar|al|offset|tool|by|length):/.test(line.trim()))
                    .map(line => {
                        return line.replace(/\[\d{2}:\d{2}(\.\d{2,3})?\]/g, '').trim();
                    })
                    .filter(line => !window.YayaRendererUtils.isLyricCreditLine(line))
                    .filter(line => line);
            }, [lyrics]);

            const handleCopyLyrics = () => {
                if (!parsedLyrics.length) return;
                const textToCopy = parsedLyrics.join('\n');

                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                } catch (err) {
                    console.error('Failed to copy lyrics', err);
                }
                document.body.removeChild(textArea);
            };

            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm animate-backdrop" onClick={onClose}>
                    <div
                        className="db-lyrics-modal bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col transform transition-all scale-100 dark:bg-gray-900 dark:border dark:border-gray-800 animate-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="db-lyrics-modal-header flex justify-between items-center p-4 border-b border-gray-100 bg-white sticky top-0 z-10 dark:bg-gray-900 dark:border-gray-800">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{song.歌曲名}</h3>
                                {song.演唱者 && <p className="text-xs text-gray-500 dark:text-gray-400">{song.演唱者}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                {!loading && !error && parsedLyrics.length > 0 && (
                                    <button
                                        onClick={handleCopyLyrics}
                                        className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500 dark:text-gray-400 dark:hover:bg-gray-800 relative group"
                                        title={t('复制歌词')}
                                    >
                                        {copySuccess ? <Check className="w-5 h-5 text-green-500" /> : <ClipboardCopy className="w-5 h-5" />}
                                    </button>
                                )}
                                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500 dark:text-gray-400 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
                            </div>
                        </div>

                        <div className="db-lyrics-modal-body flex-1 overflow-y-auto p-6 custom-scrollbar text-center">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-40">
                                    <Loader2 className="w-8 h-8 text-pink-500 animate-spin mb-2" />
                                    <p className="text-gray-500 text-sm">{t('正在加载歌词...')}</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                    <FileText className="w-12 h-12 mb-2 opacity-50" />
                                    <p>{t('暂无歌词')}</p>
                                    <p className="text-xs mt-2 text-gray-500 max-w-xs break-all">{t('database.triedPath', { path: fullUrl.split('/').pop() })}</p>
                                    <a href={LYRICS_REPO_URL} target="_blank" rel="noopener noreferrer" className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center">
                                        {t('去仓库看看')} <ExternalLink className="w-3 h-3 ml-1" />
                                    </a>
                                </div>
                            ) : (
                                <div className="db-lyrics-lines space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                                    {parsedLyrics.length > 0 ? parsedLyrics.map((line, idx) => (
                                        <p key={idx} className="min-h-[1.5em]">{line}</p>
                                    )) : (
                                        <p className="text-gray-400 italic">{t('纯音乐或无歌词文本')}</p>
                                    )}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            );
        };

        const ElectionCard = ({ data, index, showEdition }) => {
            let rankColor = "text-gray-500 dark:text-gray-400";
            let bgColor = "bg-white dark:bg-gray-800";
            let borderColor = "border-gray-100 dark:border-gray-700";

            const rankStr = data.排名.toString();
            const cleanRankStr = rankStr.replace("新人", "");
            const rankNum = parseInt(cleanRankStr);
            const displayRank = cleanRankStr;

            if (rankNum === 1) {
                rankColor = "text-yellow-600 dark:text-yellow-400";
                bgColor = "bg-white dark:bg-yellow-900/10";
                borderColor = "border-yellow-200 dark:border-yellow-800";
            } else if (rankNum === 2) {
                rankColor = "text-slate-500 dark:text-slate-400";
                bgColor = "bg-white dark:bg-slate-800/50";
                borderColor = "border-slate-200 dark:border-slate-700";
            } else if (rankNum === 3) {
                rankColor = "text-orange-700 dark:text-orange-400";
                bgColor = "bg-white dark:bg-orange-900/10";
                borderColor = "border-orange-200 dark:border-orange-800";
            } else if (!isNaN(rankNum) && rankNum <= 7) {
                borderColor = "border-pink-200 dark:border-pink-900";
            } else if (!isNaN(rankNum) && rankNum <= 16) {
                borderColor = "border-blue-100 dark:border-blue-900";
            }

            const getRankTrend = (trend) => {
                if (!trend || trend === '-') return null;
                let trendStr = trend.toString();
                const cleanTrendStr = trendStr.replace(/[^\d.新人-]/g, "").trim();

                if (trendStr.includes('↑') || trendStr.includes('+') || trendStr.includes('上升') || trendStr.includes('▲')) {
                    return <div className="flex items-center text-red-500 dark:text-red-400 font-bold text-xs"><TrendingUp className="w-3 h-3 mr-0.5" />{cleanTrendStr || trendStr}</div>;
                }
                if (trendStr.includes('↓') || trendStr.includes('-') || trendStr.includes('下降') || trendStr.includes('▼')) {
                    return <div className="flex items-center text-green-500 dark:text-green-400 font-bold text-xs"><TrendingDown className="w-3 h-3 mr-0.5" />{cleanTrendStr || trendStr}</div>;
                }

                if (trendStr.trim() !== "") {
                    return <div className="flex items-center text-gray-400 text-xs">{trendStr}</div>;
                }
                return null;
            };

            return (
                <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-300 animate-content group`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full font-bold ${displayRank.length > 2 ? 'text-sm' : 'text-lg'} ${rankColor} bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700`}>
                            {displayRank}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">{data.成员}</h3>
                                {data.排名升降 && (
                                    <div className="scale-90 origin-left">
                                        {getRankTrend(data.排名升降)}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 mt-1">
                                {showEdition && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">{t('database.electionEdition', { edition: data.届数 })}</span>
                                )}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getGroupStyle(data.分团)}`}>{t(data.分团)}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTeamStyle(data.队伍)}`}>{t(data.队伍)}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-400 mb-0.5">{t('得票数')}</div>
                        <div className="font-mono font-bold text-pink-500 dark:text-pink-400 text-lg">
                            {data.得票数 ? parseFloat(data.得票数).toFixed(1) : '-'}
                        </div>
                    </div>
                </div>
            );
        };

        const CustomSelect = ({ options, value, onChange }) => {
            const [isOpen, setIsOpen] = useState(false);
            const dropdownRef = useRef(null);

            useEffect(() => {
                const handleClickOutside = (event) => {
                    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                        setIsOpen(false);
                    }
                };
                document.addEventListener('mousedown', handleClickOutside);
                return () => document.removeEventListener('mousedown', handleClickOutside);
            }, []);

            const selectedOption = options.find(opt => opt.value === value) || options[0] || { label: t('加载中...'), value: '' };

            return (
                <div className="relative w-full sm:w-auto min-w-[120px]" ref={dropdownRef}>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className={`w-full px-4 py-3 bg-white hover:bg-white hover:shadow-md rounded-full flex items-center justify-between text-sm text-gray-800 font-medium transition-all duration-200 border border-gray-200 focus:border-pink-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700 dark:focus:border-pink-500 ${isOpen ? 'bg-white shadow-md ring-2 ring-pink-100 border-pink-200 dark:ring-pink-900 dark:border-pink-500/40' : ''}`}
                    >
                        <span className="flex items-center truncate text-gray-800 dark:text-gray-200">
                            {selectedOption.label}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform duration-200 dark:text-gray-400 ${isOpen ? 'rotate-180 text-pink-500 dark:text-pink-400' : ''}`} />
                    </button>

                    {isOpen && (
                        <div className="absolute top-full left-0 mt-2 w-full min-w-[160px] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 p-1 animate-fadeIn dark:bg-gray-800 dark:border-gray-700">
                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                {options.map((option) => {
                                    const isSelected = option.value === value;
                                    return (
                                        <div
                                            key={option.value}
                                            onClick={() => {
                                                onChange(option.value);
                                                setIsOpen(false);
                                            }}
                                            className={`px-4 py-2.5 text-sm rounded-xl cursor-pointer flex items-center justify-between transition-colors mb-0.5 ${isSelected
                                                ? 'bg-pink-100 text-pink-700 font-semibold dark:bg-pink-900/30 dark:text-pink-300'
                                                : 'text-gray-800 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700'
                                                }`}
                                        >
                                            <span className="truncate">{option.label}</span>
                                            {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        const DatabaseSectionPlaceholder = ({ icon: Icon, title, detail }) => (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-16 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
            </div>
        );

        const HistoricalProfilePhotos = ({ member, onPreview }) => {
            const [state, setState] = useState({ loading: true, photos: [], error: false });
            const [attempt, setAttempt] = useState(0);
            useEffect(() => {
                let active = true;
                setState({ loading: true, photos: [], error: false });
                const applyIndex = index => {
                    if (active) setState({ loading: false, photos: selectProfilePhotoHistory(index, member), error: false });
                };
                const unsubscribe = window.YayaDataSync?.subscribe('https://data.gnz.hk/profile-photos/index.json', applyIndex);
                loadProfilePhotoHistory().then(applyIndex).catch(() => {
                    if (active) setState({ loading: false, photos: [], error: true });
                });
                return () => { active = false; unsubscribe?.(); };
            }, [member.ownerName, member.groupName, attempt]);
            return (
                <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center dark:text-gray-500"><UserSquare2 className="w-3.5 h-3.5 mr-1.5" />{t('历史公式照')}</h4>
                    {state.loading ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('正在加载历史公式照…')}</p>
                        : state.error ? <div className="text-sm text-gray-500 dark:text-gray-400">{t('历史公式照暂时无法加载')} <button type="button" onClick={() => setAttempt(value => value + 1)} className="font-bold text-purple-600 dark:text-purple-400">{t('重试')}</button></div>
                        : state.photos.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('暂无历史公式照')}</p>
                        : <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {state.photos.map(photo => (
                                <button type="button" key={`${photo.date}/${photo.path}`} onClick={() => onPreview(photo.date, photo.url)}
                                    className="group block overflow-hidden rounded-xl border border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                                    title={`${photo.date} ${photo.group} ${photo.team || ''}`} aria-label={`${member.ownerName} ${photo.date}`}>
                                    <div className="aspect-[3/4] overflow-hidden bg-gray-100 dark:bg-gray-900">
                                        <img src={photo.url} alt={`${member.ownerName} ${photo.date}`} loading="lazy" decoding="async" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                                    </div>
                                    <div className="px-2 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{photo.date}</div>
                                </button>
                            ))}
                        </div>}
                </div>
            );
        };

        const MemberDetailModal = ({ member, onClose }) => {
            if (!member) return null;
            const [previewPhoto, setPreviewPhoto] = useState(null);
            const isActive = checkIsActive(member);
            const InfoItem = ({ icon: Icon, label, value, colorClass = "text-gray-800", isCopyable = false, href = '' }) => {
                const [copied, setCopied] = useState(false);
                const hasValue = value !== undefined && value !== null && value !== '';
                const displayValue = typeof value === 'boolean' ? t(value ? '是' : '否') : (hasValue ? String(value) : '-');
                const handleAction = (e) => {
                    if (!hasValue) return;
                    if (href) {
                        window.open(href, '_blank', 'noopener,noreferrer');
                        return;
                    }
                    if (!isCopyable) return;
                    e.stopPropagation();
                    const textArea = document.createElement("textarea");
                    textArea.value = displayValue;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (err) { window.YayaRendererUtils.reportIgnoredError(err, 'src/renderer/database/app.jsx'); }
                    document.body.removeChild(textArea);
                };
                return (
                    <div onClick={handleAction} className={`db-member-info-item bg-gray-50 p-3 rounded-lg border border-gray-100 transition-all relative overflow-hidden dark:bg-gray-800 dark:border-gray-700 ${isCopyable || href ? 'hover:bg-white hover:shadow-md cursor-pointer group dark:hover:bg-gray-750' : 'hover:bg-white hover:shadow-sm dark:hover:bg-gray-750'}`}>
                        <span className="text-xs text-gray-400 block mb-1.5 flex items-center justify-between dark:text-gray-500">
                            <span className="flex items-center"><Icon className="w-3 h-3 mr-1" />{label}</span>
                            {(isCopyable || href) && <span className={`text-[10px] transition-opacity duration-300 ${copied ? 'text-green-500 opacity-100' : 'opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500'}`}>{t(href ? '点击跳转' : (copied ? '已复制' : '点击复制'))}</span>}
                        </span>
                        {href ? (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-sm font-medium break-words text-blue-600 dark:text-blue-400"
                            >
                                {displayValue}
                            </a>
                        ) : (
                            <span className={`text-sm font-medium ${colorClass} break-words dark:text-gray-200`}>{displayValue}</span>
                        )}
                        {copied && <div className="absolute inset-0 border-2 border-green-400 rounded-lg pointer-events-none animate-pulse"></div>}
                    </div>
                );
            };
            const formatTimestamp = (value) => {
                if (value === undefined || value === null || value === '') return null;
                const timestamp = Number(value);
                if (!Number.isFinite(timestamp)) return String(value);
                const date = new Date(timestamp);
                if (Number.isNaN(date.getTime())) return String(value);
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const hh = String(date.getHours()).padStart(2, '0');
                const mi = String(date.getMinutes()).padStart(2, '0');
                return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
            };
            const normalizedWeiboUid = String(member.wbUid || '').trim();
            const weiboProfileUrl = /^\d+$/.test(normalizedWeiboUid)
                ? `https://weibo.com/u/${normalizedWeiboUid}`
                : '';
            const photoEntries = [
                [t('头像'), member.avatar],
                [t('全身照 1'), member.fullPhoto1],
                [t('全身照 2'), member.fullPhoto2],
                [t('全身照 3'), member.fullPhoto3],
                [t('全身照 4'), member.fullPhoto4]
            ].filter(([, url]) => !!url);
            const openPhotoPreview = (label, url) => {
                if (typeof window.openImageModal === 'function') {
                    window.openImageModal(url);
                    return;
                }
                setPreviewPhoto({ label, url });
            };
            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40 backdrop-blur-sm animate-backdrop" onClick={onClose}>
                    <div className="db-member-modal bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar transform transition-all scale-100 dark:bg-gray-900 dark:border dark:border-gray-800 animate-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="db-member-modal-header flex justify-between items-center p-5 border-b border-gray-100 bg-white sticky top-0 z-10 dark:bg-gray-900 dark:border-gray-800">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t('成员档案')}</h3>
                            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500 dark:text-gray-400 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="db-member-modal-body p-6 space-y-8">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3 dark:text-white">
                                        {member.ownerName}
                                        {isActive ? <span className="bg-green-100 text-green-600 text-xs px-2.5 py-0.5 rounded-full border border-green-200 font-bold dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">{t('在团')}</span> : <span className="bg-gray-100 text-gray-500 text-xs px-2.5 py-0.5 rounded-full border border-gray-200 font-bold dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">{t(member.gtime ? '已毕业' : '不在团')}</span>}
                                    </h2>
                                    <div className="flex items-center space-x-3">
                                        <span className="db-member-pinyin text-sm text-gray-500 tracking-wide font-mono bg-gray-50 px-2 py-0.5 rounded dark:bg-gray-800 dark:text-gray-400">{member.pinyin || '-'}</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <span className={`px-3 py-1 rounded-lg text-sm font-bold border ${getGroupStyle(member.groupName)}`}>{member.groupName}</span>
                                    <div className={`px-3 py-1 rounded-lg text-sm font-bold border ${getTeamStyle(member.team)}`}>{member.team}</div>
                                </div>
                            </div>

                            <div className="animate-content" style={{ animationDelay: '0.05s' }}>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center dark:text-gray-500"><Users className="w-3.5 h-3.5 mr-1.5" />{t('个人资料')}</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                    {member.nickname && <InfoItem icon={UserCircle} label={t('昵称')} value={member.nickname} />}
                                    <InfoItem icon={Cake} label={t('生日')} value={formatDate(member.birthday)} colorClass="text-pink-600 dark:text-pink-400" />
                                    <InfoItem icon={MapPin} label={t('出生地')} value={member.birthplace} />
                                    {member.constellation && <InfoItem icon={Star} label={t('星座')} value={member.constellation} />}
                                    {member.height && <InfoItem icon={Ruler} label={t('身高')} value={`${member.height} cm`} />}
                                    {member.bloodType && <InfoItem icon={Droplet} label={t('血型')} value={`${member.bloodType}型`} />}
                                </div>
                                {(member.hobbies || member.specialty) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                        {member.hobbies && <InfoItem icon={Heart} label={t('爱好')} value={member.hobbies} />}
                                        {member.specialty && <InfoItem icon={Sparkles} label={t('特长')} value={member.specialty} />}
                                    </div>
                                )}
                            </div>

                            <div className="animate-content" style={{ animationDelay: '0.1s' }}>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center dark:text-gray-500"><Calendar className="w-3.5 h-3.5 mr-1.5" />{t('生涯历程')}</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <InfoItem icon={Layers} label={t('期数')} value={member.periodName} colorClass="text-blue-600 dark:text-blue-400" />
                                    {member.rank && <InfoItem icon={Trophy} label={t('最高排名')} value={member.rank} colorClass="text-amber-600 dark:text-amber-400" />}
                                    {member.jtime && <InfoItem icon={CalendarDays} label={t('加入时间')} value={formatDate(member.jtime)} colorClass="text-emerald-600 dark:text-emerald-400" />}
                                    {member.ptime && <InfoItem icon={ArrowUpCircle} label={t('升格时间')} value={formatDate(member.ptime)} colorClass="text-purple-600 dark:text-purple-400" />}
                                    {member.gtime && <InfoItem icon={GraduationCap} label={t('毕业时间')} value={formatDate(member.gtime)} colorClass="text-indigo-600 dark:text-indigo-400" />}
                                    {member.qtime && <InfoItem icon={LogOut} label={t('退团时间')} value={formatDate(member.qtime)} colorClass="text-red-500 dark:text-red-400" />}
                                </div>
                            </div>

                            <div className="animate-content" style={{ animationDelay: '0.15s' }}>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center dark:text-gray-500"><Hash className="w-3.5 h-3.5 mr-1.5" />{t('具体参数')}</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <InfoItem icon={Hash} label={t('口袋 ID')} value={member.id} colorClass="font-mono text-gray-600 dark:text-gray-300" isCopyable={true} />
                                    <InfoItem icon={Hash} label={t('服务器 ID')} value={member.serverId} colorClass="font-mono text-gray-600 dark:text-gray-300" isCopyable={true} />
                                    <InfoItem icon={Hash} label={t('大房间 ID')} value={member.channelId} colorClass="font-mono text-gray-600 dark:text-gray-300" isCopyable={true} />
                                    {member.yklzId && <InfoItem icon={Hash} label={t('小房间 ID')} value={member.yklzId} colorClass="font-mono text-gray-600 dark:text-gray-300" isCopyable={true} />}
                                    {member.wbName && <InfoItem icon={UserCircle} label={t('微博')} value={member.wbName} href={weiboProfileUrl} />}
                                    {member.wbUid && <InfoItem icon={Hash} label={t('微博 UID')} value={member.wbUid} colorClass="font-mono text-gray-600 dark:text-gray-300" isCopyable={true} />}
                                </div>
                            </div>
                            {photoEntries.length > 0 && (
                                <div className="animate-content" style={{ animationDelay: '0.18s' }}>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center dark:text-gray-500"><UserSquare2 className="w-3.5 h-3.5 mr-1.5" />{t('公式照')}</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        {photoEntries.map(([label, url]) => (
                                            <button
                                                type="button"
                                                key={label}
                                                onClick={() => openPhotoPreview(label, url)}
                                                className="group block overflow-hidden rounded-xl border border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                                                title={url}
                                            >
                                                <div className="aspect-[3/4] overflow-hidden bg-gray-100 dark:bg-gray-900">
                                                    <img src={url} alt={label} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                </div>
                                                <div className="flex items-center justify-center px-2 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400">
                                                    <span>{label}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <HistoricalProfilePhotos member={member} onPreview={openPhotoPreview} />
                            {member.note && (
                                <div className="animate-content" style={{ animationDelay: '0.2s' }}>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center dark:text-gray-500"><FileText className="w-3.5 h-3.5 mr-1.5" />{t('备注')}</h4>
                                    <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-sm text-yellow-800 leading-relaxed dark:bg-yellow-900/20 dark:border-yellow-900/30 dark:text-yellow-200">{member.note}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    {previewPhoto && (
                        <div
                            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-backdrop"
                            onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPhoto(null);
                            }}
                        >
                            <div className="relative max-h-[86vh] max-w-[88vw]" onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    onClick={() => setPreviewPhoto(null)}
                                    className="absolute -right-3 -top-3 rounded-full bg-white/90 p-2 text-gray-700 shadow-lg transition-colors hover:bg-white dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <img
                                    src={previewPhoto.url}
                                    alt={previewPhoto.label}
                                    className="max-h-[86vh] max-w-[88vw] rounded-2xl object-contain shadow-2xl"
                                />
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        const MemberAvatar = ({ member }) => {
            const avatarUrl = String(member.avatar || '').trim();
            const [imageFailed, setImageFailed] = useState(false);

            useEffect(() => {
                setImageFailed(false);
            }, [avatarUrl]);

            return (
                <span className="db-member-card-avatar" aria-hidden="true">
                    {avatarUrl && !imageFailed ? (
                        <img
                            src={avatarUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            draggable="false"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <UserCircle className="db-member-card-avatar-placeholder" />
                    )}
                </span>
            );
        };

        const MemberCard = ({ member, onClick }) => {
            const isActive = checkIsActive(member);
            return (
                <div
                    className={`db-member-card bg-white rounded-lg shadow-sm hover:shadow-md border p-3 cursor-pointer transition-all duration-200 animate-content group flex items-center justify-between hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-750 ${isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 bg-gray-50 opacity-80 dark:bg-gray-800/50 dark:border-gray-800'}`}
                    onClick={() => onClick(member)}
                >
                    <div className="flex items-center min-w-0 flex-1 gap-3">
                        <MemberAvatar member={member} />
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="mb-1 min-w-0">
                                <span className={`block font-bold text-base leading-tight whitespace-nowrap truncate ${isActive ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-500'}`}>{member.ownerName}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getTeamStyle(member.team)}`}>{member.team}</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        function App() {
            const currentLocale = useYayaLocale();
            const persistedUiState = useMemo(() => getInitialDatabaseUiState(), []);
            const [members, setMembers] = useState(DEMO_DATA);
            const [zxData, setZxData] = useState([]);
            const [stagesData, setStagesData] = useState([]);
            const [fxzpData, setFxzpData] = useState([]);
            const [searchTerm, setSearchTerm] = useState(() => persistedUiState.searchTerm || '');
            const [selectedGroup, setSelectedGroup] = useState(() => persistedUiState.selectedGroup || 'ALL');

            const [sortBy, setSortBy] = useState(() => persistedUiState.sortBy || 'team');
            const [statusFilter, setStatusFilter] = useState(() => persistedUiState.statusFilter || 'ACTIVE');

            const [isDataLoaded, setIsDataLoaded] = useState(false);
            const [selectedMember, setSelectedMember] = useState(null);

            const [activeTab, setActiveTab] = useState(() => persistedUiState.activeTab || 'members');
            const [selectedEdition, setSelectedEdition] = useState(() => persistedUiState.selectedEdition || '12');
            const [electionSearch, setElectionSearch] = useState(() => persistedUiState.electionSearch || '');

            const [stageSearch, setStageSearch] = useState(() => persistedUiState.stageSearch || '');
            const [stageGroupFilter, setStageGroupFilter] = useState(() => persistedUiState.stageGroupFilter || 'ALL');
            const [stageTeamFilter, setStageTeamFilter] = useState(() => persistedUiState.stageTeamFilter || 'ALL');

            const [albumSearch, setAlbumSearch] = useState(() => persistedUiState.albumSearch || '');
            const [albumGroupFilter, setAlbumGroupFilter] = useState(() => persistedUiState.albumGroupFilter || 'ALL');
            const [albumTypeFilter, setAlbumTypeFilter] = useState(() => persistedUiState.albumTypeFilter || 'ALL');
            const [fxzpError, setFxzpError] = useState(null);
            const [currentLyricSong, setCurrentLyricSong] = useState(null);
            const [datasetStatus, setDatasetStatus] = useState({
                members: { status: 'loading', count: 0, error: '' },
                elections: { status: 'loading', count: 0, error: '' },
                stages: { status: 'loading', count: 0, error: '' },
                albums: { status: 'loading', count: 0, error: '' }
            });

            const [isDarkMode, setIsDarkMode] = useState(() => {
                if (typeof window !== 'undefined') {
                    const docTheme = window.document.documentElement.getAttribute('data-theme');
                    if (docTheme) {
                        return docTheme === 'dark';
                    }
                    const settingsApi = getDesktopSettingsApi();
                    const storedTheme = settingsApi && typeof settingsApi.getSettingValueSync === 'function'
                        ? settingsApi.getSettingValueSync('theme', '')
                        : localStorage.getItem('theme');
                    return storedTheme === 'dark' ||
                        (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                }
                return false;
            });

            useEffect(() => {
                const root = document.getElementById('database-root') || window.document.documentElement;
                if (isDarkMode) {
                    root.classList.add('dark');
                } else {
                    root.classList.remove('dark');
                }
            }, [isDarkMode]);

            useEffect(() => {
                const appRoot = window.document.documentElement;
                const syncTheme = () => {
                    setIsDarkMode(appRoot.getAttribute('data-theme') === 'dark');
                };
                syncTheme();
                const observer = new MutationObserver(syncTheme);
                observer.observe(appRoot, { attributes: true, attributeFilter: ['data-theme'] });
                return () => observer.disconnect();
            }, []);

            useEffect(() => {
                const nextState = {
                    activeTab,
                    searchTerm,
                    selectedGroup,
                    sortBy,
                    statusFilter,
                    selectedEdition,
                    electionSearch,
                    stageSearch,
                    stageGroupFilter,
                    stageTeamFilter,
                    albumSearch,
                    albumGroupFilter,
                    albumTypeFilter
                };
                const cacheApi = getDesktopCacheApi();
                if (cacheApi && typeof cacheApi.setCacheValueSync === 'function') {
                    cacheApi.setCacheValueSync(DATABASE_UI_STATE_KEY, nextState);
                    localStorage.removeItem(DATABASE_UI_STATE_KEY);
                } else {
                    localStorage.setItem(DATABASE_UI_STATE_KEY, JSON.stringify(nextState));
                }
            }, [
                activeTab,
                searchTerm,
                selectedGroup,
                sortBy,
                statusFilter,
                selectedEdition,
                electionSearch,
                stageSearch,
                stageGroupFilter,
                stageTeamFilter,
                albumSearch,
                albumGroupFilter,
                albumTypeFilter
            ]);

            useEffect(() => {
                let cancelled = false;

                const setStatus = (key, patch) => {
                    if (cancelled) return;
                    setDatasetStatus((prev) => ({
                        ...prev,
                        [key]: {
                            ...prev[key],
                            ...patch
                        }
                    }));
                };

                const fetchJson = async (url) => {
                    if (window.YayaDataSync) return window.YayaDataSync.read(url, {
                        validate: data => url === DATA_URLS.members
                            ? Array.isArray(data) ? data.length > 0 : Array.isArray(data?.roomId) && data.roomId.length > 0
                            : Array.isArray(data)
                    });
                    const res = await fetch(url);
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }
                    return res.json();
                };

                const loadMembers = async () => {
                    try {
                        setStatus('members', { status: 'loading', error: '' });
                        const data = await fetchJson(DATA_URLS.members);
                        const membersData = Array.isArray(data) ? data : (data.roomId || []);
                        if (!Array.isArray(membersData)) {
                            throw new Error(t('成员数据格式不正确'));
                        }
                        if (cancelled) return;
                        setMembers(membersData);
                        setIsDataLoaded(true);
                        setStatus('members', { status: 'success', count: membersData.length, error: '' });
                    } catch (err) {
                        console.error("Failed to fetch members data:", err);
                        if (cancelled) return;
                        setIsDataLoaded(true);
                        setStatus('members', { status: 'error', error: err.message || t('加载失败'), count: 0 });
                    }
                };

                const loadElections = async () => {
                    try {
                        setStatus('elections', { status: 'loading', error: '' });
                        const data = await fetchJson(DATA_URLS.zx);
                        if (!Array.isArray(data)) {
                            throw new Error(t('总选数据格式不正确'));
                        }
                        if (cancelled) return;
                        setZxData(data);
                        const uniqueEditions = [...new Set(data.map(item => item.届数).filter(Boolean))];
                        if (!persistedUiState.selectedEdition && uniqueEditions.length > 0) {
                            uniqueEditions.sort((a, b) => parseInt(b) - parseInt(a));
                            setSelectedEdition(uniqueEditions[0]);
                        }
                        setStatus('elections', { status: 'success', count: data.length, error: '' });
                    } catch (err) {
                        console.error("Failed to fetch election data:", err);
                        if (cancelled) return;
                        setStatus('elections', { status: 'error', error: err.message || t('加载失败'), count: 0 });
                    }
                };

                const loadStages = async () => {
                    try {
                        setStatus('stages', { status: 'loading', error: '' });
                        const data = await fetchJson(DATA_URLS.stages);
                        if (!Array.isArray(data)) {
                            throw new Error(t('公演数据格式不正确'));
                        }
                        if (cancelled) return;
                        setStagesData(data);
                        setStatus('stages', { status: 'success', count: data.length, error: '' });
                    } catch (err) {
                        console.error("Failed to fetch stages data:", err);
                        if (cancelled) return;
                        setStatus('stages', { status: 'error', error: err.message || t('加载失败'), count: 0 });
                    }
                };

                const loadAlbums = async () => {
                    try {
                        setStatus('albums', { status: 'loading', error: '' });
                        const data = await fetchJson(DATA_URLS.fxzp);
                        if (!Array.isArray(data)) {
                            throw new Error(t('发行作品数据格式不正确'));
                        }
                        if (cancelled) return;
                        setFxzpData(data);
                        setFxzpError(null);
                        setStatus('albums', { status: 'success', count: data.length, error: '' });
                    } catch (err) {
                        console.error("Failed to fetch albums data:", err);
                        if (cancelled) return;
                        setFxzpError(err.message);
                        setStatus('albums', { status: 'error', error: err.message || t('加载失败'), count: 0 });
                    }
                };

                const subscriptions = [];
                if (window.YayaDataSync) {
                    const updateStatus = (key, data) => setStatus(key, { status: 'success', count: data.length, error: '' });
                    subscriptions.push(window.YayaDataSync.subscribe(DATA_URLS.members, data => {
                        if (cancelled) return;
                        const next = Array.isArray(data) ? data : data.roomId;
                        setMembers(next);
                        setIsDataLoaded(true);
                        updateStatus('members', next);
                        setSelectedMember(current => current ? next.find(member => current.id != null
                            ? String(member.id) === String(current.id)
                            : member.ownerName === current.ownerName && member.groupName === current.groupName) || current : current);
                    }));
                    for (const [url, key, setter] of [[DATA_URLS.zx, 'elections', setZxData], [DATA_URLS.stages, 'stages', setStagesData], [DATA_URLS.fxzp, 'albums', setFxzpData]]) {
                        subscriptions.push(window.YayaDataSync.subscribe(url, data => {
                            if (cancelled) return;
                            setter(data);
                            updateStatus(key, data);
                            if (key === 'albums') setFxzpError(null);
                        }));
                    }
                }
                loadMembers();
                loadElections();
                loadStages();
                loadAlbums();

                return () => {
                    cancelled = true;
                    subscriptions.forEach(unsubscribe => unsubscribe());
                };
            }, [persistedUiState.selectedEdition]);

            const parseStageDate = (dateStr) => {
                if (!dateStr) return 0;
                const match = dateStr.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
                if (match) {
                    const year = parseInt(match[1]);
                    const month = parseInt(match[2]) - 1;
                    const day = parseInt(match[3]);
                    return new Date(year, month, day).getTime();
                }
                return 0;
            };

            const parseAlbumDate = (dateStr) => {
                if (!dateStr) return 0;
                const match = dateStr.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
                if (match) {
                    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])).getTime();
                }
                return 0;
            };

            const groupOptions = useMemo(() => {
                const uniqueGroups = [...new Set(members.map(m => m.groupName).filter(Boolean))];
                const sortedGroups = uniqueGroups.sort((a, b) => {
                    const indexA = MEMBER_GROUP_SORT_ORDER.indexOf(a);
                    const indexB = MEMBER_GROUP_SORT_ORDER.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.localeCompare(b);
                });
                return [{ value: 'ALL', label: t('所有分团') }, ...sortedGroups.map(g => ({ value: g, label: t(g) }))];
            }, [members, currentLocale]);

            const editionOptions = useMemo(() => {
                const uniqueEditions = [...new Set(zxData.map(item => item.届数))];
                uniqueEditions.sort((a, b) => parseInt(b) - parseInt(a));
                return uniqueEditions.map(e => ({ value: e, label: t('database.electionEdition', { edition: e }) }));
            }, [zxData, currentLocale]);

            const stageGroupOptions = useMemo(() => {
                const uniqueGroups = [...new Set(stagesData.map(s => s.分团).filter(Boolean))];
                return [{ value: 'ALL', label: t('所有分团') }, ...uniqueGroups.map(g => ({ value: g, label: t(g) }))];
            }, [stagesData, currentLocale]);

            const stageTeamOptions = useMemo(() => {
                let filteredStages = stagesData;
                if (stageGroupFilter !== 'ALL') {
                    filteredStages = stagesData.filter(s => s.分团 === stageGroupFilter);
                }
                const uniqueTeams = [...new Set(filteredStages.map(s => s.队伍).filter(Boolean))];
                return [{ value: 'ALL', label: t('所有队伍') }, ...uniqueTeams.map(team => ({ value: team, label: t(team) }))];
            }, [stagesData, stageGroupFilter, currentLocale]);

            const albumGroupOptions = useMemo(() => {
                const uniqueGroups = [...new Set(fxzpData.map(a => a.分团).filter(Boolean))];
                const customOrder = ['SNH48', 'GNZ48', 'BEJ48', 'CKG48', 'SHY48', '7SENSES', 'DEMOON', 'BLUEV'];

                const sortedGroups = uniqueGroups.sort((a, b) => {
                    const indexA = customOrder.indexOf(a);
                    const indexB = customOrder.indexOf(b);

                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.localeCompare(b);
                });

                return [{ value: 'ALL', label: t('所有分团') }, ...sortedGroups.map(g => ({ value: g, label: t(g) }))];
            }, [fxzpData, currentLocale]);

            const albumTypeOptions = useMemo(() => {
                const uniqueTypes = [...new Set(fxzpData.map(a => a.类型).filter(Boolean))];
                return [{ value: 'ALL', label: t('所有类型') }, ...uniqueTypes.sort().map(type => ({ value: type, label: t(type) }))];
            }, [fxzpData, currentLocale]);


            const categorizedMembers = useMemo(() => {
                const filtered = members.filter(member => {
                    const normalizedSearch = searchTerm.toLowerCase().replace(/\s+/g, '');
                    const memberPinyin = member.pinyin || '';
                    const memberPinyinLower = memberPinyin.toLowerCase();
                    const memberPinyinJoined = memberPinyinLower.replace(/[\s_-]+/g, '');
                    const memberInitials = getPinyinInitials(memberPinyin);
                    const matchesSearch = (
                        member.ownerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        memberPinyinLower.includes(searchTerm.toLowerCase()) ||
                        memberPinyinJoined.includes(normalizedSearch) ||
                        memberInitials.includes(normalizedSearch) ||
                        member.periodName?.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                    const matchesGroup = selectedGroup === 'ALL' || member.groupName === selectedGroup;
                    const isActive = checkIsActive(member);
                    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' && isActive);
                    return matchesSearch && matchesGroup && matchesStatus;
                });

                const grouping = {};
                filtered.forEach(member => {
                    const gName = member.groupName || '其他';
                    const subKey = sortBy === 'period' ? (member.periodName || '未知期数') : (member.team || '未知队伍');
                    if (!grouping[gName]) grouping[gName] = {};
                    if (!grouping[gName][subKey]) grouping[gName][subKey] = [];
                    grouping[gName][subKey].push(member);
                });

                const sortedGroups = Object.keys(grouping).sort((a, b) => {
                    const indexA = MEMBER_GROUP_SORT_ORDER.indexOf(a);
                    const indexB = MEMBER_GROUP_SORT_ORDER.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.localeCompare(b);
                });

                return sortedGroups.map(group => {
                    const subKeys = Object.keys(grouping[group]).sort((a, b) => {
                        if (sortBy === 'period') {
                            return comparePeriodName(a, b);
                        } else {
                            const indexA = TEAM_SORT_ORDER.indexOf(a);
                            const indexB = TEAM_SORT_ORDER.indexOf(b);
                            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                            if (indexA !== -1) return -1;
                            if (indexB !== -1) return 1;
                            return a.localeCompare(b);
                        }
                    });
                    return {
                        groupName: group,
                        subGroups: subKeys.map(key => ({ name: key, members: grouping[group][key] }))
                    };
                });
            }, [members, searchTerm, selectedGroup, sortBy, statusFilter]);

            const { regularElectionData, newcomerElectionData, electionName, isSearchResult } = useMemo(() => {
                const regular = [];
                const newcomer = [];
                let name = '';
                let isSearch = false;

                let filtered = [];
                if (electionSearch.trim()) {
                    isSearch = true;
                    filtered = zxData.filter(item => matchesTextSearch([
                        item.成员,
                        item.队伍,
                        item.分团,
                        item.名称
                    ], electionSearch));
                    name = t('database.searchResult', { query: electionSearch });
                } else {
                    filtered = zxData.filter(item => {
                        const matchEdition = item.届数 === selectedEdition;
                        if (matchEdition && !name) name = item.名称;
                        return matchEdition;
                    });
                }

                filtered.forEach(item => {
                    if (item.排名 && item.排名.toString().includes("新人")) {
                        newcomer.push(item);
                    } else {
                        regular.push(item);
                    }
                });

                const getRankNum = (rankStr) => {
                    if (!rankStr) return 999;
                    const cleanStr = rankStr.toString().replace("新人", "");
                    return parseInt(cleanStr) || 999;
                };

                if (isSearch) {
                    const sortFn = (a, b) => {
                        const editionDiff = parseInt(b.届数) - parseInt(a.届数);
                        if (editionDiff !== 0) return editionDiff;
                        return getRankNum(a.排名) - getRankNum(b.排名);
                    };
                    regular.sort(sortFn);
                    newcomer.sort(sortFn);
                } else {
                    regular.sort((a, b) => getRankNum(a.排名) - getRankNum(b.排名));
                    newcomer.sort((a, b) => getRankNum(a.排名) - getRankNum(b.排名));
                }

                return { regularElectionData: regular, newcomerElectionData: newcomer, electionName: name, isSearchResult: isSearch };
            }, [zxData, selectedEdition, electionSearch, currentLocale]);

            const filteredStages = useMemo(() => {
                const filtered = stagesData.filter(stage => {
                    const matchesSearch = matchesTextSearch([
                        stage.名称,
                        stage.队伍,
                        stage.分团
                    ], stageSearch);
                    const matchesGroup = stageGroupFilter === 'ALL' || stage.分团 === stageGroupFilter;
                    const matchesTeam = stageTeamFilter === 'ALL' || stage.队伍 === stageTeamFilter;
                    return matchesSearch && matchesGroup && matchesTeam;
                });

                return filtered.sort((a, b) => {
                    return parseStageDate(a.日期) - parseStageDate(b.日期);
                });
            }, [stagesData, stageSearch, stageGroupFilter, stageTeamFilter]);

            const processedAlbums = useMemo(() => {
                const filtered = fxzpData.filter(item => {
                    const matchesSearch = matchesTextSearch([
                        item.专辑,
                        item.歌曲名,
                        item.分团,
                        item.类型
                    ], albumSearch);
                    const matchesGroup = albumGroupFilter === 'ALL' || item.分团 === albumGroupFilter;
                    const matchesType = albumTypeFilter === 'ALL' || item.类型 === albumTypeFilter;
                    return matchesSearch && matchesGroup && matchesType;
                });

                const albumGroups = {};
                filtered.forEach(item => {
                    const key = `${item.分团}-${item.类型}-${item.专辑序号}-${item.专辑}`;
                    if (!albumGroups[key]) {
                        albumGroups[key] = {
                            分团: item.分团,
                            类型: item.类型,
                            专辑序号: item.专辑序号,
                            专辑名: item.专辑,
                            发行日期: item.发行日期,
                            songs: [],
                            uniqueDates: new Set([item.发行日期])
                        };
                    } else {
                        albumGroups[key].uniqueDates.add(item.发行日期);
                    }
                    albumGroups[key].songs.push(item);
                });

                const result = Object.values(albumGroups).map(group => {
                    const hasMultipleDates = group.uniqueDates.size > 1;
                    return {
                        ...group,
                        hasMultipleDates,
                        songs: hasMultipleDates
                            ? group.songs.sort((a, b) => parseAlbumDate(b.发行日期) - parseAlbumDate(a.发行日期))
                            : group.songs
                    };
                });

                return result.sort((a, b) => {
                    return parseAlbumDate(a.发行日期) - parseAlbumDate(b.发行日期);
                });
            }, [fxzpData, albumSearch, albumGroupFilter, albumTypeFilter]);

            return (
                <div className="db-app min-h-screen bg-gray-50 font-sans text-gray-900 transition-colors duration-300 dark:bg-gray-950 dark:text-gray-100 flex flex-col">
                    <header className="db-header transition-colors duration-300">
                        <div className="db-page-shell mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="db-tabs-shell">
                            <div className="grid w-full grid-cols-4 gap-3 -mb-px">
                                <button
                                    onClick={() => setActiveTab('members')}
                                    className={`w-full pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'members'
                                        ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <UserSquare2 className="w-4 h-4" />
                                        {t('成员图鉴')}
                                    </div>
                                </button>
                                <button
                                    onClick={() => setActiveTab('elections')}
                                    className={`w-full pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'elections'
                                        ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Trophy className="w-4 h-4" />
                                        {t('总选记录')}
                                    </div>
                                </button>
                                <button
                                    onClick={() => setActiveTab('stages')}
                                    className={`w-full pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'stages'
                                        ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Music className="w-4 h-4" />
                                        {t('公演数据')}
                                    </div>
                                </button>
                                <button
                                    onClick={() => setActiveTab('albums')}
                                    className={`w-full pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'albums'
                                        ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Disc className="w-4 h-4" />
                                        {t('发行作品')}
                                    </div>
                                </button>
                            </div>
                            </div>
                        </div>
                    </header>

                    <main className="db-page-shell flex-1 mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full">
                        {activeTab === 'members' && (
                            <div className="animate-fadeIn">
                                {datasetStatus.members.status === 'loading' && members.length === 0 && (
                                    <DatabaseSectionPlaceholder
                                        icon={Users}
                                        title={t('成员数据加载中')}
                                        detail={t('成员图鉴、在团状态和队伍信息正在同步。')}
                                    />
                                )}
                                {datasetStatus.members.status === 'error' && members.length === 0 && (
                                    <DatabaseSectionPlaceholder
                                        icon={AlertCircle}
                                        title={t('成员数据加载失败')}
                                        detail={datasetStatus.members.error || t('请稍后重试')}
                                    />
                                )}
                                {datasetStatus.members.status !== 'loading' && datasetStatus.members.status !== 'error' && (
                                    <>
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-4 transition-colors duration-300 dark:bg-gray-900 dark:border-gray-800">
                                            <div className="flex flex-col lg:flex-row gap-4">
                                                <div className="flex-1 relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                        <Search className="h-5 w-5 text-gray-400 group-focus-within:text-pink-500 transition-colors duration-300 dark:text-gray-500" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder={t('搜索成员姓名、拼音、首字母或期数...')}
                                                        className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent text-gray-900 rounded-full focus:bg-white focus:ring-2 focus:ring-pink-300 focus:border-transparent focus:shadow-md outline-none transition-all duration-300 ease-in-out placeholder-gray-500 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:bg-gray-750 dark:focus:ring-pink-500"
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <CustomSelect options={groupOptions} value={selectedGroup} onChange={setSelectedGroup} />
                                                    <div className="bg-gray-100 p-1 rounded-full flex sm:w-auto w-full dark:bg-gray-800">
                                                        <button onClick={() => setSortBy('period')} className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${sortBy === 'period' ? 'bg-white shadow text-pink-600 dark:bg-gray-700 dark:text-pink-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}>{t('按期数')}</button>
                                                        <button onClick={() => setSortBy('team')} className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${sortBy === 'team' ? 'bg-white shadow text-pink-600 dark:bg-gray-700 dark:text-pink-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}>{t('按队伍')}</button>
                                                    </div>
                                                    <div className="bg-gray-100 p-1 rounded-full flex sm:w-auto w-full dark:bg-gray-800">
                                                        <button onClick={() => setStatusFilter('ALL')} className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${statusFilter === 'ALL' ? 'bg-white shadow text-pink-600 dark:bg-gray-700 dark:text-pink-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}>{t('全部')}</button>
                                                        <button onClick={() => setStatusFilter('ACTIVE')} className={`flex-1 sm:flex-none px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${statusFilter === 'ACTIVE' ? 'bg-white shadow text-green-600 dark:bg-gray-700 dark:text-green-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}>{t('只看在团')}</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                {categorizedMembers.length > 0 ? (
                                    <div className="space-y-12">
                                        {categorizedMembers.map((groupData) => (
                                            <div key={groupData.groupName} className="animate-fadeIn">
                                                <div className="flex items-center mb-6 pb-2 border-b border-gray-200 dark:border-gray-800">
                                                    <span className="w-2 h-8 rounded-full mr-3" style={{ backgroundColor: getGroupAccentColor(groupData.groupName) }}></span>
                                                    <h2 className="text-2xl font-bold" style={{ color: getGroupAccentColor(groupData.groupName) }}>{t(groupData.groupName)}</h2>
                                                    <span className="ml-3 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full font-medium dark:bg-gray-800 dark:text-gray-400">
                                                        {t('database.memberCount', { count: groupData.subGroups.reduce((acc, p) => acc + p.members.length, 0) })}
                                                    </span>
                                                </div>
                                                <div className="space-y-8 pl-0 md:pl-5">
                                                    {groupData.subGroups.map((subGroupData) => (
                                                        <div key={subGroupData.name}>
                                                            <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 flex items-center ${sortBy === 'team' ? getTeamStyle(subGroupData.name).split(' ')[0] : 'text-gray-500 dark:text-gray-400'}`}>
                                                                {sortBy === 'period' && <Calendar className="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500" />}
                                                                {t(subGroupData.name)}
                                                            </h3>
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                                                                {subGroupData.members.map(member => (
                                                                    <MemberCard key={member.id || Math.random()} member={member} onClick={setSelectedMember} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-700">
                                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4 dark:text-gray-600" />
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t('未找到成员')}</h3>
                                        <p className="text-gray-500 mt-1 dark:text-gray-400">{t('尝试调整搜索词或筛选条件')}</p>
                                    </div>
                                )}
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'elections' && (
                            <div className="animate-fadeIn">
                                {datasetStatus.elections.status === 'loading' && zxData.length === 0 ? (
                                    <DatabaseSectionPlaceholder
                                        icon={Trophy}
                                        title={t('总选数据加载中')}
                                        detail={t('历届总选和新人榜正在整理。')}
                                    />
                                ) : datasetStatus.elections.status === 'error' && zxData.length === 0 ? (
                                    <DatabaseSectionPlaceholder
                                        icon={AlertCircle}
                                        title={t('总选数据加载失败')}
                                        detail={datasetStatus.elections.error || t('请稍后重试')}
                                    />
                                ) : (
                                    <>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-4 transition-colors duration-300 dark:bg-gray-900 dark:border-gray-800">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <div className="flex-1 relative group">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-pink-500 transition-colors duration-300 dark:text-gray-500" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder={t('搜索成员姓名、拼音或首字母...')}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent text-gray-900 rounded-full focus:bg-white focus:ring-2 focus:ring-pink-300 focus:border-transparent focus:shadow-md outline-none transition-all duration-300 ease-in-out placeholder-gray-500 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:bg-gray-750 dark:focus:ring-pink-500"
                                                value={electionSearch}
                                                onChange={(e) => setElectionSearch(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <CustomSelect
                                                options={editionOptions}
                                                value={selectedEdition}
                                                onChange={setSelectedEdition}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    {regularElectionData.length > 0 && (
                                        <div>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <Trophy className="w-5 h-5 text-yellow-500" />
                                                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap">
                                                        {electionName || t('database.electionResult', { edition: selectedEdition })}
                                                    </h2>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {regularElectionData.map((item, index) => (
                                                    <ElectionCard key={index} data={item} index={index} showEdition={isSearchResult} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {newcomerElectionData.length > 0 && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-4 mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
                                                <Sparkles className="w-5 h-5 text-pink-500" />
                                                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                                                    {t('新人 TOP16')}
                                                </h2>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {newcomerElectionData.map((item, index) => (
                                                    <ElectionCard key={`new-${index}`} data={item} index={index} showEdition={isSearchResult} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {regularElectionData.length === 0 && newcomerElectionData.length === 0 && (
                                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-700">
                                            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4 dark:text-gray-600" />
                                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t('无相关数据')}</h3>
                                            <p className="text-gray-500 mt-1 dark:text-gray-400">{t('请尝试切换届数或搜索其他关键词')}</p>
                                        </div>
                                    )}
                                </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'stages' && (
                            <div className="animate-fadeIn">
                                {datasetStatus.stages.status === 'loading' && stagesData.length === 0 ? (
                                    <DatabaseSectionPlaceholder
                                        icon={Music}
                                        title={t('公演数据加载中')}
                                        detail={t('公演时间线和队伍场次正在同步。')}
                                    />
                                ) : datasetStatus.stages.status === 'error' && stagesData.length === 0 ? (
                                    <DatabaseSectionPlaceholder
                                        icon={AlertCircle}
                                        title={t('公演数据加载失败')}
                                        detail={datasetStatus.stages.error || t('请稍后重试')}
                                    />
                                ) : (
                                    <>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-4 transition-colors duration-300 dark:bg-gray-900 dark:border-gray-800">
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        <div className="flex-1 relative group">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-pink-500 transition-colors duration-300 dark:text-gray-500" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder={t('搜索公演名称、拼音或首字母...')}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent text-gray-900 rounded-full focus:bg-white focus:ring-2 focus:ring-pink-300 focus:border-transparent focus:shadow-md outline-none transition-all duration-300 ease-in-out placeholder-gray-500 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:bg-gray-750 dark:focus:ring-pink-500"
                                                value={stageSearch}
                                                onChange={(e) => setStageSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <CustomSelect
                                                options={stageGroupOptions}
                                                value={stageGroupFilter}
                                                onChange={(val) => {
                                                    setStageGroupFilter(val);
                                                    setStageTeamFilter('ALL');
                                                }}
                                            />
                                            <CustomSelect
                                                options={stageTeamOptions}
                                                value={stageTeamFilter}
                                                onChange={setStageTeamFilter}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="relative">
                                    <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-800 -ml-px"></div>

                                    {filteredStages.length > 0 ? (
                                        filteredStages.map((stage, index) => (
                                            <div key={index} className={`mb-8 flex items-center w-full ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                                                <div className="hidden md:block md:w-1/2"></div>
                                                <div className="absolute left-4 md:left-1/2 w-4 h-4 bg-white dark:bg-gray-900 border-2 border-pink-500 rounded-full z-10 -ml-2 shadow-sm"></div>
                                                <div className={`w-full md:w-1/2 pl-12 md:pl-0 ${index % 2 === 0 ? 'md:pr-12' : 'md:pl-12'}`}>
                                                    <StageCard data={stage} index={index} />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-full text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-700 relative z-20 ml-10 md:ml-0">
                                            <Music className="w-12 h-12 text-gray-300 mx-auto mb-4 dark:text-gray-600" />
                                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t('无相关公演')}</h3>
                                            <p className="text-gray-500 mt-1 dark:text-gray-400">{t('请尝试调整筛选条件')}</p>
                                        </div>
                                    )}
                                </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'albums' && (
                            <div className="animate-fadeIn">
                                {datasetStatus.albums.status === 'loading' && fxzpData.length === 0 ? (
                                    <DatabaseSectionPlaceholder
                                        icon={Disc}
                                        title={t('发行作品加载中')}
                                        detail={t('专辑、单曲和歌词索引正在同步。')}
                                    />
                                ) : (
                                    <>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 space-y-4 transition-colors duration-300 dark:bg-gray-900 dark:border-gray-800">
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        <div className="flex-1 relative group">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-pink-500 transition-colors duration-300 dark:text-gray-500" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder={t('搜索专辑、歌曲、拼音或首字母...')}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent text-gray-900 rounded-full focus:bg-white focus:ring-2 focus:ring-pink-300 focus:border-transparent focus:shadow-md outline-none transition-all duration-300 ease-in-out placeholder-gray-500 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:bg-gray-750 dark:focus:ring-pink-500"
                                                value={albumSearch}
                                                onChange={(e) => setAlbumSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <CustomSelect
                                                options={albumGroupOptions}
                                                value={albumGroupFilter}
                                                onChange={setAlbumGroupFilter}
                                            />
                                            <CustomSelect
                                                options={albumTypeOptions}
                                                value={albumTypeFilter}
                                                onChange={setAlbumTypeFilter}
                                            />
                                        </div>
                                    </div>

                                    {fxzpError && (
                                        <div className="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800">
                                            <AlertCircle className="flex-shrink-0 inline w-4 h-4 mr-3" />
                                            <div>
                                                 <span className="font-medium">{t('数据加载失败!')}</span> {fxzpError}. {t('请检查 JSON 文件格式。')}
                                            </div>
                                        </div>
                                    )}

                                    {albumSearch && (
                                        <div className="text-center mt-2 pb-2">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                 {t('想搜索歌词内容？')}
                                                <a
                                                    href={`${LYRICS_SEARCH_URL}${encodeURIComponent(albumSearch)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-pink-500 hover:underline ml-1 inline-flex items-center"
                                                >
                                                     {t('database.searchLyricsRepo', { query: albumSearch })} <ExternalLink className="w-3 h-3 ml-0.5" />
                                                </a>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {processedAlbums.length > 0 ? (
                                        processedAlbums.map((album, index) => (
                                            <AlbumCard key={index} album={album} onSongClick={setCurrentLyricSong} />
                                        ))
                                    ) : (
                                        <div className="col-span-full text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 dark:bg-gray-800 dark:border-gray-700">
                                            <Disc className="w-12 h-12 text-gray-300 mx-auto mb-4 dark:text-gray-600" />
                                             <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">{t('无相关作品')}</h3>
                                             <p className="text-gray-500 mt-1 dark:text-gray-400">{t('请尝试搜索其他关键词或调整筛选')}</p>

                                            {albumSearch && (
                                                <a
                                                    href={`${LYRICS_SEARCH_URL}${encodeURIComponent(albumSearch)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-4 inline-flex items-center px-4 py-2 bg-pink-50 text-pink-600 rounded-full text-sm font-medium hover:bg-pink-100 transition-colors dark:bg-pink-900/30 dark:text-pink-300 dark:hover:bg-pink-900/50"
                                                >
                                                    <Search className="w-4 h-4 mr-2" />
                                                     {t('去歌词库搜索')}
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                                    </>
                                )}
                            </div>
                        )}

                    </main>

                    <MemberDetailModal
                        member={selectedMember}
                        onClose={() => setSelectedMember(null)}
                    />

                    <LyricModal
                        song={currentLyricSong}
                        onClose={() => setCurrentLyricSong(null)}
                    />
                </div>
            );
        }

        const rootElement = document.getElementById('database-root') || document.getElementById('root');
        if (!rootElement) throw new Error('数据库挂载节点不存在');
        const root = createRoot(rootElement);
        root.render(<App />);
