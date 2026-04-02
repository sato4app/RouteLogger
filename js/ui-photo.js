// RouteLogger - 写真関連UI

import * as state from './state.js';
import { getAllPhotos, updatePhoto, deletePhoto, getAllExternalPhotos, getAllExternalData } from './db.js';
import { removePhotoMarker } from './map.js';
import { toggleVisibility, updateStatus } from './ui-common.js';

let currentPhotoList = [];
let currentPhotoIndex = -1;
let currentDisplayedPhoto = null;
let zoomController = null;
let _kbWatchHandler = null;
let _doSave = null;
let _doCancel = null;

/** キーボード表示時にビューアーを可視領域に収める */
function _startKbWatch() {
    if (!window.visualViewport) return;
    const viewer = document.getElementById('photoViewer');
    const content = viewer?.querySelector('.viewer-content');
    _kbWatchHandler = () => {
        if (viewer) {
            viewer.style.height = window.visualViewport.height + 'px';
        }
        if (content) {
            // iOS等で画面全体がスクロールしてしまうのを防ぐ
            if (window.scrollY > 0) {
                window.scrollTo(0, 0);
            }
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    content.scrollTop = content.scrollHeight;
                });
            });
        }
    };
    window.visualViewport.addEventListener('resize', _kbWatchHandler);
    window.addEventListener('scroll', _kbWatchHandler); // scrollイベントでも監視して画面全体が上がるのを防ぐ
}

function _stopKbWatch() {
    if (!window.visualViewport || !_kbWatchHandler) return;
    window.visualViewport.removeEventListener('resize', _kbWatchHandler);
    window.removeEventListener('scroll', _kbWatchHandler);
    _kbWatchHandler = null;
    const viewer = document.getElementById('photoViewer');
    if (viewer) viewer.style.height = '';
}

/** テキスト編集中なら保存/破棄を確認してから続行 */
async function _handlePendingEdit() {
    const textEditor = document.getElementById('viewerTextEditor');
    if (!textEditor || textEditor.classList.contains('hidden')) return;
    if (confirm('テキストの変更を保存しますか？\nOK: 保存して移動　キャンセル: 変更を破棄して移動')) {
        if (_doSave) await _doSave();
    } else {
        if (_doCancel) _doCancel();
    }
}

/**
 * マーカークリックから写真を表示
 * @param {Object} photo - 写真データ
 */
export async function showPhotoFromMarker(photo) {
    try {
        // ナビゲーションを有効にするために全写真リストを取得
        const allPhotos = await getAllPhotos();

        let index = -1;
        if (allPhotos.length > 0) {
            // タイムスタンプで一致する写真を探す
            index = allPhotos.findIndex(p => p.timestamp === photo.timestamp);
        }

        if (index !== -1) {
            // DBから取得した最新データを使う（マーカーのphotoオブジェクトは古い可能性がある）
            showPhotoViewer(allPhotos[index], allPhotos, index);
        } else {
            console.warn('マーカーの画像がデータベース内で見つかりませんでした。単一表示します。');
            showPhotoViewer(photo, [photo], 0);
        }
    } catch (error) {
        console.error('showPhotoFromMarkerエラー:', error);
        // エラー時は単一表示へフォールバック
        showPhotoViewer(photo, [photo], 0);
    }
}

/**
 * 写真グリッドを描画（photosストア用）
 * @param {Array} photos
 * @param {HTMLElement} grid
 */
