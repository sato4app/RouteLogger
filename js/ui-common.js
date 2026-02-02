// RouteLogger - UI 共通機能

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
