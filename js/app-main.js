// RouteLogger - メイン初期化

import * as state from './state.js';
import { initIndexedDB } from './db.js';
import { initMap, displayPhotoMarkers } from './map.js';
import { startTracking, stopTracking, handleVisibilityChange, handleDeviceOrientation } from './tracking.js';
import { takePhoto, closeCameraDialog, capturePhoto, savePhotoWithDirection, handleTextButton } from './camera.js';
import { saveToFirebase, reloadFromFirebase } from './firebase-ops.js';
import { updateStatus, showPhotoList, closePhotoList, closePhotoViewer, showDataSize, closeStatsDialog, closeDocumentListDialog, showPhotoFromMarker, initPhotoViewerControls, initClock, initSettings, showSettingsDialog, showDocNameDialog } from './ui.js';
import { showLoadSelectionDialog, initLoadDialogControls } from './ui-load.js';
import { getAllExternalData, getAllTracks, getAllPhotos } from './db.js';
import { displayExternalGeoJSON, displayAllTracks } from './map.js';
import { exportToKmz } from './kmz-handler.js';

/**
 * アプリケーション初期化
 */
async function initApp() {
    // 時計と設定の初期化
    initClock();
    initSettings();

    // Firebase匿名認証
    try {

        await firebase.auth().signInAnonymously();
        const user = firebase.auth().currentUser;

        state.setFirebaseAuthReady(true);
    } catch (authError) {
        console.error('Firebase匿名認証エラー:', authError);

        if (authError.code === 'auth/configuration-not-found') {
            console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.warn('Firebase Authentication が有効化されていません');
            console.warn('GPS記録とローカル保存は正常に動作します');
            console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }

        state.setFirebaseAuthReady(false);
    }

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
            // import { displayAllTracks } from './map.js'; が必要だが、
            // app-main.jsの冒頭でimportを追加する必要がある。
            // ここでは関数が使えることを前提に記述し、別途importを追加する修正を行うか、
            // あるいはこのブロック内で動的にimportするか...
            // いや、replace_file_contentでimport文も同時に修正するのがベスト。
            // しかしAllowMultiple=trueなら可能。

            // displayAllTracksはmap.jsからエクスポートされている必要がある。
            // 先ほどの修正で追加した。
            displayAllTracks(allTracks);

            // 最後の位置情報を復元（カメラ移動）
            // initMapでやっているが、トラック表示後に合わせるならfitBoundsも検討
            // 今回はinitMapの挙動（現在地または保存されたラスト位置）を優先
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
 * イベントリスナーを設定
 */
function setupEventListeners() {
    // メインコントロール
    document.getElementById('startBtn').addEventListener('click', startTracking);
    document.getElementById('stopBtn').addEventListener('click', stopTracking);
    document.getElementById('photoBtn').addEventListener('click', takePhoto);

    // カメラUI
    document.getElementById('cameraCloseBtn').addEventListener('click', closeCameraDialog);
    document.getElementById('cameraShutterBtn').addEventListener('click', capturePhoto);
    document.getElementById('cameraBackBtn').addEventListener('click', closeCameraDialog);
    document.getElementById('cameraTextBtn').addEventListener('click', handleTextButton);
    document.getElementById('cameraCloseAfterShotBtn').addEventListener('click', closeCameraDialog);

    // 方向ボタン
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            savePhotoWithDirection(btn.dataset.direction);
        });
    });

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

    // Repurposed Load Button to toggle load options
    const dataReloadBtn = document.getElementById('dataReloadBtn');
    if (dataReloadBtn) {
        dataReloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const loadOptionsRow = document.getElementById('loadOptionsRow');
            const saveOptionsRow = document.getElementById('saveOptionsRow');

            if (loadOptionsRow.classList.contains('hidden')) {
                loadOptionsRow.classList.remove('hidden');
                // Hide save options if open
                if (saveOptionsRow) saveOptionsRow.classList.add('hidden');
            } else {
                loadOptionsRow.classList.add('hidden');
            }
        });
    }

    // Cloud Load Button
    const cloudLoadBtn = document.getElementById('cloudLoadBtn');
    if (cloudLoadBtn) {
        cloudLoadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Reuse existing load dialog logic
            showLoadSelectionDialog();
        });
    }

    // KMZ Load Button
    const kmzLoadBtn = document.getElementById('kmzLoadBtn');
    if (kmzLoadBtn) {
        kmzLoadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Trigger hidden file input for KMZ import
            let fileInput = document.getElementById('kmzFileInput');
            if (!fileInput) {
                fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.id = 'kmzFileInput';
                fileInput.accept = '.kmz,.kml';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                fileInput.addEventListener('change', async (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        try {
                            const { importKmz } = await import('./kmz-handler.js');
                            await importKmz(file);
                            alert('KMZ loaded successfully');
                        } catch (err) {
                            console.error('Error importing KMZ:', err);
                            alert('Failed to import KMZ: ' + err.message);
                        }
                        // Reset input
                        fileInput.value = '';
                    }
                });
            }
            fileInput.click();
        });
    }

    // New Cloud Save Button
    document.getElementById('cloudSaveBtn').addEventListener('click', async () => {
        const defaultName = `RouteLog_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
        const docName = await showDocNameDialog(defaultName);

        if (docName) {
            await saveToFirebase(docName);
        }
        returnToMainControl();
    });

    // New KMZ Save Button
    document.getElementById('kmzSaveBtn').addEventListener('click', async () => {
        const defaultName = `RouteLog_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
        const docName = await showDocNameDialog(defaultName);

        if (docName) {
            try {
                const tracks = await getAllTracks();
                const photos = await getAllPhotos();
                await exportToKmz(tracks, photos, docName);
            } catch (e) {
                console.error('エクスポートエラー:', e);
                alert('エクスポートに失敗しました: ' + e.message);
            }
        }
        returnToMainControl();
    });

    // Legacy Save Button (Now used to toggle Save Options Row)
    const dataSaveBtn = document.getElementById('dataSaveBtn');
    if (dataSaveBtn) {
        dataSaveBtn.addEventListener('click', () => {
            const saveOptionsRow = document.getElementById('saveOptionsRow');
            const loadOptionsRow = document.getElementById('loadOptionsRow');

            if (saveOptionsRow) {
                if (saveOptionsRow.classList.contains('hidden')) {
                    saveOptionsRow.classList.remove('hidden');
                    // Hide load options if open
                    if (loadOptionsRow) loadOptionsRow.classList.add('hidden');
                } else {
                    saveOptionsRow.classList.add('hidden');
                }
            }
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
    // Photo Viewer Navigation
    initPhotoViewerControls();

    // Load Selection Dialog Controls
    initLoadDialogControls();
}

/**
 * Dataパネルの表示を切り替え
 */
function toggleDataPanel() {
    const dataPanel = document.getElementById('dataPanel');

    if (dataPanel.classList.contains('hidden')) {
        dataPanel.classList.remove('hidden');
        // Reset save options to hidden when opening panel
        const saveOptionsRow = document.getElementById('saveOptionsRow');
        if (saveOptionsRow) {
            saveOptionsRow.classList.add('hidden');
        }
        const loadOptionsRow = document.getElementById('loadOptionsRow');
        if (loadOptionsRow) {
            loadOptionsRow.classList.add('hidden');
        }
        if (saveOptionsRow) {
            saveOptionsRow.classList.add('hidden');
        }
        if (loadOptionsRow) {
            loadOptionsRow.classList.add('hidden');
        }
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

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS: Startボタンクリック時に許可を要求

    } else {
        // Android等
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);

    }
}

/**
 * Service Workerを登録
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {

            })
            .catch(error => {

            });
    }
}

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', initApp);