function renderPhotoGrid(photos, grid) {
    grid.innerHTML = '';
    if (photos.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">保存された写真がありません</p>';
        return;
    }
    photos.forEach((photo, index) => {
        const item = document.createElement('div');
        item.className = 'photo-item';

        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'photo-thumb';

        const img = document.createElement('img');
        img.src = photo.data;
        img.alt = '写真';
        thumbDiv.appendChild(img);

        const hasDirection = photo.direction !== null && photo.direction !== undefined && photo.direction !== '';
        if (hasDirection) {
            let deg = parseFloat(photo.direction);
            if (isNaN(deg)) {
                deg = photo.direction === 'left' ? -60 :
                      photo.direction === 'right' ? 60 : 0;
            }
            const badge = document.createElement('div');
            badge.className = 'photo-direction-badge';
            badge.style.width = 'auto';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '12px';
            badge.style.gap = '4px';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            badge.style.color = 'white';
            badge.innerHTML = `<svg viewBox="0 0 14 14" width="12" height="12" style="transform:rotate(${deg}deg)"><path d="M7 2 L11 11 L7 8.5 L3 11 Z" fill="white"/></svg><span>${deg}°</span>`;
            thumbDiv.appendChild(badge);
        }

        item.appendChild(thumbDiv);

        const meta = document.createElement('div');
        meta.className = 'photo-meta';
        const memoText = photo.text ?? photo.memo ?? null;
        if (memoText) {
            const memoEl = document.createElement('span');
            memoEl.textContent = memoText;
            meta.appendChild(memoEl);
        }
        item.appendChild(meta);

        item.addEventListener('click', () => showPhotoViewer(photo, photos, index));
        grid.appendChild(item);
    });
}

/**
 * GeoJSON(externals)とexternal_photosを結合して表示用リストを構築
 * - GeoJSONのPointフィーチャーに紐づく元写真のみ抽出
 * - サムネイル参照(thumb_xxx)の場合は元写真に差し替え
 * - 位置情報をGeoJSONの座標から取得
 * @returns {Promise<Array>}
 */
async function buildExternalPhotoList() {
    const [externals, allExtPhotos] = await Promise.all([
        getAllExternalData(),
        getAllExternalPhotos()
    ]);

    // importId -> fileName -> photoRecord のマップを構築
    const photoMap = new Map();
    for (const p of allExtPhotos) {
        if (!photoMap.has(p.importId)) photoMap.set(p.importId, new Map());
        photoMap.get(p.importId).set(p.fileName, p);
    }

    const displayList = [];
    const usedKeys = new Set();

    for (const ext of externals) {
        if (!ext.data || !ext.data.features) continue;

        for (const feature of ext.data.features) {
            if (feature.geometry?.type !== 'Point') continue;
            const props = feature.properties || {};
            const description = props.description || '';

            // descriptionのHTMLからimg srcを抽出
            const imgMatch = description.match(/src="([^"]+\.(?:jpg|jpeg|png|gif))"/i);
            if (!imgMatch) continue;

            const imgSrc = imgMatch[1];
            const fImportId = props.importId;
            const fPhotoMap = fImportId ? photoMap.get(fImportId) : null;
            if (!fPhotoMap) continue;

            // サムネイル参照の場合は元写真を探す（"thumb_" プレフィックスを除去）
            const baseName = imgSrc.split('/').pop();
            const dir = imgSrc.includes('/') ? imgSrc.substring(0, imgSrc.lastIndexOf('/') + 1) : '';
            let targetFileName = imgSrc;

            if (baseName.toLowerCase().startsWith('thumb_')) {
                const originalBase = baseName.slice(6);
                const originalPath = dir + originalBase;
                if (fPhotoMap.has(originalPath)) {
                    targetFileName = originalPath;
                } else {
                    // ディレクトリ構造が異なるケースを考慮し、ファイル名(originalBase)で全体から探す
                    for (const key of fPhotoMap.keys()) {
                        if (key === originalBase || key.endsWith('/' + originalBase)) {
                            targetFileName = key;
                            break;
                        }
                    }
                }
            }

            const thumbRecord = fPhotoMap.get(imgSrc);
            const originalRecord = fPhotoMap.get(targetFileName);
            
            const photoRecord = originalRecord || thumbRecord;
            if (!photoRecord) continue;

            const recordKey = `${fImportId}_${photoRecord.fileName}`;
            if (usedKeys.has(recordKey)) continue;
            usedKeys.add(recordKey);

            const coords = feature.geometry.coordinates;
            const lng = parseFloat(coords[0]);
            const lat = parseFloat(coords[1]);

            displayList.push({
                ...photoRecord,
                thumbBlob: thumbRecord ? thumbRecord.blob : null,
                location: (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) ? { lat, lng } : null,
                name: props.name || photoRecord.fileName
            });
        }
    }

    // GeoJSONと紐づかない場合のフォールバック: thumb_でないファイルのみ表示
    if (displayList.length === 0) {
        for (const p of allExtPhotos) {
            const baseName = (p.fileName || '').split('/').pop();
            if (!baseName.toLowerCase().startsWith('thumb_')) {
                displayList.push({ ...p, location: null, name: p.fileName });
            }
        }
    }

    return displayList;
}

