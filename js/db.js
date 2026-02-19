// RouteLogger - IndexedDB操作

import { DB_NAME, DB_VERSION, STORE_TRACKS, STORE_PHOTOS, STORE_SETTINGS, STORE_EXTERNALS, STORE_EXTERNAL_PHOTOS, DEFAULT_POSITION } from './config.js';
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
            console.log('[DB] IndexedDB initialized successfully');
            state.setDb(request.result);

            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            console.log('[DB] Upgrading IndexedDB...');
            const database = event.target.result;


            if (!database.objectStoreNames.contains(STORE_TRACKS)) {
                console.log(`[DB] Creating object store: ${STORE_TRACKS}`);
                const trackStore = database.createObjectStore(STORE_TRACKS, { keyPath: 'id', autoIncrement: true });
                trackStore.createIndex('timestamp', 'timestamp', { unique: false });

            }

            if (!database.objectStoreNames.contains(STORE_PHOTOS)) {
                console.log(`[DB] Creating object store: ${STORE_PHOTOS}`);
                const photoStore = database.createObjectStore(STORE_PHOTOS, { keyPath: 'id', autoIncrement: true });
                photoStore.createIndex('timestamp', 'timestamp', { unique: false });

            }

            if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
                console.log(`[DB] Creating object store: ${STORE_SETTINGS}`);
                database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
            }

            if (!database.objectStoreNames.contains(STORE_EXTERNALS)) {
                console.log(`[DB] Creating object store: ${STORE_EXTERNALS}`);
                database.createObjectStore(STORE_EXTERNALS, { keyPath: 'id', autoIncrement: true });
            }

            if (!database.objectStoreNames.contains(STORE_EXTERNAL_PHOTOS)) {
                console.log(`[DB] Creating object store: ${STORE_EXTERNAL_PHOTOS}`);
                const photoStore = database.createObjectStore(STORE_EXTERNAL_PHOTOS, { keyPath: 'id', autoIncrement: true });
                // インポートIDやファイル名で検索できるようにインデックスを作成（必要に応じて）
                photoStore.createIndex('importId', 'importId', { unique: false });
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

                    resolve(request.result);
                } else {

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
 * 写真を削除
 * @param {number} id - 写真ID
 * @returns {Promise<void>}
 */
export function deletePhoto(id) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const transaction = state.db.transaction([STORE_PHOTOS], 'readwrite');
        const store = transaction.objectStore(STORE_PHOTOS);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
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

            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * トラックデータを復元（インポート用）
 * @param {Object} trackData
 */
export function restoreTrack(trackData) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }
        const transaction = state.db.transaction([STORE_TRACKS], 'readwrite');
        const store = transaction.objectStore(STORE_TRACKS);
        // IDは自動採番されるので、timestamp等で管理
        // インポートデータにIDがあっても無視して新規採番推奨
        delete trackData.id;
        const request = store.add(trackData);
        request.onsuccess = () => resolve(request.result);
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
 * RouteLogデータのみクリア（tracks・photosのみ、externals・external_photosは保持）
 */
