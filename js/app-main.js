// RouteLogger - メイン初期化

import * as state from './state.js';
import { initIndexedDB } from './db.js';
import { initMap, displayPhotoMarkers } from './map.js';
import { startTracking, stopTracking, handleVisibilityChange, handleDeviceOrientation } from './tracking.js';
import { takePhoto, closeCameraDialog, capturePhoto, savePhotoWithDirection, handleTextButton, retakePhoto } from './camera.js';
import { saveToFirebase, reloadFromFirebase } from './firebase-ops.js';
import { updateStatus, showPhotoList, closePhotoList, closePhotoViewer, showDataSize, closeStatsDialog, closeDocumentListDialog, showPhotoFromMarker, initPhotoViewerControls, initClock, initSettings, showSettingsDialog, showDocNameDialog, setUiBusy } from './ui.js';
import { getAllExternalData, getAllTracks, getAllPhotos, clearIndexedDBSilent, clearRouteLogData, restoreTrack, savePhoto } from './db.js';
import { displayExternalGeoJSON, displayAllTracks, clearMapData } from './map.js';
import { exportToKmz } from './kmz-handler.js';

/**
 * アプリケーション初期化
 */
async function initApp() {
    // 時計と設定の初期化
    initClock();
    initSettings();

    // IndexedDB初期化
    try {
        await initIndexedDB();


        if (!state.db) {
            throw new Error('IndexedDB初期化後もdb変数がnullです');
        }
    } catch (error) {
        console.error('IndexedDB初期化エラー:', error);
        updateStatus('データベース初期化エラー');
        alert('データベースの初期化に失敗しました。ページを再読み込みしてください。');
        return;
    }

    // 地図初期化
    await initMap();

    // トラックデータ表示
    try {
        const allTracks = await getAllTracks();
        if (allTracks && allTracks.length > 0) {
            displayAllTracks(allTracks);
        }
    } catch (e) {
        console.error('トラックデータ表示エラー:', e);
    }

    // 写真マーカー表示
    await displayPhotoMarkers(showPhotoFromMarker);

    // イベントリスナー設定
    setupEventListeners();

    // 外部データの読み込みと表示
    try {
        const externalDataList = await getAllExternalData();
        if (externalDataList && externalDataList.length > 0) {
            console.log(`外部データ ${externalDataList.length}件を復元中...`);
            externalDataList.forEach(item => {
                if (item.type === 'geojson') {
                    displayExternalGeoJSON(item.data);
                }
            });
            updateStatus(`外部データ ${externalDataList.length}件を復元しました`);
        }
    } catch (e) {
        console.error('外部データ復元エラー:', e);
    }

    // Service Worker登録
    registerServiceWorker();

    updateStatus('初期化完了');
}

/**
 * Firebase匿名認証を確実に行う
 */
