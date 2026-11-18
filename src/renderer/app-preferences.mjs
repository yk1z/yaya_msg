export function getAppSettingsApi() {
    return window.desktop && window.desktop.appSettings ? window.desktop.appSettings : null;
}

export function readStoredStringSetting(key, fallbackValue = '', legacyKey = key) {
    const settingsApi = getAppSettingsApi();

    if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
        const storedValue = settingsApi.getSettingValueSync(key, undefined);
        if (storedValue !== undefined) {
            return typeof storedValue === 'string' ? storedValue : String(storedValue ?? '');
        }
    }

    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
        if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
            settingsApi.setSettingValueSync(key, legacyValue);
            localStorage.removeItem(legacyKey);
        }
        return String(legacyValue);
    }

    return fallbackValue;
}

export function writeStoredStringSetting(key, value, legacyKey = key) {
    const normalizedValue = String(value ?? '');
    const settingsApi = getAppSettingsApi();
    if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
        settingsApi.setSettingValueSync(key, normalizedValue);
        localStorage.removeItem(legacyKey);
        return normalizedValue;
    }

    localStorage.setItem(legacyKey, normalizedValue);
    return normalizedValue;
}

export function readStoredJsonSetting(key, fallbackValue, legacyKey = key) {
    const settingsApi = getAppSettingsApi();

    if (settingsApi && typeof settingsApi.getSettingValueSync === 'function') {
        const storedValue = settingsApi.getSettingValueSync(key, undefined);
        if (storedValue !== undefined) {
            return storedValue;
        }
    }

    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
        try {
            const parsedValue = JSON.parse(legacyValue);
            if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
                settingsApi.setSettingValueSync(key, parsedValue);
                localStorage.removeItem(legacyKey);
            }
            return parsedValue;
        } catch (error) {
            console.warn(`解析旧设置失败: ${legacyKey}`, error);
        }
    }

    return fallbackValue;
}

export function writeStoredJsonSetting(key, value, legacyKey = key) {
    const settingsApi = getAppSettingsApi();
    if (settingsApi && typeof settingsApi.setSettingValueSync === 'function') {
        settingsApi.setSettingValueSync(key, value);
        localStorage.removeItem(legacyKey);
        return value;
    }

    localStorage.setItem(legacyKey, JSON.stringify(value));
    return value;
}

export function removeStoredSetting(key, legacyKey = key) {
    const settingsApi = getAppSettingsApi();
    if (settingsApi && typeof settingsApi.removeSettingValueSync === 'function') {
        settingsApi.removeSettingValueSync(key);
    }
    localStorage.removeItem(legacyKey);
}


export function getStoredAppToken() {
    const settingsApi = getAppSettingsApi();
    if (settingsApi && typeof settingsApi.getTokenSync === 'function') {
        const storedToken = String(settingsApi.getTokenSync() || '').trim();
        if (storedToken) {
            return storedToken;
        }
    }

    return String(localStorage.getItem('yaya_p48_token') || '').trim();
}

export function migrateLegacyPersistentState(bilibiliConfigKey) {
    const settingsApi = getAppSettingsApi();
    if (!settingsApi) {
        return;
    }

    try {
        const legacyToken = String(localStorage.getItem('yaya_p48_token') || '').trim();
        if (legacyToken && !settingsApi.getTokenSync()) {
            settingsApi.setTokenSync(legacyToken);
        }
        if (legacyToken) {
            localStorage.removeItem('yaya_p48_token');
        }
    } catch (error) {
        console.warn('迁移旧 Token 失败:', error);
    }

    try {
        const legacyBg = String(localStorage.getItem('custom_bg_data') || '');
        const currentBg = typeof settingsApi.getBackgroundUrlSync === 'function'
            ? settingsApi.getBackgroundUrlSync()
            : '';
        if (legacyBg && !currentBg && typeof settingsApi.saveBackgroundFromDataUrlSync === 'function') {
            settingsApi.saveBackgroundFromDataUrlSync(legacyBg);
        }
        if (legacyBg) {
            localStorage.removeItem('custom_bg_data');
        }
    } catch (error) {
        console.warn('迁移旧背景图失败:', error);
    }

    try {
        const stringSettingKeys = [
            'theme',
            'msg_sort_order',
            'yaya_path_danmu',
            'yaya_path_video',
            'yaya_path_live',
            'yaya_path_clip',
            'yaya_path_media',
            'yaya_path_flip',
            'yaya_path_room_radio',
            'yaya_audio_program_play_mode',
            'yaya_music_play_mode',
            'yaya_music_volume',
            'bilibili_live_last_room_id'
        ];

        stringSettingKeys.forEach((key) => {
            const legacyValue = localStorage.getItem(key);
            if (legacyValue === null) return;
            if (typeof settingsApi.getSettingValueSync === 'function'
                && typeof settingsApi.setSettingValueSync === 'function') {
                const currentValue = settingsApi.getSettingValueSync(key, undefined);
                if (currentValue === undefined) {
                    settingsApi.setSettingValueSync(key, legacyValue);
                }
            }
            localStorage.removeItem(key);
        });

        const jsonSettingKeys = [
            'yaya_followed_custom_order',
            bilibiliConfigKey
        ];

        jsonSettingKeys.forEach((key) => {
            const legacyValue = localStorage.getItem(key);
            if (legacyValue === null) return;
            try {
                const parsedValue = JSON.parse(legacyValue);
                if (typeof settingsApi.getSettingValueSync === 'function'
                    && typeof settingsApi.setSettingValueSync === 'function') {
                    const currentValue = settingsApi.getSettingValueSync(key, undefined);
                    if (currentValue === undefined) {
                        settingsApi.setSettingValueSync(key, parsedValue);
                    }
                }
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`迁移旧 JSON 设置失败: ${key}`, error);
            }
        });
    } catch (error) {
        console.warn('迁移旧设置失败:', error);
    }
}
