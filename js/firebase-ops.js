// RouteLogger - Firebase操作

import { STORE_TRACKS, STORE_PHOTOS } from './config.js';
import * as state from './state.js';
import { formatPositionData, base64ToBlob, calculateTrackStats, calculateHeading } from './utils.js';
import { getAllTracks, getAllPhotos, initIndexedDB, clearRouteLogData, getDataCounts } from './db.js';
import { clearMapData, addStartMarker, addEndMarker, removeCurrentMarker, displayPhotoMarkers } from './map.js';
import { updateStatus, showDocNameDialog, showDocumentListDialog, showPhotoFromMarker, closeDocumentListDialog, setUiBusy } from './ui.js';

/**
 * IndexedDBのデータをFirebaseに保存
 * @param {string} [providedName] - 指定されたドキュメント名 (Optional)
 */
export async function saveToFirebase(providedName) {
    if (!state.trackingStartTime) {
        alert('記録データがありません。先にGPS記録を開始してください。');
        return;
    }

    try {
        setUiBusy(true);
        updateStatus('Firebaseに保存中...');

        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.warn('ユーザーが認証されていません');
            updateStatus('認証エラー: 保存できません');
            alert('認証されていません。ページを再読み込みしてください。');
            return;
        }

        let baseProjectName = providedName;
        if (!baseProjectName) {
            baseProjectName = await showDocNameDialog(state.trackingStartTime);
        }

        if (!baseProjectName) {
            updateStatus('保存をキャンセルしました');
            return;
        }

        const firestoreDb = firebase.firestore();
        const projectName = await getUniqueProjectName(firestoreDb, baseProjectName);
        if (!projectName) return; // Cancelled or error



        // データ取得
        const allTracks = await getAllTracks();
        const allPhotos = await getAllPhotos();



        const storage = firebase.storage();

        // 写真アップロード
        const { formattedPhotos, uploadSuccessCount, uploadFailCount } = await uploadPhotosToStorage(storage, projectName, allPhotos);

        if (uploadFailCount > 0) {
            alert(`写真アップロード: ${uploadSuccessCount}件成功、${uploadFailCount}件失敗`);
        }

        updateStatus('Firestoreに保存中...');

        // トラックデータ変換
        const formattedTracks = allTracks.map(track => ({
            timestamp: track.timestamp,
            points: track.points.map(point => formatPositionData(point)),
            totalPoints: track.totalPoints
        }));

        // ルートデータを保存
        const projectRef = firestoreDb.collection('tracks').doc(projectName);
        const projectData = {
            userId: currentUser ? currentUser.uid : null,
            startTime: state.trackingStartTime,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            tracks: formattedTracks,
            photos: formattedPhotos,
            tracksCount: allTracks.length,
            photosCount: allPhotos.length
        };

        await projectRef.set(projectData);

        const trackStats = calculateTrackStats(allTracks);
        updateStatus('Firebase保存完了');
        alert(`Firebaseに保存しました\nルート名: ${projectName}\n記録点数: ${trackStats.totalPoints}件\n写真: ${allPhotos.length}件`);

    } catch (error) {
        console.error('Firebase保存エラー:', error);
        updateStatus('Firebase保存エラー');
        alert('Firebaseへの保存に失敗しました: ' + error.message);
    } finally {
        setUiBusy(false);
    }
}

/**
 * Firebaseからドキュメント一覧を取得して表示
 */
export async function reloadFromFirebase() {
    try {
        setUiBusy(true);
        updateStatus('ドキュメント一覧を取得中...');

        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.warn('ユーザーが認証されていません');
            updateStatus('認証エラー: 再読み込みしてください');
            alert('認証されていません。ページを再読み込みしてください。');
            return;
        }

        const firestoreDb = firebase.firestore();
        // インデックス未作成によるエラーを回避するため、orderByを使用せずに取得
        const querySnapshot = await firestoreDb.collection('tracks').get();

        if (querySnapshot.empty) {
            alert('保存されたドキュメントがありません');
            updateStatus('ドキュメントなし');
            return;
        }

        const documents = [];
        querySnapshot.forEach(doc => {
            documents.push({ id: doc.id, data: doc.data() });
        });

        // クライアント側で降順ソート
        documents.sort((a, b) => {
            const dateA = a.data.createdAt && typeof a.data.createdAt.toMillis === 'function' ? a.data.createdAt.toMillis() : 0;
            const dateB = b.data.createdAt && typeof b.data.createdAt.toMillis === 'function' ? b.data.createdAt.toMillis() : 0;
            return dateB - dateA;
        });

        showDocumentListDialog(documents, loadDocument);
        updateStatus('ドキュメント一覧取得完了');
    } catch (error) {
        console.error('ドキュメント取得エラー:', error);
        alert('ドキュメントの取得に失敗しました: ' + error.message);
        updateStatus('ドキュメント取得エラー');
    } finally {
        setUiBusy(false);
    }
}