async function ensureFirebaseAuth() {
    if (firebase.auth().currentUser) return true;
    try {
        await firebase.auth().signInAnonymously();
        state.setFirebaseAuthReady(true);
        return true;
    } catch (authError) {
        console.error('Firebase認証エラー:', authError);
        state.setFirebaseAuthReady(false);
        alert('Firebase認証に失敗しました: ' + authError.message);
        return false;
    }
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
    // メインコントロール
    document.getElementById('clearBtn').addEventListener('click', async () => {
        if (confirm('表示中のルートとマーカーを消去し、データを初期化しますか？')) {
            clearMapData();
            try {
                await clearIndexedDBSilent();
            } catch (e) {
                console.error('IndexedDB初期化エラー:', e);
                if (!state.db) {
                    await initIndexedDB();
                }
            }
            updateStatus('データを初期化しました');
        }
    });
    document.getElementById('startBtn').addEventListener('click', startTracking);
    document.getElementById('stopBtn').addEventListener('click', stopTracking);
    document.getElementById('photoBtn').addEventListener('click', takePhoto);

    // カメラUI
    document.getElementById('cameraCloseBtn').addEventListener('click', closeCameraDialog);
    document.getElementById('cameraShutterBtn').addEventListener('click', async () => {
        await capturePhoto();
        resetDirectionDial();
    });
    document.getElementById('cameraBackBtn').addEventListener('click', retakePhoto);
    document.getElementById('cameraTextBtn').addEventListener('click', handleTextButton);
    document.getElementById('cameraCloseAfterShotBtn').addEventListener('click', closeCameraDialog);

    // 方向ダイアル
    let currentDialAngle = 0;
    let currentFacing = 'forward';

    function resetDirectionDial() {
        currentDialAngle = 0;
        currentFacing = 'forward';
        updateDialUI(0);
        updateFacingUI('forward');
    }

    function updateDialUI(angle) {
        const display = document.getElementById('dirAngleDisplay');
        const arrowGroup = document.getElementById('dialArrowGroup');
        if (display) display.textContent = angle > 0 ? `+${angle}°` : `${angle}°`;
        if (arrowGroup) arrowGroup.setAttribute('transform', `rotate(${angle}, 50, 50)`);
    }

    function setDialAngle(raw) {
        // 10°単位にスナップ、-180〜+180 の範囲でラップ
        let snapped = Math.round(raw / 10) * 10;
        if (snapped > 180) snapped -= 360;
        if (snapped < -180) snapped += 360;
        currentDialAngle = snapped;
        updateDialUI(snapped);
    }

    function updateFacingUI(facing) {
        document.getElementById('dirFacingForward').classList.toggle('active', facing === 'forward');
        document.getElementById('dirFacingBackward').classList.toggle('active', facing === 'backward');
    }

    // Forward/Backward トグル
    document.getElementById('dirFacingForward').addEventListener('click', () => {
        currentFacing = 'forward';
        updateFacingUI('forward');
        savePhotoWithDirection(currentDialAngle, currentFacing);
    });
    document.getElementById('dirFacingBackward').addEventListener('click', () => {
        currentFacing = 'backward';
        updateFacingUI('backward');
        savePhotoWithDirection(currentDialAngle, currentFacing);
    });

    document.getElementById('dirAngleLeft').addEventListener('click', () => {
        setDialAngle(currentDialAngle - 10);
        savePhotoWithDirection(currentDialAngle, currentFacing);
    });
    document.getElementById('dirAngleRight').addEventListener('click', () => {
        setDialAngle(currentDialAngle + 10);
        savePhotoWithDirection(currentDialAngle, currentFacing);
    });

    // ダイアルのタッチ/マウスドラッグ操作
    const dialEl = document.getElementById('directionDial');
    if (dialEl) {
        let isDragging = false;
        let dialCenter = { x: 0, y: 0 };

        const getAngleFromEvent = (clientX, clientY) => {
            const dx = clientX - dialCenter.x;
            const dy = clientY - dialCenter.y;
            return Math.atan2(dx, -dy) * (180 / Math.PI);
        };

        dialEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isDragging = true;
            const rect = dialEl.getBoundingClientRect();
            dialCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }, { passive: false });

        dialEl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!isDragging) return;
            const t = e.touches[0];
            setDialAngle(getAngleFromEvent(t.clientX, t.clientY));
        }, { passive: false });

        dialEl.addEventListener('touchend', () => {
            if (isDragging) savePhotoWithDirection(currentDialAngle, currentFacing);
            isDragging = false;
        });

        dialEl.addEventListener('mousedown', () => {
            isDragging = true;
            const rect = dialEl.getBoundingClientRect();
            dialCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            setDialAngle(getAngleFromEvent(e.clientX, e.clientY));
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) savePhotoWithDirection(currentDialAngle, currentFacing);
            isDragging = false;
        });
    }

    // Dataボタン（パネル表示切り替え）
    document.getElementById('dataBtn').addEventListener('click', toggleDataPanel);

    // Settingsボタン
    document.getElementById('settingsBtn').addEventListener('click', () => {
        showSettingsDialog();
    });

    // データ管理パネル
    document.getElementById('photoListBtn').addEventListener('click', async () => {
        await showPhotoList();
        returnToMainControl();
    });

    document.getElementById('dataSizeBtn').addEventListener('click', async () => {
        await showDataSize();
        returnToMainControl();
    });

    // Load Button: Firebase on → Firebaseから読み込み / off → ファイルから読み込み
    const dataReloadBtn = document.getElementById('dataReloadBtn');
    if (dataReloadBtn) {
        dataReloadBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            returnToMainControl();
            if (state.isFirebaseEnabled) {
                const authed = await ensureFirebaseAuth();
                if (!authed) return;
                await reloadFromFirebase();
            } else {
                let fileInput = document.getElementById('kmzFileInput');
                if (!fileInput) {
                    fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.id = 'kmzFileInput';
                    fileInput.accept = '.kmz,.kml,.geojson,.json';
                    fileInput.style.display = 'none';
                    document.body.appendChild(fileInput);

                    fileInput.addEventListener('change', async (event) => {
                        const file = event.target.files[0];
                        if (file) {
                            setUiBusy(true);
                            try {
                                const { importKmz, importGeoJson } = await import('./kmz-handler.js');
                                let result;

                                if (file.name.endsWith('.kmz') || file.name.endsWith('.kml')) {
                                    result = await importKmz(file);
                                } else if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
                                    result = await importGeoJson(file);
                                } else {
                                    alert('Unsupported file type');
                                    return;
                                }

                                if (result.type === 'RouteLogger') {
                                    if (confirm('現在の記録データをクリアして、このファイルを読み込みますか？')) {
                                        updateStatus('データをリセット中...');
                                        await clearRouteLogData();
                                        clearMapData({ keepExternal: true });
                                        updateStatus('トラックデータを復元中...');
                                        for (const track of result.tracks) {
                                            await restoreTrack(track);
                                        }
                                        updateStatus('写真データを復元中...');
                                        for (const photo of result.photos) {
                                            delete photo.id;
                                            await savePhoto(photo);
                                        }
                                        alert(`読み込み完了: ${file.name}\nページをリロードします。`);
                                        location.reload();
                                    }
                                } else {
                                    displayExternalGeoJSON(result.geojson);
                                    updateStatus('外部データを表示しました');
                                    alert(`Loaded successfully: ${file.name}`);
                                }
                            } catch (err) {
                                console.error('Error importing file:', err);
                                alert('Failed to import file: ' + err.message);
                            } finally {
                                setUiBusy(false);
                                fileInput.value = '';
                            }
                        }
                    });
                }
                fileInput.click();
            }
        });
    }

    // Save Button: Firebase on → Firebaseに保存 / off → KMZファイルに保存
    const dataSaveBtn = document.getElementById('dataSaveBtn');
    if (dataSaveBtn) {
        dataSaveBtn.addEventListener('click', async () => {
            const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const defaultName = `RLog_${jstDate.toISOString().slice(0, 10).replace(/-/g, '')}`;
            if (state.isFirebaseEnabled) {
                const authed = await ensureFirebaseAuth();
                if (!authed) return;
                const docName = await showDocNameDialog(defaultName);
                if (docName) {
                    setUiBusy(true);
                    try {
                        await saveToFirebase(docName);
                    } finally {
                        setUiBusy(false);
                    }
                }
            } else {
                const docName = await showDocNameDialog(defaultName);
                if (docName) {
                    setUiBusy(true);
                    try {
                        const tracks = await getAllTracks();
                        const photos = await getAllPhotos();
                        await exportToKmz(tracks, photos, docName);
                    } catch (e) {
                        console.error('エクスポートエラー:', e);
                        alert('エクスポートに失敗しました: ' + e.message);
                    } finally {
                        setUiBusy(false);
                    }
                }
            }
            returnToMainControl();
        });
    }



    // ダイアログ閉じるボタン
    document.getElementById('closeListBtn').addEventListener('click', closePhotoList);
    document.getElementById('closeViewerBtn').addEventListener('click', closePhotoViewer);
    document.getElementById('statsOkBtn').addEventListener('click', closeStatsDialog);
    document.getElementById('closeDocListBtn').addEventListener('click', closeDocumentListDialog);

    // ページ可視性変化
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // デバイス方角センサー
    setupDeviceOrientation();

    // Photo Viewer Navigation
    initPhotoViewerControls();
}

/**
 * Dataパネルの表示を切り替え
 */
function toggleDataPanel() {
    const dataPanel = document.getElementById('dataPanel');

    if (dataPanel.classList.contains('hidden')) {
        dataPanel.classList.remove('hidden');
    } else {
        dataPanel.classList.add('hidden');
    }
}

/**
 * メインコントロールに戻る
 */
function returnToMainControl() {
    const dataPanel = document.getElementById('dataPanel');
    dataPanel.classList.add('hidden');
}

/**
 * デバイス方角センサーを設定
 */
function setupDeviceOrientation() {
    if (!window.DeviceOrientationEvent) return;

    if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
        // Android等（iOSはstartTracking()内で許可を要求）
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }
}

/**
 * Service Workerを登録
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js');
    }
}

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', initApp);