export async function clearRouteLogData() {
    if (!state.db) {
        throw new Error('データベースが初期化されていません');
    }
    console.log('[DB] Clearing RouteLog data (tracks, photos)...');
    console.log(`[DB] Preserving external data (${STORE_EXTERNALS}, ${STORE_EXTERNAL_PHOTOS})...`);

    const clearStore = (storeName) => new Promise((resolve, reject) => {
        console.log(`[DB] Clearing store: ${storeName}`);
        const transaction = state.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
    await clearStore(STORE_TRACKS);
    await clearStore(STORE_PHOTOS);
    state.setTrackingStartTime(null);
    state.resetTrackingData();
    console.log('[DB] RouteLog data cleared.');
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

        console.log('[DB] Deleting ENTIRE database (Silent Init)...');
        await new Promise((resolve) => {
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            deleteRequest.onsuccess = () => {
                console.log('[DB] Database deleted successfully.');
                resolve();
            };
            deleteRequest.onerror = () => {
                console.error('IndexedDB削除エラー:', deleteRequest.error);
                resolve(); // エラーでも初期化を続行
            };
            deleteRequest.onblocked = () => {
                console.warn('IndexedDB削除がブロックされました - 2秒後に続行');
                setTimeout(resolve, 2000);
            };
        });

        await initIndexedDB();


        if (lastPosition) {
            await saveLastPosition(lastPosition.lat, lastPosition.lng, lastPosition.zoom);

        } else {
            await saveLastPosition(DEFAULT_POSITION.lat, DEFAULT_POSITION.lng, DEFAULT_POSITION.zoom);

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

        console.log('[DB] Deleting ENTIRE database (User Initiated)...');
        deleteRequest.onsuccess = async () => {
            console.log('[DB] Database deleted successfully.');

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

/**
 * 外部データを保存
 * @param {string} type - データタイプ ('geojson'など)
 * @param {string} name - ファイル名
 * @param {Object} data - データ内容
 * @returns {Promise<number>} 保存されたID
 */
export function saveExternalData(type, name, data) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const externalData = {
            type: type,
            name: name,
            data: data,
            timestamp: new Date().toISOString()
        };

        const transaction = state.db.transaction([STORE_EXTERNALS], 'readwrite');
        const store = transaction.objectStore(STORE_EXTERNALS);
        const request = store.add(externalData);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * 全ての外部データを取得
 * @returns {Promise<Array>}
 */
export function getAllExternalData() {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            resolve([]); // DB未初期化時は空配列を返す
            return;
        }

        try {
            const transaction = state.db.transaction([STORE_EXTERNALS], 'readonly');
            const store = transaction.objectStore(STORE_EXTERNALS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        } catch (error) {
            console.warn('外部データ取得エラー:', error);
            resolve([]); // エラー時は空配列で続行
        }
    });
}

/**
 * 外部写真データを保存
 * @param {string} importId - インポートID
 * @param {string} fileName - ファイル名
 * @param {Blob} blob - 写真データ
 * @returns {Promise<number>} 保存されたID
 */
export function saveExternalPhoto(importId, fileName, blob) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const photoData = {
            importId: importId,
            fileName: fileName,
            blob: blob,
            timestamp: new Date().toISOString()
        };

        const transaction = state.db.transaction([STORE_EXTERNAL_PHOTOS], 'readwrite');
        const store = transaction.objectStore(STORE_EXTERNAL_PHOTOS);
        const request = store.add(photoData);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
/**
 * 外部写真データを取得
 * @param {string} importId - インポートID
 * @param {string} fileName - ファイル名
 * @returns {Promise<Blob|null>} 写真データ
 */
export function getExternalPhoto(importId, fileName) {
    return new Promise((resolve, reject) => {
        if (!state.db) {
            reject(new Error('データベースが初期化されていません'));
            return;
        }

        const transaction = state.db.transaction([STORE_EXTERNAL_PHOTOS], 'readonly');
        const store = transaction.objectStore(STORE_EXTERNAL_PHOTOS);
        const index = store.index('importId');
        const request = index.getAll(importId);

        request.onsuccess = () => {
            const results = request.result;
            if (results && results.length > 0) {
                const photo = results.find(p => p.fileName === fileName);
                if (photo) {
                    resolve(photo.blob);
                } else {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * 各ストアのデータ件数を取得
 * @returns {Promise<Object>}
 */
export async function getDataCounts() {
    if (!state.db) {
        console.warn('[DB] Database not initialized for counting');
        return { tracks: 0, photos: 0, externals: 0, externalPhotos: 0 };
    }

    const getCount = (storeName) => new Promise((resolve) => {
        try {
            const transaction = state.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => {
                console.warn(`[DB] Error counting ${storeName}:`, e);
                resolve(0);
            };
        } catch (e) {
            console.warn(`[DB] Store ${storeName} not found or error:`, e);
            resolve(0);
        }
    });

    try {
        const counts = {
            tracks: await getCount(STORE_TRACKS),
            photos: await getCount(STORE_PHOTOS),
            externals: await getCount(STORE_EXTERNALS),
            externalPhotos: await getCount(STORE_EXTERNAL_PHOTOS)
        };
        return counts;
    } catch (e) {
        console.error('[DB] Error getting counts:', e);
        return { tracks: 0, photos: 0, externals: 0, externalPhotos: 0 };
    }
}
