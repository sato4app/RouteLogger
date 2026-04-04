// RouteLogger - Settings & Clock UI

import * as state from './state.js';
import { DEFAULT_PHOTO_RESOLUTION_LEVEL, DEFAULT_PHOTO_QUALITY, DEFAULT_THUMBNAIL_SIZE, SETTINGS_PASSWORD } from './config.js';
import { toggleVisibility } from './ui-common.js';
import { checkAndUpdateUserStatus } from './ui-auth.js';

let clockInterval = null;

/**
 * 時計表示の初期化
 */
export function initClock() {
    updateClock();

    // 1秒ごとに更新して秒まで正確に、あるいは分が変わるタイミングを逃さないようにする
    // 今回はHH:mm表示なので、1秒間隔でチェックしても負荷は低い
    clockInterval = setInterval(updateClock, 1000);
}

/**
 * 時計表示の更新
 */
function updateClock() {
    const clockDisplay = document.getElementById('clockDisplay');
    if (!clockDisplay) return;

    if (!state.isClockVisible) {
        clockDisplay.classList.add('hidden');
        return;
    } else {
        clockDisplay.classList.remove('hidden');
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    clockDisplay.textContent = `${hours}:${minutes}`;
}

/**
 * ユーザー接続UIを更新（ui-auth.jsに委譲）
 */
export function updateSettingsUserInfo() {
    checkAndUpdateUserStatus();
}

/**
 * 設定ダイアログを表示
 */
export function showSettingsDialog() {
    // Use Firebase ON の場合、登録状態を確認して更新
    if (state.isFirebaseEnabled) {
        checkAndUpdateUserStatus();
    }

    // 現在の設定値をUIに反映
    const showClockToggle = document.getElementById('showClockToggle');
    if (showClockToggle) {
        showClockToggle.checked = state.isClockVisible;
    }

    const useFirebaseToggle = document.getElementById('useFirebaseToggle');
    if (useFirebaseToggle) {
        useFirebaseToggle.checked = state.isFirebaseEnabled;
    }

    const userConnectSection = document.getElementById('userConnectSection');
    if (userConnectSection) {
        userConnectSection.classList.toggle('hidden', !state.isFirebaseEnabled);
    }

    const showFacingToggle = document.getElementById('showFacingToggle');
    if (showFacingToggle) {
        showFacingToggle.checked = state.isShowFacingButtons;
    }

    const minooEmergencyToggle = document.getElementById('minooEmergencyToggle');
    if (minooEmergencyToggle) {
        minooEmergencyToggle.checked = state.isMinooEmergencyEnabled;
    }

    toggleVisibility('settingsDialog', true);
}

/**
 * 設定ダイアログを閉じる
 */
export function closeSettingsDialog() {
    toggleVisibility('settingsDialog', false);
}

/**
 * 設定関連のイベント初期化
 */
export function initSettings() {
    // Toggle Switch
    const showClockToggle = document.getElementById('showClockToggle');
    if (showClockToggle) {
        showClockToggle.addEventListener('change', (e) => {
            state.setIsClockVisible(e.target.checked);
            updateClock();

            // 設定を保存（簡易的にlocalStorage使用）
            localStorage.setItem('routeLogger_showClock', e.target.checked);
        });
    }

    // Close Button
    const closeBtn = document.getElementById('closeSettingsBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettingsDialog);
    }

    // Load saved settings
    const savedClockSetting = localStorage.getItem('routeLogger_showClock');
    if (savedClockSetting !== null) {
        state.setIsClockVisible(savedClockSetting === 'true');
        // updateClock() will be called by initClock() later
    }

    // Firebase Toggle
    const useFirebaseToggle = document.getElementById('useFirebaseToggle');
    if (useFirebaseToggle) {
        useFirebaseToggle.addEventListener('change', (e) => {
            state.setIsFirebaseEnabled(e.target.checked);
            localStorage.setItem('routeLogger_useFirebase', e.target.checked);
            const userConnectSection = document.getElementById('userConnectSection');
            if (userConnectSection) {
                userConnectSection.classList.toggle('hidden', !e.target.checked);
            }
            // チェックON時: userAdminの登録状態を確認
            if (e.target.checked) {
                checkAndUpdateUserStatus();
            }
        });
    }
    const savedFirebaseSetting = localStorage.getItem('routeLogger_useFirebase');
    if (savedFirebaseSetting !== null) {
        state.setIsFirebaseEnabled(savedFirebaseSetting === 'true');
    }

    // Show Facing Buttons Toggle
    const showFacingToggle = document.getElementById('showFacingToggle');
    if (showFacingToggle) {
        showFacingToggle.addEventListener('change', (e) => {
            state.setIsShowFacingButtons(e.target.checked);
            localStorage.setItem('routeLogger_showFacingButtons', e.target.checked);
        });
    }
    const savedFacingSetting = localStorage.getItem('routeLogger_showFacingButtons');
    if (savedFacingSetting !== null) {
        state.setIsShowFacingButtons(savedFacingSetting === 'true');
    }

    // Minoo Emergency Toggle
    const minooEmergencyToggle = document.getElementById('minooEmergencyToggle');
    if (minooEmergencyToggle) {
        minooEmergencyToggle.addEventListener('change', (e) => {
            state.setIsMinooEmergencyEnabled(e.target.checked);
            localStorage.setItem('routeLogger_minooEmergency', e.target.checked);
        });
    }
    const savedMinooEmergency = localStorage.getItem('routeLogger_minooEmergency');
    if (savedMinooEmergency !== null) {
        state.setIsMinooEmergencyEnabled(savedMinooEmergency === 'true');
    }

    // ── 画像設定パネル ──────────────────────────────────────────────────────────
    const resolutionLabels = ['720×1280px（高）', '360×640px（中）', '180×320px（低）'];
    const photoResolutionSlider = document.getElementById('photoResolutionSlider');
    const photoResolutionLabel  = document.getElementById('photoResolutionLabel');
    const photoQualitySlider    = document.getElementById('photoQualitySlider');
    const photoQualityInput     = document.getElementById('photoQualityInput');
    const thumbnailSizeSlider   = document.getElementById('thumbnailSizeSlider');
    const thumbnailSizeInput    = document.getElementById('thumbnailSizeInput');

    // パネル内スライダーのUI同期（stateには反映しない）
    if (photoResolutionSlider) {
        photoResolutionSlider.addEventListener('input', (e) => {
            if (photoResolutionLabel) photoResolutionLabel.textContent = resolutionLabels[parseInt(e.target.value)];
        });
    }
    if (photoQualitySlider) {
        photoQualitySlider.addEventListener('input', (e) => {
            if (photoQualityInput) photoQualityInput.value = e.target.value;
        });
    }
    if (photoQualityInput) {
        photoQualityInput.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) {
                if (photoQualitySlider) photoQualitySlider.value = Math.min(80, Math.max(60, v));
            }
        });
    }
    if (thumbnailSizeSlider) {
        thumbnailSizeSlider.addEventListener('input', (e) => {
            if (thumbnailSizeInput) thumbnailSizeInput.value = e.target.value;
        });
    }
    if (thumbnailSizeInput) {
        thumbnailSizeInput.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v)) {
                if (thumbnailSizeSlider) thumbnailSizeSlider.value = Math.min(320, Math.max(80, v));
            }
        });
    }

    // パネルを開く: 現在のstateをスライダーに反映
    function openImageSettingsPanel() {
        if (photoResolutionSlider) photoResolutionSlider.value = state.photoResolutionLevel;
        if (photoResolutionLabel)  photoResolutionLabel.textContent = resolutionLabels[state.photoResolutionLevel];
        if (photoQualitySlider)    photoQualitySlider.value = state.photoQuality;
        if (photoQualityInput)     photoQualityInput.value  = state.photoQuality;
        if (thumbnailSizeSlider)   thumbnailSizeSlider.value = state.thumbnailSize;
        if (thumbnailSizeInput)    thumbnailSizeInput.value  = state.thumbnailSize;
        const section = document.getElementById('imageSettingsSection');
        if (section) section.classList.remove('hidden');
    }

    // パネルを閉じる
    function closeImageSettingsPanel() {
        const section = document.getElementById('imageSettingsSection');
        if (section) section.classList.add('hidden');
    }

    // スライダー・テキスト入力値をstateとlocalStorageに確定保存
    function applyImageSettings() {
        const level = parseInt(photoResolutionSlider?.value ?? state.photoResolutionLevel);
        const rawQuality = parseInt(photoQualityInput?.value ?? photoQualitySlider?.value ?? state.photoQuality);
        const quality = isNaN(rawQuality) ? state.photoQuality : rawQuality;
        const rawThumb = parseInt(thumbnailSizeInput?.value ?? thumbnailSizeSlider?.value ?? state.thumbnailSize);
        const thumb = isNaN(rawThumb) ? state.thumbnailSize : rawThumb;
        state.setPhotoResolutionLevel(level);
        state.setPhotoQuality(quality);
        state.setThumbnailSize(thumb);
        localStorage.setItem('routeLogger_photoResolution', level);
        localStorage.setItem('routeLogger_photoQuality', quality);
        localStorage.setItem('routeLogger_thumbnailSize', thumb);
    }

    // 規定値をスライダーに反映（stateには反映しない）
    function resetToDefaults() {
        if (photoResolutionSlider) photoResolutionSlider.value = DEFAULT_PHOTO_RESOLUTION_LEVEL;
        if (photoResolutionLabel)  photoResolutionLabel.textContent = resolutionLabels[DEFAULT_PHOTO_RESOLUTION_LEVEL];
        if (photoQualitySlider)    photoQualitySlider.value = DEFAULT_PHOTO_QUALITY;
        if (photoQualityInput)     photoQualityInput.value  = DEFAULT_PHOTO_QUALITY;
        if (thumbnailSizeSlider)   thumbnailSizeSlider.value = DEFAULT_THUMBNAIL_SIZE;
        if (thumbnailSizeInput)    thumbnailSizeInput.value  = DEFAULT_THUMBNAIL_SIZE;
    }

    const imageSettingsBtn     = document.getElementById('imageSettingsBtn');
    const imageSettingsSaveBtn = document.getElementById('imageSettingsSaveBtn');
    const imageSettingsDefaultBtn = document.getElementById('imageSettingsDefaultBtn');
    const imageSettingsCancelBtn  = document.getElementById('imageSettingsCancelBtn');

    if (imageSettingsBtn) {
        imageSettingsBtn.addEventListener('click', () => {
            const input = window.prompt('設定用パスワードを入力してください');
            if (input === null) return; // キャンセル
            if (input !== SETTINGS_PASSWORD) {
                alert('パスワードが違います');
                return;
            }
            openImageSettingsPanel();
        });
    }
    if (imageSettingsSaveBtn) imageSettingsSaveBtn.addEventListener('click', () => { applyImageSettings(); closeImageSettingsPanel(); });
    if (imageSettingsDefaultBtn) imageSettingsDefaultBtn.addEventListener('click', resetToDefaults);
    if (imageSettingsCancelBtn)  imageSettingsCancelBtn.addEventListener('click', closeImageSettingsPanel);

    // ── 過去データDrive移行 ──────────────────────────────────────────────────────
    const migrateToDriveBtn = document.getElementById('migrateToDriveBtn');
    if (migrateToDriveBtn) {
        migrateToDriveBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('migrateNameInput')?.value?.trim();
            const mode = document.querySelector('input[name="migrateMode"]:checked')?.value;
            const msg = document.getElementById('migrateToDriveMsg');
            if (!nameInput) { if (msg) msg.textContent = 'routelog名を入力してください'; return; }

            if (msg) msg.textContent = '実行中...';
            migrateToDriveBtn.disabled = true;
            try {
                const param = mode === 'prefix' ? { prefix: nameInput } : { projectName: nameInput };
                const fn = firebase.functions().httpsCallable('migrateRoutesToDrive');
                const result = await fn(param);
                const results = result.data.results || [];
                if (results.length === 0) {
                    if (msg) msg.textContent = '対象のroutelogが見つかりませんでした';
                } else {
                    const ok  = results.filter(r => r.success).length;
                    const ng  = results.filter(r => !r.success).length;
                    if (msg) msg.textContent = `完了: 成功 ${ok}件${ng > 0 ? `、失敗 ${ng}件` : ''}`;
                }
            } catch (e) {
                if (msg) msg.textContent = `エラー: ${e.message}`;
            } finally {
                migrateToDriveBtn.disabled = false;
            }
        });
    }

    // 起動時: localStorageの保存値をstateに反映
    const savedResolution = localStorage.getItem('routeLogger_photoResolution');
    if (savedResolution !== null) state.setPhotoResolutionLevel(parseInt(savedResolution));

    const savedQuality = localStorage.getItem('routeLogger_photoQuality');
    if (savedQuality !== null) state.setPhotoQuality(parseInt(savedQuality));

    const savedThumbnail = localStorage.getItem('routeLogger_thumbnailSize');
    if (savedThumbnail !== null) state.setThumbnailSize(parseInt(savedThumbnail));

}
