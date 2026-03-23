// RouteLogger - Settings & Clock UI

import * as state from './state.js';
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


}