/**
 * 外部写真グリッドを描画（GeoJSON結合済みリスト用）
 * @param {Array} extPhotoList - buildExternalPhotoList() の結果
 * @param {HTMLElement} grid
 */
function renderExternalPhotoGrid(extPhotoList, grid) {
    grid.innerHTML = '';
    if (extPhotoList.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">外部写真がありません</p>';
        return;
    }
    extPhotoList.forEach((photo, index) => {
        const item = document.createElement('div');
        item.className = 'photo-item';

        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'photo-thumb';

        const img = document.createElement('img');
        img.alt = photo.name || '外部写真';
        // 一覧（サムネイル）表示用には thumbBlob があれば優先して使用する
        const objectUrl = URL.createObjectURL(photo.thumbBlob || photo.blob);
        img.src = objectUrl;
        img.onload = () => URL.revokeObjectURL(objectUrl);
        thumbDiv.appendChild(img);
        item.appendChild(thumbDiv);

        const meta = document.createElement('div');
        meta.className = 'photo-meta';
        const nameEl = document.createElement('span');
        nameEl.textContent = photo.name || '';
        meta.appendChild(nameEl);
        item.appendChild(meta);

        item.addEventListener('click', () => showExternalPhotoViewer(photo, extPhotoList, index));
        grid.appendChild(item);
    });
}

/**
 * 写真一覧を表示
 */
export async function showPhotoList() {
    if (!state.db) {
        alert('データベースが初期化されていません');
        return;
    }

    const photoGrid = document.getElementById('photoGrid');
    const externalPhotoGrid = document.getElementById('externalPhotoGrid');
    const photoTabCount = document.getElementById('photoTabCount');
    const externalPhotoTabCount = document.getElementById('externalPhotoTabCount');
    const photoTabBtn = document.getElementById('photoTabBtn');
    const externalPhotoTabBtn = document.getElementById('externalPhotoTabBtn');

    try {
        const [photos, extPhotoList] = await Promise.all([getAllPhotos(), buildExternalPhotoList()]);

        // カウント更新
        if (photoTabCount) photoTabCount.textContent = photos.length;
        if (externalPhotoTabCount) externalPhotoTabCount.textContent = extPhotoList.length;

        renderPhotoGrid(photos, photoGrid);
        renderExternalPhotoGrid(extPhotoList, externalPhotoGrid);

        // 外部写真のみの場合は外部写真タブ、それ以外は撮影写真タブをアクティブに
        const showExternal = extPhotoList.length > 0 && photos.length === 0;
        photoGrid.classList.toggle('hidden', showExternal);
        externalPhotoGrid.classList.toggle('hidden', !showExternal);
        if (photoTabBtn) photoTabBtn.classList.toggle('active', !showExternal);
        if (externalPhotoTabBtn) externalPhotoTabBtn.classList.toggle('active', showExternal);

        // タブクリックイベント（重複登録防止のためonclickで設定）
        if (photoTabBtn) {
            photoTabBtn.onclick = () => {
                photoGrid.classList.remove('hidden');
                externalPhotoGrid.classList.add('hidden');
                photoTabBtn.classList.add('active');
                if (externalPhotoTabBtn) externalPhotoTabBtn.classList.remove('active');
            };
        }
        if (externalPhotoTabBtn) {
            externalPhotoTabBtn.onclick = () => {
                photoGrid.classList.add('hidden');
                externalPhotoGrid.classList.remove('hidden');
                externalPhotoTabBtn.classList.add('active');
                if (photoTabBtn) photoTabBtn.classList.remove('active');
            };
        }

        toggleVisibility('photoListContainer', true);
    } catch (error) {
        console.error('写真一覧表示エラー:', error);
        alert('写真一覧の表示に失敗しました');
    }
}

