// RouteLogger - IndexedDB操作

import { DB_NAME, DB_VERSION, STORE_TRACKS, STORE_PHOTOS, STORE_SETTINGS, DEFAULT_POSITION } from './config.js';
import * as state from './state.js';

/**
 * IndexedDBを初期化
 * @returns {Promise<IDBDatabase>}
 */
export function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB接続エラー:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            state.setDb(request.result);
            console.log('IndexedDB接続成功');
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log('IndexedDBをアップグレード中...');

            if (!database.objectStoreNames.contains(STORE_TRACKS)) {
                const trackStore = database.createObjectStore(STORE_TRACKS, { keyPath: 'id', autoIncrement: true });
                trackStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('tracksストアを作成しました');
            }

            if (!database.objectStoreNames.contains(STORE_PHOTOS)) {
                const photoStore = database.createObjectStore(STORE_PHOTOS, { keyPath: 'id', autoIncrement: true });
                photoStore.createIndex('timestamp', 'timestamp', { unique: false });
                console.log('photosストアを作成しました');
            }

            if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
                database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                console.log('settingsストアを作成しました');
            }
        };
    });
}

/**
 * 最後の位置を保存
 */
export async function saveLastPosition(lat, lng, zoom) {
    if (!state.db) return;

    try {
        const transaction = state.db.transaction([STORE_SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORE_SETTINGS);
        const positionData = {
            key: 'lastPosition',
            lat: parseFloat(lat.toFixed(5)),
            lng: parseFloat(lng.toFixed(5)),
            zoom: zoom,
            timestamp: new Date().toISOString()
        };
        await store.put(positionData);
        console.log('最終位置を保存しました:', lat.toFixed(5), lng.toFixed(5));
    } catch (error) {
        console.error('位置保存エラー:', error);
    }
}

/**
 * 最後の位置を取得
 * @returns {Promise<Object|null>}
 */
export function getLastPosition() {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        try {
            const transaction = state.db.transaction([STORE_SETTINGS], 'readonly');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.get('lastPosition');

            request.onsuccess = () => {
                if (request.result) {
                    console.log('最終位置を取得しました:', request.result);
                    resolve(request.result);
                } else {
                    console.log('保存された位置がありません。デフォルト位置を使用します');
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('位置取得エラー:', request.error);
                reject(request.error);
            };
        } catch (error) {
            console.error('位置取得エラー:', error);
            reject(error);
        }
    });
}

/**
 * 全トラックデータを取得
 * @returns {Promise<Array>}
 */
