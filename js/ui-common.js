// RouteLogger - UI 共通機能

import { isTracking } from './state.js';

/**
 * UIのビジー状態を設定（Save/Load中など）
 * @param {boolean} isBusy
 */
export function setUiBusy(isBusy) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const photoBtn = document.getElementById('photoBtn');
    const dataBtn = document.getElementById('dataBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    // Save/Load toggles and buttons
    const dataSaveBtn = document.getElementById('dataSaveBtn');
    const dataReloadBtn = document.getElementById('dataReloadBtn');
    const cloudLoadBtn = document.getElementById('cloudLoadBtn');
    const kmzLoadBtn = document.getElementById('kmzLoadBtn');
    const cloudSaveBtn = document.getElementById('cloudSaveBtn');
    const kmzSaveBtn = document.getElementById('kmzSaveBtn');

    // GeoJSON Input label if exists, or other inputs
    // For now we handle buttons.

    if (isBusy) {
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        if (photoBtn) photoBtn.disabled = true;
        if (dataBtn) dataBtn.disabled = true;
        if (settingsBtn) settingsBtn.disabled = true;

        if (dataSaveBtn) dataSaveBtn.disabled = true;
        if (dataReloadBtn) dataReloadBtn.disabled = true;
        if (cloudLoadBtn) cloudLoadBtn.disabled = true;
        if (kmzLoadBtn) kmzLoadBtn.disabled = true;
        if (cloudSaveBtn) cloudSaveBtn.disabled = true;
        if (kmzSaveBtn) kmzSaveBtn.disabled = true;

    } else {
        // Restore based on tracking state
        updateUiForTrackingState();
    }
}

/**
 * トラッキング状態に基づいてUIを更新
 */
export function updateUiForTrackingState() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const photoBtn = document.getElementById('photoBtn');
    const dataBtn = document.getElementById('dataBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    const dataSaveBtn = document.getElementById('dataSaveBtn');
    const dataReloadBtn = document.getElementById('dataReloadBtn');

    // Direct buttons in panels
    const cloudLoadBtn = document.getElementById('cloudLoadBtn');
    const kmzLoadBtn = document.getElementById('kmzLoadBtn');
    const cloudSaveBtn = document.getElementById('cloudSaveBtn');
    const kmzSaveBtn = document.getElementById('kmzSaveBtn');

    if (isTracking) {
        // Logging active
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (photoBtn) photoBtn.disabled = false;

        // Data/Settings enabled
        if (dataBtn) dataBtn.disabled = false;
        if (settingsBtn) settingsBtn.disabled = false;

        // Save/Load disabled
        if (dataSaveBtn) dataSaveBtn.disabled = true;
        if (dataReloadBtn) dataReloadBtn.disabled = true;
        if (cloudLoadBtn) cloudLoadBtn.disabled = true;
        if (kmzLoadBtn) kmzLoadBtn.disabled = true;
        if (cloudSaveBtn) cloudSaveBtn.disabled = true;
        if (kmzSaveBtn) kmzSaveBtn.disabled = true;

    } else {
        // Not logging
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (photoBtn) photoBtn.disabled = true;

        if (dataBtn) dataBtn.disabled = false;
        if (settingsBtn) settingsBtn.disabled = false;

        // Save/Load enabled
        if (dataSaveBtn) dataSaveBtn.disabled = false;
        if (dataReloadBtn) dataReloadBtn.disabled = false;
        if (cloudLoadBtn) cloudLoadBtn.disabled = false;
        if (kmzLoadBtn) kmzLoadBtn.disabled = false;
        if (cloudSaveBtn) cloudSaveBtn.disabled = false;
        if (kmzSaveBtn) kmzSaveBtn.disabled = false;
    }
}

/**
 * HTML要素の表示・非表示を切り替え
 * @param {string} elementId - 要素ID
 * @param {boolean} isVisible - 表示するかどうか
 */
export function toggleVisibility(elementId, isVisible) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isVisible) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

/**
 * ステータス表示を更新
 * @param {string} message - メッセージ
 */
export function updateStatus(message) {
    const textEl = document.getElementById('statusText');
    if (textEl) {
        textEl.textContent = message;
    }
}

/**
 * 座標表示を更新
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @param {number} accuracy - 精度
 * @param {number} [distance] - 移動距離 (m)
 * @param {number} [elapsed] - 経過時間 (秒)
 */
export function updateCoordinates(lat, lng, accuracy, distance, elapsed) {
    const coordsDiv = document.getElementById('coordinates');
    if (!coordsDiv) return;

    const distText = distance !== undefined ? ` / 移動: ${Math.floor(distance)}m` : '';
    const timeText = elapsed !== undefined ? ` / 経過: ${Math.floor(elapsed)}秒` : '';

    coordsDiv.innerHTML = `
        <div style="display: flex; justify-content: center; gap: 10px;">
            <span>緯度: ${lat.toFixed(5)}</span>
            <span>経度: ${lng.toFixed(5)}</span>
        </div>
        <div>
            精度: ±${accuracy.toFixed(1)}m${distText}${timeText}
        </div>
    `;
}
