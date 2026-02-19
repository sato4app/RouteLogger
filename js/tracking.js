// RouteLogger - GPS追跡関連

import { GPS_RECORD_INTERVAL_SEC, GPS_RECORD_DISTANCE_M } from './config.js';
import * as state from './state.js';
import { calculateDistance, formatDateTime } from './utils.js';
import { initIndexedDB, getAllTracks, getAllPhotos, clearRouteLogData, saveLastPosition, saveTrackingDataRealtime, createInitialTrack } from './db.js';
import { calculateTrackStats, calculateHeading } from './utils.js';
import { updateCurrentMarker, updateTrackingPath, clearMapData, addStartMarker } from './map.js';
import { updateStatus, updateCoordinates, updateDataSizeIfOpen, showClearDataDialog, updateUiForTrackingState } from './ui.js';

/**
 * Wake Lockを取得（画面スリープ防止）
 * @returns {Promise<boolean>}
 */
export async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            const lock = await navigator.wakeLock.request('screen');
            state.setWakeLock(lock);


            lock.addEventListener('release', () => {

            });

            return true;
        } else {
            console.warn('このブラウザはWake Lock APIに対応していません');
            return false;
        }
    } catch (err) {
        console.error('Wake Lock取得エラー:', err);
        return false;
    }
}

/**
 * Wake Lockを解放
 */
export async function releaseWakeLock() {
    if (state.wakeLock !== null) {
        try {
            await state.wakeLock.release();
            state.setWakeLock(null);

        } catch (err) {
            console.error('Wake Lock解放エラー:', err);
        }
    }
}

/**
 * ページの可視性が変化した時の処理
 */
export async function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && state.isTracking) {

        await requestWakeLock();
    }
}

/**
 * デバイスの方角を取得
 * @param {DeviceOrientationEvent} event
 */
export function handleDeviceOrientation(event) {
    let heading = null;

    if (event.webkitCompassHeading !== undefined) {
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        heading = 360 - event.alpha;
    }

    if (heading !== null) {
        state.setCurrentHeading(heading);
        if (state.currentMarker) {
            updateCurrentMarker(
                state.currentMarker.getLatLng().lat,
                state.currentMarker.getLatLng().lng,
                heading
            );
        }
    }
}

/**
 * GPS位置の更新処理
 * @param {GeolocationPosition} position
 */
export async function updatePosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const altitude = position.coords.altitude;
    const accuracy = position.coords.accuracy;
    const altitudeAccuracy = position.coords.altitudeAccuracy;
    const currentTime = Date.now();

    if (position.coords.heading !== null && position.coords.heading !== undefined) {
        state.setCurrentHeading(position.coords.heading);
    }

    let currentDist = 0;
    let currentTimeDiff = 0;

    if (state.isTracking && state.lastRecordedPoint) {
        currentTimeDiff = (currentTime - state.lastRecordedPoint.time) / 1000;
        currentDist = calculateDistance(
            state.lastRecordedPoint.lat, state.lastRecordedPoint.lng,
            lat, lng
        );
    }


    updateCurrentMarker(lat, lng, state.currentHeading);

    updateCoordinates(lat, lng, accuracy, currentDist, currentTimeDiff);

    // 記録中は地図を現在地に追従
    if (state.isTracking && state.map) {
        state.map.panTo([lat, lng], { animate: true });
    }

    if (state.isTracking) {
        let shouldRecord = false;

        if (state.lastRecordedPoint === null) {
            shouldRecord = true;
        } else {
            const elapsedSeconds = (currentTime - state.lastRecordedPoint.time) / 1000;
            const distance = calculateDistance(
                state.lastRecordedPoint.lat, state.lastRecordedPoint.lng,
                lat, lng
            );

            // 60秒以上経過、または20m以上移動した場合に記録
            // ただし、距離条件はGPS精度より大きい移動のみ有効とする
            // かつ、最低でも5秒は間隔を空ける（高頻度記録防止）
            const significantMovement = distance >= GPS_RECORD_DISTANCE_M && distance > accuracy;
            const isMinIntervalPassed = elapsedSeconds >= 5;

            if (isMinIntervalPassed && (elapsedSeconds >= GPS_RECORD_INTERVAL_SEC || significantMovement)) {
                shouldRecord = true;
            }
        }

        if (shouldRecord) {
            const recordedPoint = {
                lat: parseFloat(lat.toFixed(5)),
                lng: parseFloat(lng.toFixed(5)),
                altitude: altitude !== null ? parseFloat(altitude.toFixed(1)) : null,
                timestamp: new Date().toISOString(),
                accuracy: parseFloat(accuracy.toFixed(1)),
                altitudeAccuracy: altitudeAccuracy !== null ? parseFloat(altitudeAccuracy.toFixed(1)) : null
            };

            state.addTrackingPoint(recordedPoint);

            // 初回記録時（Start Point）にマーカー追加
            if (state.trackingData.length === 1) {
                addStartMarker(lat, lng);
            }

            // UI更新（DB保存より先に行う）
            updateTrackingPath(state.trackingData);
            const totalPoints = state.previousTotalPoints + state.trackingData.length;
            updateStatus(`GPS記録中 (${totalPoints}点記録)`);
            updateDataSizeIfOpen();

            state.setLastRecordedPoint({
                lat: lat,
                lng: lng,
                time: currentTime
            });

            try {
                if (state.db) {
                    await saveTrackingDataRealtime();

                }
            } catch (saveError) {
                console.error('GPS位置のIndexedDB保存エラー:', saveError);
            }
        } else {
            // 記録しない場合のデバッグログ
            if (state.lastRecordedPoint) {
                const elapsedSeconds = (currentTime - state.lastRecordedPoint.time) / 1000;
                const distance = calculateDistance(
                    state.lastRecordedPoint.lat, state.lastRecordedPoint.lng,
                    lat, lng
                );

            }
        }
    }
}