/**
 * 選択したドキュメントを読み込んで地図に表示
 * @param {Object} doc - ドキュメント
 */
export async function loadDocument(doc) {
    try {
        setUiBusy(true);
        updateStatus('データを読み込み中...');
        closeDocumentListDialog();

        const data = doc.data;

        if (!state.db) {
            await initIndexedDB();
        }

        // ログ出力
        try {
            const counts = await getDataCounts();
            console.log(`[DB Status (Pre-Load)] Tracks: ${counts.tracks}, Photos: ${counts.photos}, Externals: ${counts.externals}, External Photos: ${counts.externalPhotos}`);
        } catch (e) {
            console.error('[DB Status] Error getting counts:', e);
        }

        await clearRouteLogData();

        clearMapData();

        // トラックデータを保存して表示
        if (data.tracks && data.tracks.length > 0) {
            await restoreTracks(data.tracks, state.db);
        }

        // 写真をダウンロードして保存・表示
        if (data.photos && data.photos.length > 0) {
            await restorePhotos(data.photos, state.db);
        }

        await displayPhotoMarkers(showPhotoFromMarker);

        // Saveボタンを無効化
        document.getElementById('dataSaveBtn').disabled = true;

        const trackStats = data.tracks ? calculateTrackStats(data.tracks) : { trackCount: 0, totalPoints: 0 };
        const actualPhotos = await getAllPhotos();

        updateStatus(`データを読み込みました:\n${doc.id}`);

        try {
            const counts = await getDataCounts();
            console.log(`[DB Status] Tracks: ${counts.tracks}, Photos: ${counts.photos}, Externals: ${counts.externals}, External Photos: ${counts.externalPhotos}`);
        } catch (e) {
            console.error('[DB Status] Error getting counts:', e);
        }

        alert(`データを読み込みました\nドキュメント名: ${doc.id}\n記録点数: ${trackStats.totalPoints}件\n写真: ${actualPhotos.length}枚`);

    } catch (error) {
        console.error('ドキュメント読み込みエラー:', error);
        alert('データの読み込みに失敗しました: ' + error.message);
        updateStatus('データ読み込みエラー');
    } finally {
        setUiBusy(false);
    }
}



// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

/**
 * ルート名の重複をチェックし、一意な名前を生成
 * @param {Object} firestoreDb 
 * @param {string} baseName 
 * @returns {Promise<string>}
 */
async function getUniqueProjectName(firestoreDb, baseName) {
    let finalProjectName = baseName;
    let counter = 2;

    while (true) {
        try {
            // インデックス未作成エラーを回避するため、doc().get()ではなくQueryを使用
            const querySnapshot = await firestoreDb.collection('tracks')
                .where(firebase.firestore.FieldPath.documentId(), '==', finalProjectName)
                .get();

            if (querySnapshot.empty) break;
        } catch (error) {
            console.warn('重複チェックエラー (スキップして続行します):', error);
            // エラーが出た場合は、重複していないとみなして進む（または安全策で連番にするなど）
            // ここでは一旦そのまま進む
            if (error.code === 'permission-denied') {
                // 権限エラーでも一旦breakして保存を試みる（書き込みで失敗するならそれはそれで正しい）
                break;
            }
            break;
        }


        finalProjectName = `${baseName}_${counter}`;
        counter++;

        if (counter > 100) {
            alert('ルート名の連番が100を超えました。別の名前を使用してください。');
            updateStatus('保存をキャンセルしました');
            return null;
        }
    }
    return finalProjectName;
}

/**
 * 写真をStorageにアップロード
 * @param {Object} storage 
 * @param {string} projectName 
 * @param {Array} photos 
 * @returns {Promise<Object>}
 */
