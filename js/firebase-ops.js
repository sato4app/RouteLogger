// RouteLogger - Firebase操作

import { STORE_TRACKS, STORE_PHOTOS } from './config.js';
import * as state from './state.js';
import { formatPositionData, base64ToBlob, calculateTrackStats, calculateHeading } from './utils.js';
import { getAllTracks, getAllPhotos, initIndexedDB, clearIndexedDBSilent } from './db.js';
import { clearMapData, addStartMarker, addEndMarker, removeCurrentMarker, displayPhotoMarkers } from './map.js';
import { updateStatus, showDocNameDialog, showDocumentListDialog, showPhotoFromMarker, closeDocumentListDialog } from './ui.js';

/**
 * IndexedDBのデータをFirebaseに保存
 */
export async function saveToFirebase() {
    if (!state.trackingStartTime) {
        alert('追跡データがありません。先にGPS追跡を開始してください。');
        return;
    }

    try {
        updateStatus('Firebaseに保存中...');

        const currentUser = firebase.auth().currentUser;
        console.log('Firebase認証状態:', currentUser ? 'ログイン済み' : '未ログイン');

        const baseProjectName = await showDocNameDialog(state.trackingStartTime);
        if (!baseProjectName) {
            updateStatus('保存をキャンセルしました');
            return;
        }

        const firestoreDb = firebase.firestore();
        const projectName = await getUniqueProjectName(firestoreDb, baseProjectName);
        if (!projectName) return; // Cancelled or error

        console.log('保存するプロジェクト名:', projectName);

        // データ取得
        const allTracks = await getAllTracks();
        const allPhotos = await getAllPhotos();

        console.log('取得したデータ:', { tracks: allTracks.length, photos: allPhotos.length });

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

        // プロジェクトデータを保存
        const projectRef = firestoreDb.collection('projects').doc(projectName);
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
        alert(`Firebaseに保存しました\nプロジェクト名: ${projectName}\n記録点数: ${trackStats.totalPoints}件\n写真: ${allPhotos.length}件`);

    } catch (error) {
        console.error('Firebase保存エラー:', error);
        updateStatus('Firebase保存エラー');
        alert('Firebaseへの保存に失敗しました: ' + error.message);
    }
}

/**
 * Firebaseからドキュメント一覧を取得して表示
 */
export async function reloadFromFirebase() {
    try {
        updateStatus('ドキュメント一覧を取得中...');

        const firestoreDb = firebase.firestore();
        const querySnapshot = await firestoreDb.collection('projects').orderBy('createdAt', 'desc').get();

        if (querySnapshot.empty) {
            alert('保存されたドキュメントがありません');
            updateStatus('ドキュメントなし');
            return;
        }

        const documents = [];
        querySnapshot.forEach(doc => {
            documents.push({ id: doc.id, data: doc.data() });
        });

        showDocumentListDialog(documents, loadDocument);
        updateStatus('ドキュメント一覧取得完了');
    } catch (error) {
        console.error('ドキュメント取得エラー:', error);
        alert('ドキュメントの取得に失敗しました: ' + error.message);
        updateStatus('ドキュメント取得エラー');
    }
}

/**
 * 選択したドキュメントを読み込んで地図に表示
 * @param {Object} doc - ドキュメント
 */
export async function loadDocument(doc) {
    try {
        updateStatus('データを読み込み中...');
        closeDocumentListDialog();

        const data = doc.data;

        await clearIndexedDBSilent();
        console.log('Reload前にIndexedDBをクリアしました');

        if (!state.db) {
            await initIndexedDB();
        }

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
        alert(`データを読み込みました\nドキュメント名: ${doc.id}\n記録点数: ${trackStats.totalPoints}件\n写真: ${actualPhotos.length}枚`);

    } catch (error) {
        console.error('ドキュメント読み込みエラー:', error);
        alert('データの読み込みに失敗しました: ' + error.message);
        updateStatus('データ読み込みエラー');
    }
}

/**
 * Official Pointsを読み込んで地図に表示
 */
export async function loadOfficialPoints() {
    try {
        updateStatus('Official Pointsを読み込み中...');
        const firestoreDb = firebase.firestore();

        // projects/OfficialPoints ドキュメントを取得
        const docRef = firestoreDb.collection('projects').doc('OfficialPoints');
        const doc = await docRef.get();

        if (!doc.exists) {
            alert('Official Pointsドキュメントが見つかりませんでした');
            updateStatus('Official Pointsなし');
            return;
        }

        const data = doc.data();
        let count = 0;

        // data.points (Array) を展開
        if (data.points && Array.isArray(data.points)) {
            data.points.forEach(pointData => {
                let pId, pName, lat, lng;

                if (Array.isArray(pointData)) {
                    // 配列形式: [ID, Name, Lat, Lng, Elev]
                    pId = pointData[0];
                    pName = pointData[1];
                    lat = parseFloat(pointData[2]);
                    lng = parseFloat(pointData[3]);
                } else {
                    // オブジェクト形式
                    pId = pointData.pointID || pointData.id || pointData['ポイントID'];
                    pName = pointData.name || pointData['名称'];
                    lat = parseFloat(pointData.latitude || pointData.lat || pointData['緯度']);
                    lng = parseFloat(pointData.longitude || pointData.lng || pointData['経度']);
                }

                if (!isNaN(lat) && !isNaN(lng) && state.map) {
                    const marker = L.circleMarker([lat, lng], {
                        radius: 8,
                        color: '#4CAF50', // Green
                        fillColor: '#4CAF50',
                        fillOpacity: 0.8,
                        weight: 1,
                        interactive: true
                    });

                    const popupContent = `
                        <div style="text-align: left; font-family: sans-serif;">
                            <strong>${pId || ''}</strong><br>
                            ${pName || ''}
                        </div>
                    `;
                    marker.bindPopup(popupContent);

                    marker.addTo(state.map);
                    state.addOfficialMarker(marker);
                    count++;
                }
            });
        }

        console.log(`Official Pointsを${count}件表示しました`);
        updateStatus(`Official Points: ${count}件表示`);

    } catch (error) {
        console.error('Official Points読み込みエラー:', error);
        alert('Official Pointsの読み込みに失敗しました: ' + error.message);
        updateStatus('読み込みエラー');
    }
}

// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

/**
 * プロジェクト名の重複をチェックし、一意な名前を生成
 * @param {Object} firestoreDb 
 * @param {string} baseName 
 * @returns {Promise<string>}
 */
async function getUniqueProjectName(firestoreDb, baseName) {
    let finalProjectName = baseName;
    let counter = 2;

    while (true) {
        const checkRef = firestoreDb.collection('projects').doc(finalProjectName);
        const existingDoc = await checkRef.get();

        if (!existingDoc.exists) break;

        console.log(`プロジェクト名 "${finalProjectName}" は既に存在します。連番を付けます。`);
        finalProjectName = `${baseName}_${counter}`;
        counter++;

        if (counter > 100) {
            alert('プロジェクト名の連番が100を超えました。別の名前を使用してください。');
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
                const photoPath = `projects/${projectName}/photos/${timestamp}.jpg`;

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