export function getAllTracks() {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        try {
            const transaction = state.db.transaction([STORE_TRACKS], 'readonly');
            const store = transaction.objectStore(STORE_TRACKS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 全写真データを取得
 * @returns {Promise<Array>}
 */
export function getAllPhotos() {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        try {
            const transaction = state.db.transaction([STORE_PHOTOS], 'readonly');
            const store = transaction.objectStore(STORE_PHOTOS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}


/**
 * 写真を1件取得
 * @param {number} id - 写真ID
 * @returns {Promise<Object>} 写真データ
 */
export function getPhoto(id) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const transaction = state.db.transaction([STORE_PHOTOS], 'readonly');
        const store = transaction.objectStore(STORE_PHOTOS);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 写真をIndexedDBに保存
 * @param {Object} photoRecord - 写真データ
 * @returns {Promise<number>} 保存されたID
 */
export function savePhoto(photoRecord) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const transaction = state.db.transaction([STORE_PHOTOS], 'readwrite');
        const store = transaction.objectStore(STORE_PHOTOS);
        const request = store.add(photoRecord);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 写真をIndexedDBで更新
 * @param {Object} photoRecord - 更新する写真データ (idを含むこと)
 * @returns {Promise<number>} 更新されたID
 */
export function updatePhoto(photoRecord) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const transaction = state.db.transaction([STORE_PHOTOS], 'readwrite');
        const store = transaction.objectStore(STORE_PHOTOS);
        // IDが含まれていれば更新、なければ新規追加（ただし呼び出し側で通常IDを含める）
        const request = store.put(photoRecord);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * トラックの初期レコードを作成
 * @param {string} timestamp
 * @returns {Promise<number>} trackId
 */
export function createInitialTrack(timestamp) {
    if (!state.db) return Promise.reject(new Error('データベースが初期化されていません'));

    const trackData = {
        timestamp: timestamp,
        points: [],
        totalPoints: 0
    };

    return new Promise((resolve, reject) => {
        const transaction = state.db.transaction([STORE_TRACKS], 'readwrite');
        const store = transaction.objectStore(STORE_TRACKS);
        const request = store.add(trackData);

        request.onsuccess = () => {
            console.log('初期トラックを作成しました。ID:', request.result);
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * トラッキングデータをリアルタイム保存 (ID指定で更新)
 */
export async function saveTrackingDataRealtime() {
    if (!state.db) {
        console.error('データベースが初期化されていません');
        return;
    }

    if (!state.currentTrackId) {
        console.warn('トラックIDが設定されていません。保存をスキップします。');
        return;
    }

    const trackData = {
        id: state.currentTrackId,
        timestamp: state.trackingStartTime,
        points: state.trackingData,
        totalPoints: state.trackingData.length
    };

    try {
        const transaction = state.db.transaction([STORE_TRACKS], 'readwrite');
        const store = transaction.objectStore(STORE_TRACKS);

        await new Promise((resolve, reject) => {
            const request = store.put(trackData); // IDを指定して更新
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('リアルタイムデータ保存エラー:', error);
        throw error;
    }
}

/**
 * IndexedDBをサイレント初期化（Start時用）
 */
export async function clearIndexedDBSilent() {
    try {
        const lastPosition = await getLastPosition();

        if (state.db) {
            state.db.close();
            state.setDb(null);
        }

        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                await new Promise((resolve, reject) => {
                    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                    deleteRequest.onsuccess = () => {
                        console.log('IndexedDBを削除しました');
                        resolve();
                    };
                    deleteRequest.onerror = () => reject(deleteRequest.error);
                    deleteRequest.onblocked = () => {
                        console.warn(`IndexedDB削除がブロックされました (試行 ${retryCount + 1}/${maxRetries})`);
                        reject(new Error('データベースが使用中です'));
                    };
                });
                break;
            } catch (deleteError) {
                retryCount++;
                if (retryCount >= maxRetries) throw deleteError;
                console.log(`${200 * retryCount}ms 待機してリトライします...`);
                await new Promise(resolve => setTimeout(resolve, 200 * retryCount));
            }
        }

        await initIndexedDB();
        console.log('IndexedDB再初期化完了');

        const tracksAfter = await getAllTracks();
        const photosAfter = await getAllPhotos();
        console.log(`削除確認: トラック ${tracksAfter.length}件, 写真 ${photosAfter.length}件`);

        if (lastPosition) {
            await saveLastPosition(lastPosition.lat, lastPosition.lng, lastPosition.zoom);
            console.log('最後の記録地点を復元しました');
        } else {
            await saveLastPosition(DEFAULT_POSITION.lat, DEFAULT_POSITION.lng, DEFAULT_POSITION.zoom);
            console.log('デフォルト位置を設定しました');
        }

        state.setTrackingStartTime(null);
        state.resetTrackingData();

    } catch (error) {
        console.error('IndexedDB初期化エラー:', error);
        throw error;
    }
}

/**
 * IndexedDBを初期化（Clear機能）
 */
export async function clearIndexedDB() {
    if (!confirm('IndexedDBを初期化しますか？\n保存されているすべてのデータが削除されます。')) {
        return;
    }

    try {
        const lastPosition = await getLastPosition();

        if (state.db) {
            state.db.close();
            state.setDb(null);
        }

        const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

        deleteRequest.onsuccess = async () => {
            console.log('IndexedDBを削除しました');
            await initIndexedDB();

            if (lastPosition) {
                await saveLastPosition(lastPosition.lat, lastPosition.lng, lastPosition.zoom);
            } else {
                await saveLastPosition(DEFAULT_POSITION.lat, DEFAULT_POSITION.lng, DEFAULT_POSITION.zoom);
            }

            state.setTrackingStartTime(null);
            state.resetTrackingData();

            alert('IndexedDBを初期化しました');
        };

        deleteRequest.onerror = () => {
            console.error('IndexedDB削除エラー:', deleteRequest.error);
            alert('IndexedDBの削除に失敗しました');
        };

        deleteRequest.onblocked = () => {
            console.warn('IndexedDB削除がブロックされました');
            alert('データベースが使用中です。他のタブを閉じてから再度お試しください。');
        };
    } catch (error) {
        console.error('IndexedDB初期化エラー:', error);
        alert('IndexedDBの初期化に失敗しました: ' + error.message);
    }
}