async function uploadPhotosToStorage(storage, projectName, photos) {
    const formattedPhotos = [];
    let uploadSuccessCount = 0;
    let uploadFailCount = 0;
    const currentUser = firebase.auth().currentUser;

    if (!currentUser && photos.length > 0) {
        console.warn(`認証されていないため、${photos.length}件の写真アップロードをスキップします。`);
        return { formattedPhotos, uploadSuccessCount: 0, uploadFailCount: photos.length };
    }

    if (photos.length > 0) {
        updateStatus(`写真をアップロード中... (0/${photos.length})`);

        for (let i = 0; i < photos.length; i++) {
            const photo = photos[i];

            try {
                const blob = base64ToBlob(photo.data);
                const timestamp = new Date(photo.timestamp).getTime();
                const photoPath = `tracks/${projectName}/photos/${timestamp}.jpg`;

                const storageRef = storage.ref(photoPath);
                await storageRef.put(blob, {
                    contentType: 'image/jpeg',
                    customMetadata: {
                        timestamp: photo.timestamp,
                        lat: photo.location?.lat?.toString() || '',
                        lng: photo.location?.lng?.toString() || ''
                    }
                });

                const downloadURL = await storageRef.getDownloadURL();

                formattedPhotos.push({
                    url: downloadURL,
                    storagePath: photoPath,
                    timestamp: photo.timestamp,
                    direction: photo.direction || null,
                    location: formatPositionData(photo.location),
                    text: photo.text || null
                });

                uploadSuccessCount++;
                updateStatus(`写真をアップロード中... (${i + 1}/${photos.length})`);
            } catch (uploadError) {
                uploadFailCount++;
                console.error(`写真 ${i + 1} のアップロードエラー:`, uploadError);
                if (uploadFailCount === 1) { // 最初のエラーだけアラート表示
                    alert(`写真アップロードエラー: ${uploadError.message}`);
                }
            }
        }
    }

    return { formattedPhotos, uploadSuccessCount, uploadFailCount };
}

/**
 * トラックデータを復元して地図に表示
 * @param {Array} tracks 
 * @param {IDBDatabase} db 
 */
async function restoreTracks(tracks, db) {
    const allPoints = [];

    for (const track of tracks) {
        try {
            const transaction = db.transaction([STORE_TRACKS], 'readwrite');
            const store = transaction.objectStore(STORE_TRACKS);

            await new Promise((resolve, reject) => {
                const request = store.add(track);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            if (track.points) {
                track.points.forEach(point => {
                    allPoints.push([point.lat, point.lng]);
                });
            }
        } catch (trackError) {
            console.error('トラック保存エラー:', trackError);
        }
    }

    if (allPoints.length > 0) {
        // パス描画
        state.trackingPath.setLatLngs(allPoints);
        state.map.setView(allPoints[0], 15);

        // 開始地点マーカー
        const startPoint = allPoints[0];
        addStartMarker(startPoint[0], startPoint[1]);

        // 終了地点（現在地点）マーカー
        const endPoint = allPoints[allPoints.length - 1];

        // 方角計算
        const historyPointsObj = allPoints.map(p => ({ lat: p[0], lng: p[1] }));
        const endPointObj = { lat: endPoint[0], lng: endPoint[1] };
        const heading = calculateHeading(endPointObj, historyPointsObj);

        removeCurrentMarker();
        addEndMarker(endPoint[0], endPoint[1], heading);
    }
}

/**
 * 写真データを復元
 * @param {Array} photosData 
 * @param {IDBDatabase} db 
 */
async function restorePhotos(photosData, db) {
    updateStatus(`写真をダウンロード中... (0/${photosData.length})`);

    const storage = firebase.storage();

    for (let i = 0; i < photosData.length; i++) {
        const photoData = photosData[i];

        try {
            let base64;

            if (photoData.storagePath) {
                const storageRef = storage.ref(photoData.storagePath);
                const downloadURL = await storageRef.getDownloadURL();
                base64 = await downloadImageAsBase64(downloadURL);
            } else if (photoData.url) {
                base64 = await downloadImageAsBase64(photoData.url);
            } else {
                continue;
            }

            if (!base64) continue;

            const photoRecord = {
                data: base64,
                timestamp: photoData.timestamp,
                direction: photoData.direction || null,
                location: photoData.location,
                text: photoData.text || null
            };

            const transaction = db.transaction([STORE_PHOTOS], 'readwrite');
            const store = transaction.objectStore(STORE_PHOTOS);

            await new Promise((resolve, reject) => {
                const request = store.add(photoRecord);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            updateStatus(`写真をダウンロード中... (${i + 1}/${photosData.length})`);
        } catch (downloadError) {
            console.error(`写真 ${i + 1} のダウンロードエラー:`, downloadError);
        }
    }
}

/**
 * 画像URLからBase64を取得
 * @param {string} url 
 * @returns {Promise<string>}
 */
function downloadImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };

        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
        img.src = url;
    });
}