/**
 * 外部写真をビューアで表示（読み取り専用）
 * @param {Object} photo - external_photosレコード
 * @param {Array} allPhotos - 外部写真リスト
 * @param {number} index
 */
function showExternalPhotoViewer(photo, allPhotos, index) {
    if (!photo || !photo.blob) {
        console.error('外部写真のデータが見つかりません:', photo);
        return;
    }
    // BlobをData URLに変換してから既存ビューアを流用
    const reader = new FileReader();
    reader.onerror = () => console.error('外部写真の読み込みに失敗しました');
    reader.onload = () => {
        const dataUrl = reader.result;
        // ビューア用の疑似photoオブジェクト（data フィールドのみ必要）
        const viewerPhoto = {
            data: dataUrl,
            timestamp: photo.timestamp,
            text: photo.name || photo.fileName || null,
            location: photo.location || null,
            _isExternal: true
        };

        // 外部写真リストも同じ形式に変換（ナビゲーション用）
        // 簡易実装: インデックスなしで単体表示
        updatePhotoViewerUI(viewerPhoto, 0, 1);

        // 編集・削除ボタンを非表示にする
        const editBtn = document.getElementById('viewerEditTextBtn');
        const deleteBtn = document.getElementById('viewerDeleteBtn');
        const fwdBtn = document.getElementById('viewerFacingForward');
        const bwdBtn = document.getElementById('viewerFacingBackward');
        if (editBtn) editBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (fwdBtn) fwdBtn.style.display = 'none';
        if (bwdBtn) bwdBtn.style.display = 'none';

        toggleVisibility('photoViewer', true);

        const viewerImage = document.getElementById('viewerImage');
        if (!zoomController && viewerImage) {
            zoomController = new ImageZoom(viewerImage);
        }
        if (zoomController) zoomController.reset();
    };
    reader.readAsDataURL(photo.blob);
}

/**
 * 写真一覧を閉じる
 */
