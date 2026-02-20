// RouteLogger - ダイアログ関連UI

import * as state from './state.js';
import { getAllTracks, getAllPhotos } from './db.js';
import { calculateTrackStats, formatDataSize } from './utils.js';
import { toggleVisibility, updateStatus } from './ui-common.js';

/**
 * ドキュメント名入力ダイアログを表示
 * @param {string} defaultName - デフォルト名
 * @returns {Promise<string|null>}
 */
export function showDocNameDialog(defaultName) {
    return new Promise((resolve) => {
        const dialogId = 'docNameDialog';
        const input = document.getElementById('docNameInput');
        const okBtn = document.getElementById('docNameOkBtn');
        const cancelBtn = document.getElementById('docNameCancelBtn');

        input.value = defaultName;

        const handleOk = () => {
            const docName = input.value.trim();
            if (!docName) {
                alert('ドキュメント名を入力してください');
                return;
            }
            cleanup();
            resolve(docName);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKeyPress = (e) => {
            if (e.key === 'Enter') handleOk();
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        input.addEventListener('keypress', handleKeyPress);

        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            input.removeEventListener('keypress', handleKeyPress);
            toggleVisibility(dialogId, false);
        };

        toggleVisibility(dialogId, true);
        input.focus();
        input.select();
    });
}

/**
 * ドキュメント選択ダイアログを表示
 * @param {Array} documents - ドキュメント配列
 * @param {Function} onLoad - 読み込み時のコールバック
 */
export function showDocumentListDialog(documents, onLoad) {
    const documentList = document.getElementById('documentList');
    documentList.innerHTML = '';

    const loadPhotosCheckbox = document.getElementById('loadPhotosCheckbox');
    if (loadPhotosCheckbox) {
        loadPhotosCheckbox.checked = true; // Default: checked
    }

    documents.forEach(doc => {
        const docItem = document.createElement('div');
        docItem.className = 'doc-item';

        const title = document.createElement('div');
        title.className = 'doc-item-title';
        title.textContent = doc.id;

        const meta = document.createElement('div');
        meta.className = 'doc-item-meta';
        const createdAt = doc.data.createdAt?.toDate();
        const dateStr = createdAt ? createdAt.toLocaleString('ja-JP') : '不明';
        const userId = doc.data.userId ? `UID: ...${doc.data.userId.slice(-4)}` : 'UID: 不明';
        meta.textContent = `${dateStr} | ${userId}`;

        const stats = document.createElement('div');
        stats.className = 'doc-item-meta';
        stats.textContent = `記録点数: ${doc.data.tracks ? doc.data.tracks.reduce((sum, t) => sum + (t.points?.length || 0), 0) : 0} | 写真: ${doc.data.photosCount || 0}`;

        docItem.appendChild(title);
        docItem.appendChild(meta);
        docItem.appendChild(stats);

        docItem.onclick = () => {
            const loadPhotos = loadPhotosCheckbox ? loadPhotosCheckbox.checked : true;
            onLoad(doc, loadPhotos);
        };
        documentList.appendChild(docItem);
    });

    toggleVisibility('documentListDialog', true);
}

/**
 * ドキュメント選択ダイアログを閉じる
 */
export function closeDocumentListDialog() {
    toggleVisibility('documentListDialog', false);
    if (state.isTracking) {
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS記録中 (${totalPoints}点記録)`);
    }
}

/**
 * データサイズ情報を表示
 */
export async function showDataSize() {
    try {
        const allTracks = await getAllTracks();
        const allPhotos = await getAllPhotos();
        const trackStats = calculateTrackStats(allTracks);

        // GPSデータサイズ
        let gpsDataSizeBytes = 0;
        allTracks.forEach(track => {
            gpsDataSizeBytes += new Blob([JSON.stringify(track)]).size;
        });

        // 写真データサイズと解像度
        let photosTotalSize = 0;
        let photosResolution = '-';

        if (allPhotos.length > 0) {
            allPhotos.forEach(photo => {
                photosTotalSize += new Blob([photo.data]).size;
            });

            const lastPhoto = allPhotos[allPhotos.length - 1];
            const img = new Image();
            await new Promise((resolve) => {
                img.onload = () => {
                    photosResolution = `${img.width} × ${img.height}`;
                    resolve();
                };
                img.onerror = resolve;
                img.src = lastPhoto.data;
            });
        }

        const statsHTML = `
            <div class="stat-section">
                <div class="stat-row">
                    <span class="stat-label">記録点数:</span>
                    <span class="stat-value">${trackStats.totalPoints}点</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">GPSサイズ:</span>
                    <span class="stat-value">${formatDataSize(gpsDataSizeBytes)}</span>
                </div>
            </div>
            <div class="stat-section">
                <div class="stat-row">
                    <span class="stat-label">写真:</span>
                    <span class="stat-value">${allPhotos.length}枚</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">写真サイズ:</span>
                    <span class="stat-value">${formatDataSize(photosTotalSize)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">解像度:</span>
                    <span class="stat-value">${photosResolution}</span>
                </div>
            </div>
        `;

        document.getElementById('statsBody').innerHTML = statsHTML;
        toggleVisibility('statsDialog', true);
    } catch (error) {
        console.error('データサイズ取得エラー:', error);
        alert('データサイズの取得に失敗しました: ' + error.message);
    }
}

/**
 * Sizeダイアログが開いている場合はデータサイズを更新
 */
export async function updateDataSizeIfOpen() {
    const statsDialog = document.getElementById('statsDialog');
    if (!statsDialog || statsDialog.classList.contains('hidden')) return;

    await showDataSize();
}

/**
 * 統計ダイアログを閉じる
 */
export function closeStatsDialog() {
    toggleVisibility('statsDialog', false);
    if (state.isTracking) {
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS記録中 (${totalPoints}点記録)`);
    }
}

/**
 * 既存データ確認ダイアログを表示
 * @param {string} message - メッセージ
 * @param {boolean} hasData - 既存データがあるかどうか
 * @returns {Promise<string>} 'init', 'append', 'cancel'
 */
export function showClearDataDialog(message, hasData) {
    return new Promise((resolve) => {
        const dialogId = 'clearDataDialog';
        const body = document.getElementById('clearDataBody');
        const initBtn = document.getElementById('clearDataInitBtn');
        const appendBtn = document.getElementById('clearDataAppendBtn');
        const cancelBtn = document.getElementById('clearDataCancelBtn');
        const title = document.querySelector('#clearDataDialog h2');

        if (!body || !initBtn || !appendBtn || !title) {
            console.error('showClearDataDialog: 必要なDOM要素が見つかりません');
            resolve('cancel');
            return;
        }

        body.innerText = message;

        if (hasData) {
            title.textContent = 'Existing Data Found';
            initBtn.textContent = 'Start New (Clear Data)';
            initBtn.classList.add('danger-btn');
            appendBtn.textContent = 'Continue (Append)';
            appendBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'block';
        } else {
            title.textContent = 'Start Recording';
            initBtn.textContent = 'Start';
            initBtn.classList.remove('danger-btn');
            appendBtn.textContent = 'Cancel';
            appendBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'none';
        }

        const handleInit = () => {
            cleanup();
            resolve('init');
        };

        const handleAppend = () => {
            cleanup();
            if (hasData) {
                resolve('append');
            } else {
                resolve('cancel');
            }
        };

        const handleCancel = () => {
            cleanup();
            resolve('cancel');
        };

        initBtn.onclick = handleInit;
        appendBtn.onclick = handleAppend;
        if (cancelBtn) cancelBtn.onclick = handleCancel;

        const cleanup = () => {
            initBtn.onclick = null;
            appendBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
            toggleVisibility(dialogId, false);
        };

        toggleVisibility(dialogId, true);
    });
}
