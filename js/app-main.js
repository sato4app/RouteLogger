// RouteLogger - メイン初期化

import * as state from './state.js';
import { initIndexedDB } from './db.js';
import { initMap, displayPhotoMarkers } from './map.js';
import { startTracking, stopTracking, handleVisibilityChange, handleDeviceOrientation } from './tracking.js';
import { takePhoto, closeCameraDialog, capturePhoto, savePhotoWithDirection, handleTextButton } from './camera.js';
import { saveToFirebase, reloadFromFirebase, loadOfficialPoints } from './firebase-ops.js';
import { updateStatus, showPhotoList, closePhotoList, closePhotoViewer, showDataSize, closeStatsDialog, closeDocumentListDialog, showPhotoFromMarker, initPhotoViewerControls } from './ui.js';

/**
 * アプリケーション初期化
 */
async function initApp() {
    // Firebase匿名認証
    try {
        console.log('Firebase匿名認証を開始...');
        await firebase.auth().signInAnonymously();
        const user = firebase.auth().currentUser;
        console.log('Firebase匿名認証成功 - UID:', user.uid);
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
        console.log('IndexedDB初期化完了');

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

    // 写真マーカー表示
    // prompt.mdの指示により初期表示を無効化
    // await displayPhotoMarkers(showPhotoFromMarker);

    // イベントリスナー設定
    setupEventListeners();

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

    // データ管理パネル
    document.getElementById('photoListBtn').addEventListener('click', async () => {
        await showPhotoList();
        returnToMainControl();
    });

    document.getElementById('dataSizeBtn').addEventListener('click', async () => {
        await showDataSize();
        returnToMainControl();
    });

    document.getElementById('dataReloadBtn').addEventListener('click', async () => {
        await reloadFromFirebase();
        returnToMainControl();
    });

    document.getElementById('dataSaveBtn').addEventListener('click', async () => {
        await saveToFirebase();
        returnToMainControl();
    });

    // Official Pointsロードボタン
    const loadOfficialBtn = document.getElementById('loadOfficialPointsBtn');
    if (loadOfficialBtn) {
        loadOfficialBtn.addEventListener('click', async () => {
            await loadOfficialPoints();
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

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS: Startボタンクリック時に許可を要求
        console.log('iOS: DeviceOrientation許可が必要です');
    } else {
        // Android等
        window.addEventListener('deviceorientation', handleDeviceOrientation, true);
        console.log('DeviceOrientation イベントリスナーを追加しました');
    }
}

/**
 * Service Workerを登録
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker登録成功:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker登録失敗:', error);
            });
    }
}

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', initApp);