/**
 * GPSエラー処理
 * @param {GeolocationPositionError} error
 */
export function handlePositionError(error) {
    let message = 'GPS取得エラー: ';
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message += '位置情報の使用が許可されていません';
            break;
        case error.POSITION_UNAVAILABLE:
            message += '位置情報が利用できません';
            break;
        case error.TIMEOUT:
            message += '位置情報の取得がタイムアウトしました';
            break;
        default:
            message += '不明なエラーが発生しました';
    }
    updateStatus(message);
    console.error('GPS Error:', error);
}

/**
 * GPS追跡を開始
 */
export async function startTracking() {
    if (!navigator.geolocation) {
        alert('このブラウザは位置情報に対応していません');
        return;
    }

    if (state.isTracking) return;

    // IndexedDB確認
    if (!state.db) {
        console.warn('IndexedDBが未初期化です。自動的に再初期化します...');
        try {
            await initIndexedDB();
            if (!state.db) throw new Error('IndexedDB初期化後もdb変数がnullです');
        } catch (initError) {
            console.error('IndexedDB初期化エラー:', initError);
            alert('データベースの初期化に失敗しました。ページを再読み込みしてください。');
            return;
        }
    }

    // 既存データの確認
    try {
        const allTracks = await getAllTracks();
        const allPhotos = await getAllPhotos();
        const trackStats = calculateTrackStats(allTracks);
        const hasData = (allTracks.length > 0 || allPhotos.length > 0);

        let confirmMessage;
        if (hasData) {
            confirmMessage =
                `IndexedDBに既存のデータがあります。\n` +
                `記録点数: ${trackStats.totalPoints}件\n` +
                `写真: ${allPhotos.length}件\n\n`;
        } else {
            confirmMessage = `新規記録を開始しますか？`;
        }

        const result = await showClearDataDialog(confirmMessage, hasData);

        if (result === 'init') {
            if (hasData) {
                clearMapData();
                await clearRouteLogData();

            }
        } else if (result === 'append') {

            state.setPreviousTotalPoints(trackStats.totalPoints);
        } else {

            return;
        }
    } catch (error) {
        console.error('データ確認エラー:', error);
        alert('データ確認中にエラーが発生しました: ' + error.message + '\nページを再読み込みしてください。');
        return;
    }

    state.setIsTracking(true);
    state.resetTrackingData();
    state.setPhotosInSession(0);
    state.setLastRecordedPoint(null);
    state.setPreviousTotalPoints(0);

    // UI更新 (ボタン状態など)
    updateUiForTrackingState();

    // 開始時刻を記録
    const now = new Date();
    state.setTrackingStartDate(now);
    state.setTrackingStartTime(formatDateTime(now));

    // 初期トラックを作成
    try {
        if (state.db) {
            const trackId = await createInitialTrack(state.trackingStartTime);
            state.setCurrentTrackId(trackId);

        }
    } catch (e) {
        console.error('初期トラック作成エラー:', e);
    }



    // Wake Lock取得
    await requestWakeLock();

    // iOS DeviceOrientation許可
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleDeviceOrientation, true);

            }
        } catch (error) {
            console.error('DeviceOrientation許可要求エラー:', error);
        }
    }

    // GPS監視開始
    const id = navigator.geolocation.watchPosition(
        updatePosition,
        handlePositionError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
    state.setWatchId(id);

    // UI更新
    // updateUiForTrackingState called above (Wait, I should call it here to be safe and clear)
    // Actually, I removed the earlier call.
    // However, isTracking is set to true at line 283.
    // So updateUiForTrackingState() will see isTracking=true.

    updateStatus('GPS記録を開始しました');
}

/**
 * GPS記録を停止
 */
export async function stopTracking() {
    if (!state.isTracking) return;

    state.setIsTracking(false);
    state.setTrackingStopDate(new Date());

    await releaseWakeLock();

    if (state.watchId !== null) {
        navigator.geolocation.clearWatch(state.watchId);
        state.setWatchId(null);
    }

    // UI更新
    updateUiForTrackingState();

    if (state.trackingData.length > 0) {
        const lastPoint = state.trackingData[state.trackingData.length - 1];
        await saveLastPosition(lastPoint.lat, lastPoint.lng, state.map.getZoom());
        await saveTrackingDataRealtime(); // 最終更新 (新規作成ではなく更新)
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS記録を停止しました (${totalPoints}点記録)`);
    } else {
        updateStatus('GPS記録を停止しました');
    }
}