export function closePhotoList() {
    toggleVisibility('photoListContainer', false);
    if (state.isTracking) {
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS記録中 (${totalPoints}点記録)`);
    }
}

/**
 * 写真を拡大表示
 * @param {Object} photo - 写真データ
 * @param {Array} allPhotos - 全写真リスト (Optional)
 * @param {number} index - 写真のインデックス (Optional)
 */
export function showPhotoViewer(photo, allPhotos = [], index = -1) {
    if (allPhotos.length > 0) {
        currentPhotoList = allPhotos;
        currentPhotoIndex = index;
    } else {
        currentPhotoList = [photo];
        currentPhotoIndex = 0;
    }

    // 外部写真ビューアで非表示にしたボタンを復元
    const editBtn = document.getElementById('viewerEditTextBtn');
    const deleteBtn = document.getElementById('viewerDeleteBtn');
    const fwdBtn = document.getElementById('viewerFacingForward');
    const bwdBtn = document.getElementById('viewerFacingBackward');
    if (editBtn) editBtn.style.display = '';
    if (deleteBtn) deleteBtn.style.display = '';
    if (fwdBtn) fwdBtn.style.display = '';
    if (bwdBtn) bwdBtn.style.display = '';

    updatePhotoViewerUI(photo, currentPhotoIndex, currentPhotoList.length);
    toggleVisibility('photoViewer', true);

    // Initialize or reset zoom
    const viewerImage = document.getElementById('viewerImage');
    if (!zoomController && viewerImage) {
        zoomController = new ImageZoom(viewerImage);
    }
    if (zoomController) {
        zoomController.reset();
    }
}

/**
 * 写真ビューアのUIを更新
 * @param {Object} photo 
 * @param {number} index 
 * @param {number} total 
 */
function updatePhotoViewerUI(photo, index, total) {
    currentDisplayedPhoto = photo;

    const viewerImage = document.getElementById('viewerImage');
    const photoInfo = document.getElementById('photoInfo');
    const counter = document.getElementById('photoCounter');
    const prevBtn = document.getElementById('prevPhotoBtn');
    const nextBtn = document.getElementById('nextPhotoBtn');

    if (!photo) return;

    viewerImage.src = photo.data;

    let infoHTML = `撮影日時: ${new Date(photo.timestamp).toLocaleString('ja-JP')}`;
    if (photo.location) {
        infoHTML += `<br>緯度: ${photo.location.lat.toFixed(5)}<br>経度: ${photo.location.lng.toFixed(5)}`;
    } else {
        infoHTML += '<br>位置情報なし';
    }

    if (photo.text) {
        infoHTML += `<br><br><span style="white-space: pre-wrap;">${photo.text}</span>`;
    }

    photoInfo.innerHTML = infoHTML;

    // 撮影方向（Forward/Backwardボタンの上に表示）
    const compassEl = document.getElementById('photoCompassInfo');
    if (compassEl) {
        if (photo.compassDirection != null || photo.compassHeading != null) {
            const dir = photo.compassDirection ?? '';
            const deg = photo.compassHeading != null ? `（${photo.compassHeading}°）` : '';
            compassEl.textContent = `${dir}${deg}`;
        } else {
            compassEl.textContent = '';
        }
    }

    // Facing ボタンのアクティブ状態を更新
    const fwdBtn = document.getElementById('viewerFacingForward');
    const bwdBtn = document.getElementById('viewerFacingBackward');
    if (fwdBtn && bwdBtn) {
        fwdBtn.classList.toggle('active', photo.facing === 'forward' || photo.facing === 'forward/backward');
        bwdBtn.classList.toggle('active', photo.facing === 'backward' || photo.facing === 'forward/backward');
    }

    // Update counter
    if (total > 1) {
        counter.textContent = `${index + 1} of ${total}`;
        counter.style.display = 'block';
    } else {
        counter.style.display = 'none';
    }

    // Update buttons
    if (total > 1) {
        if (prevBtn) prevBtn.style.display = index > 0 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = index < total - 1 ? 'flex' : 'none';
    } else {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    }

    // テキスト編集エリアを閉じる（写真切り替え時）
    const textEditor = document.getElementById('viewerTextEditor');
    if (textEditor) textEditor.classList.add('hidden');
    _stopKbWatch();
    document.getElementById('photoViewer')?.classList.remove('editing');

    // Reset zoom when photo changes
    if (zoomController) {
        zoomController.reset();
    }
}

/**
 * 写真ビューアを閉じる
 */
export async function closePhotoViewer() {
    await _handlePendingEdit();
    // 外部写真ビューアで非表示にしたボタンを復元
    const editBtn = document.getElementById('viewerEditTextBtn');
    const deleteBtn = document.getElementById('viewerDeleteBtn');
    const fwdBtn = document.getElementById('viewerFacingForward');
    const bwdBtn = document.getElementById('viewerFacingBackward');
    if (editBtn) editBtn.style.display = '';
    if (deleteBtn) deleteBtn.style.display = '';
    if (fwdBtn) fwdBtn.style.display = '';
    if (bwdBtn) bwdBtn.style.display = '';
    toggleVisibility('photoViewer', false);
    if (state.isTracking) {
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS記録中 (${totalPoints}点記録)`);
    }
    if (zoomController) {
        zoomController.reset();
    }
    // 写真一覧が表示中なら更新（ビューアーでの削除を反映）
    const photoListContainer = document.getElementById('photoListContainer');
    if (photoListContainer && !photoListContainer.classList.contains('hidden')) {
        showPhotoList();
    }
}

/**
 * Photo Viewerのナビゲーション初期化
 */
export function initPhotoViewerControls() {
    const prevBtn = document.getElementById('prevPhotoBtn');
    const nextBtn = document.getElementById('nextPhotoBtn');

    if (prevBtn) {
        prevBtn.onclick = async (e) => {
            e.stopPropagation();
            await _handlePendingEdit();
            if (currentPhotoIndex > 0) {
                currentPhotoIndex--;
                updatePhotoViewerUI(currentPhotoList[currentPhotoIndex], currentPhotoIndex, currentPhotoList.length);
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = async (e) => {
            e.stopPropagation();
            await _handlePendingEdit();
            if (currentPhotoIndex < currentPhotoList.length - 1) {
                currentPhotoIndex++;
                updatePhotoViewerUI(currentPhotoList[currentPhotoIndex], currentPhotoIndex, currentPhotoList.length);
            }
        };
    }

    // Facing 独立on/offボタン
    const fwdBtn = document.getElementById('viewerFacingForward');
    const bwdBtn = document.getElementById('viewerFacingBackward');

    function computeFacing(isFwd, isBwd) {
        if (isFwd && isBwd) return 'forward/backward';
        if (isFwd) return 'forward';
        if (isBwd) return 'backward';
        return null;
    }

    if (fwdBtn) {
        fwdBtn.onclick = async () => {
            const photo = currentPhotoList[currentPhotoIndex];
            if (!photo) return;
            const isFwd = !fwdBtn.classList.contains('active');
            const isBwd = bwdBtn.classList.contains('active');
            const newFacing = computeFacing(isFwd, isBwd);
            photo.facing = newFacing;
            // currentDisplayedPhotoが別オブジェクトの場合も同期（doSaveによる巻き戻し防止）
            if (currentDisplayedPhoto && currentDisplayedPhoto !== photo) {
                currentDisplayedPhoto.facing = newFacing;
            }
            await updatePhoto(photo);
            fwdBtn.classList.toggle('active', isFwd);
        };
    }
    if (bwdBtn) {
        bwdBtn.onclick = async () => {
            const photo = currentPhotoList[currentPhotoIndex];
            if (!photo) return;
            const isFwd = fwdBtn.classList.contains('active');
            const isBwd = !bwdBtn.classList.contains('active');
            const newFacing = computeFacing(isFwd, isBwd);
            photo.facing = newFacing;
            // currentDisplayedPhotoが別オブジェクトの場合も同期（doSaveによる巻き戻し防止）
            if (currentDisplayedPhoto && currentDisplayedPhoto !== photo) {
                currentDisplayedPhoto.facing = newFacing;
            }
            await updatePhoto(photo);
            bwdBtn.classList.toggle('active', isBwd);
        };
    }

    // Edit Text ボタン
    const editTextBtn = document.getElementById('viewerEditTextBtn');
    const textEditor = document.getElementById('viewerTextEditor');
    const textArea = document.getElementById('viewerTextArea');
    const textSaveBtn = document.getElementById('viewerTextSaveBtn');
    const textCancelBtn = document.getElementById('viewerTextCancelBtn');

    if (editTextBtn && textEditor && textArea) {
        const doSave = async () => {
            const photo = currentDisplayedPhoto;
            if (!photo) return;
            textArea.blur(); // キーボードを閉じる
            _stopKbWatch();
            const trimmed = textArea.value.trim();
            photo.text = trimmed || null;
            // currentPhotoList内の同一オブジェクトにも反映
            if (currentPhotoIndex >= 0 && currentPhotoList[currentPhotoIndex]) {
                currentPhotoList[currentPhotoIndex].text = photo.text;
            }
            await updatePhoto(photo);
            textEditor.classList.add('hidden');
            updatePhotoViewerUI(photo, currentPhotoIndex, currentPhotoList.length);
        };

        const doCancel = () => {
            textArea.blur(); // キーボードを閉じる
            _stopKbWatch();
            textEditor.classList.add('hidden');
            document.getElementById('photoViewer').classList.remove('editing');
        };

        // モジュールレベル変数に参照を保持（_handlePendingEdit から呼び出すため）
        _doSave = doSave;
        _doCancel = doCancel;

        editTextBtn.onclick = () => {
            const photo = currentDisplayedPhoto;
            if (!photo) return;
            textArea.value = photo.text || '';
            textEditor.classList.remove('hidden');
            document.getElementById('photoViewer').classList.add('editing');
            _startKbWatch();
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const content = document.querySelector('#photoViewer .viewer-content');
                    if (content) content.scrollTop = content.scrollHeight;
                });
            });
            textArea.focus();
        };

        // ボタンは pointerdown で処理（モバイルで blur より先に発火させるため preventDefault）
        textSaveBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            doSave();
        });

        textCancelBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            doCancel();
        });

        // キーボードショートカット: Ctrl/Cmd+Enter で保存、Escape でキャンセル
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                doCancel();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                doSave();
            }
        });
    }

    // Delete ボタン
    const deleteBtn = document.getElementById('viewerDeleteBtn');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!confirm('この写真を削除しますか？')) return;
            // 編集中なら破棄（削除するので保存不要）
            if (_doCancel) _doCancel();
            const photo = currentPhotoList[currentPhotoIndex];
            if (!photo) return;
            await deletePhoto(photo.id);
            removePhotoMarker(photo.id);
            currentPhotoList.splice(currentPhotoIndex, 1);
            if (currentPhotoList.length === 0) {
                closePhotoViewer();
            } else {
                if (currentPhotoIndex >= currentPhotoList.length) currentPhotoIndex--;
                updatePhotoViewerUI(currentPhotoList[currentPhotoIndex], currentPhotoIndex, currentPhotoList.length);
            }
        };
    }
}

/**
 * Image Zoom Controller
 */
class ImageZoom {
    constructor(element) {
        this.element = element;
        this.scale = 1;
        this.pointX = 0;
        this.pointY = 0;
        this.startX = 0;
        this.startY = 0;
        this.isPanning = false;

        // Touch state
        this.initialDistance = 0;
        this.initialScale = 1;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        this.init();
    }

    init() {
        this.element.addEventListener('mousedown', this.handleMouseDown);
        this.element.addEventListener('wheel', this.handleWheel, { passive: false });
        this.element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd);
    }

    reset() {
        this.scale = 1;
        this.pointX = 0;
        this.pointY = 0;
        this.updateTransform();
    }

    updateTransform() {
        this.element.style.transform = `translate(${this.pointX}px, ${this.pointY}px) scale(${this.scale})`;
    }

    handleMouseDown(e) {
        if (this.scale === 1) return; // Only pan if zoomed in
        e.preventDefault();
        this.startX = e.clientX - this.pointX;
        this.startY = e.clientY - this.pointY;
        this.isPanning = true;
        this.element.style.cursor = 'grabbing';

        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseMove(e) {
        if (!this.isPanning) return;
        e.preventDefault();
        this.pointX = e.clientX - this.startX;
        this.pointY = e.clientY - this.startY;
        this.updateTransform();
    }

    handleMouseUp(e) {
        this.isPanning = false;
        this.element.style.cursor = 'grab';
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleWheel(e) {
        e.preventDefault();
        const xs = (e.clientX - this.pointX) / this.scale;
        const ys = (e.clientY - this.pointY) / this.scale;
        const delta = -e.deltaY;

        const oldScale = this.scale;
        this.scale += delta * 0.001 * this.scale; // Proportional zoom
        this.scale = Math.min(Math.max(1, this.scale), 10); // Clamp 1x to 10x

        // Adjust position to zoom towards mouse pointer
        if (this.scale !== oldScale) {
            this.pointX = e.clientX - xs * this.scale;
            this.pointY = e.clientY - ys * this.scale;
            // Center correction if fully zoomed out
            if (this.scale === 1) {
                this.pointX = 0;
                this.pointY = 0;
            }
            this.updateTransform();
        }
    }

    getDistance(touches) {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    }

    getCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            this.initialDistance = this.getDistance(e.touches);
            this.initialScale = this.scale;
        } else if (e.touches.length === 1 && this.scale > 1) {
            // Pan init
            this.startX = e.touches[0].clientX - this.pointX;
            this.startY = e.touches[0].clientY - this.pointY;
            this.isPanning = true;
        }
    }

    handleTouchMove(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = this.getDistance(e.touches);
            if (this.initialDistance > 0) {
                this.scale = this.initialScale * (currentDistance / this.initialDistance);
                this.scale = Math.min(Math.max(1, this.scale), 10);
                this.updateTransform();
            }
        } else if (e.touches.length === 1 && this.isPanning && this.scale > 1) {
            e.preventDefault(); // Prevent scroll while panning
            this.pointX = e.touches[0].clientX - this.startX;
            this.pointY = e.touches[0].clientY - this.startY;
            this.updateTransform();
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.initialDistance = 0;
        }
        if (e.touches.length === 0) {
            this.isPanning = false;
            // Reset to center if scale is 1
            if (this.scale <= 1) {
                this.reset();
            }
        }
    }
}
