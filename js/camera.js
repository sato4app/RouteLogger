// RouteLogger - カメラ・写真関連

let currentPhotoText = '';

import { PHOTO_WIDTH, PHOTO_HEIGHT, PHOTO_QUALITY } from './config.js';
import * as state from './state.js';
import { savePhoto, updatePhoto, getPhoto, deletePhoto } from './db.js';
import { addPhotoMarkerToMap, removePhotoMarker } from './map.js';
import { updateStatus, updateDataSizeIfOpen, showPhotoFromMarker } from './ui.js';

/**
 * 矢印スタンプを画像に描画
 * @param {string} base64Image - Base64画像データ
 * @param {string} direction - 方向（left/up/right）
 * @returns {Promise<string>} スタンプ済み画像のBase64
 */
export async function drawArrowStamp(base64Image, direction) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0);

            // 矢印スタンプを描画
            const arrowSize = Math.min(img.width, img.height) * 0.15;
            const centerX = img.width / 2;
            const bottomY = img.height - arrowSize * 1.5;

            // 白背景の円
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(centerX, bottomY, arrowSize * 0.7, 0, Math.PI * 2);
            ctx.fill();

            // 縁取り
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 3;
            ctx.stroke();

            // 矢印を描画
            ctx.save();
            ctx.translate(centerX, bottomY);

            if (direction === 'left') {
                ctx.rotate(-Math.PI / 4);
            } else if (direction === 'right') {
                ctx.rotate(Math.PI / 4);
            }

            const arrowWidth = arrowSize * 0.5;
            const arrowHeight = arrowSize * 0.6;

            ctx.strokeStyle = '#333';
            ctx.lineWidth = arrowSize * 0.12;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            ctx.moveTo(0, arrowHeight / 2);
            ctx.lineTo(0, -arrowHeight / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-arrowWidth / 2, -arrowHeight / 4);
            ctx.lineTo(0, -arrowHeight / 2);
            ctx.lineTo(arrowWidth / 2, -arrowHeight / 4);
            ctx.stroke();

            ctx.restore();

            const stampedImage = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
            resolve(stampedImage);
        };

        img.onerror = (error) => {
            console.error('画像読み込みエラー:', error);
            reject(error);
        };

        img.src = base64Image;
    });
}

/**
 * カメラを起動して写真撮影ダイアログを表示
 */
export async function takePhoto() {
    if (!state.db) {
        alert('データベースが初期化されていません');
        return;
    }

    try {
        updateStatus('カメラ起動中...');

        const cameraDialog = document.getElementById('cameraDialog');
        const cameraPreview = document.getElementById('cameraPreview');
        const capturedCanvas = document.getElementById('capturedCanvas');
        const captureButtons = document.getElementById('captureButtons');
        const directionButtons = document.getElementById('directionButtons');

        cameraDialog.classList.remove('hidden');
        cameraPreview.classList.remove('hidden');
        capturedCanvas.classList.add('hidden');
        captureButtons.classList.remove('hidden');
        directionButtons.classList.add('hidden');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });

        state.setCameraStream(stream);
        cameraPreview.srcObject = stream;

        updateStatus('カメラ準備完了');
    } catch (error) {
        console.error('カメラエラー:', error);

        if (error.name === 'NotAllowedError') {
            alert('カメラの使用が許可されていません');
        } else if (error.name === 'NotFoundError') {
            alert('カメラが見つかりません');
        } else {
            alert('カメラの起動に失敗しました: ' + error.message);
        }

        updateStatus('カメラ起動失敗');
    }
}

/**
 * カメラダイアログを閉じる
 */
export function closeCameraDialog() {
    const cameraDialog = document.getElementById('cameraDialog');
    cameraDialog.classList.add('hidden');

    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.setCameraStream(null);
    }
    state.setCapturedPhotoData(null);

    updateStatus(state.isTracking ? `GPS記録中 (${state.trackingData.length}点記録)` : 'GPS待機中...');
}

/**
 * 写真を撮り直す（Retake）
 */
export async function retakePhoto() {
    // 現在の写真をDBとMapから削除
    if (state.currentPhotoId) {
        try {
            await deletePhoto(state.currentPhotoId);
            removePhotoMarker(state.currentPhotoId);
        } catch (error) {
            console.error('写真削除エラー (Retake):', error);
        }
    }

    // 状態リセット
    state.setCapturedPhotoData(null);
    state.setCurrentPhotoId(null);
    state.setCapturedPhotoLocation(null);
    currentPhotoText = '';

    // セッション枚数を減らす（キャンセル扱い）
    if (state.photosInSession > 0) {
        state.setPhotosInSession(state.photosInSession - 1);
    }
    updateDataSizeIfOpen();

    // UIを撮影モードに戻す
    const cameraPreview = document.getElementById('cameraPreview');
    const capturedCanvas = document.getElementById('capturedCanvas');
    const captureButtons = document.getElementById('captureButtons');
    const directionButtons = document.getElementById('directionButtons');

    cameraPreview.classList.remove('hidden');
    capturedCanvas.classList.add('hidden');
    captureButtons.classList.remove('hidden');
    directionButtons.classList.add('hidden');

    updateStatus('カメラ準備完了');

    // カメラストリームが停止していたら再開
    if (!state.cameraStream) {
        await takePhoto();
        // takePhoto will handle getUserMedia and state.setCameraStream
        // and also UI visibility, which matches what we want.
    }
}


export async function capturePhoto() {
    const cameraPreview = document.getElementById('cameraPreview');
    const capturedCanvas = document.getElementById('capturedCanvas');
    const captureButtons = document.getElementById('captureButtons');
    const directionButtons = document.getElementById('directionButtons');

    currentPhotoText = ''; // Reset text
    state.setCurrentPhotoId(null); // Reset ID

    const srcWidth = cameraPreview.videoWidth;
    const srcHeight = cameraPreview.videoHeight;

    // アスペクト比を維持しながらリサイズ
    const srcAspect = srcWidth / srcHeight;
    const targetAspect = PHOTO_WIDTH / PHOTO_HEIGHT;

    let cropX = 0, cropY = 0, cropWidth = srcWidth, cropHeight = srcHeight;

    if (srcAspect > targetAspect) {
        cropWidth = srcHeight * targetAspect;
        cropX = (srcWidth - cropWidth) / 2;
    } else {
        cropHeight = srcWidth / targetAspect;
        cropY = (srcHeight - cropHeight) / 2;
    }

    capturedCanvas.width = PHOTO_WIDTH;
    capturedCanvas.height = PHOTO_HEIGHT;
    const ctx = capturedCanvas.getContext('2d');
    ctx.drawImage(cameraPreview, cropX, cropY, cropWidth, cropHeight, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

    state.setCapturedPhotoData(capturedCanvas.toDataURL('image/jpeg', PHOTO_QUALITY));

    // 撮影時の位置情報を保持
    const location = state.currentMarker ? state.currentMarker.getLatLng() : null;
    state.setCapturedPhotoLocation(location);



    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.setCameraStream(null);
    }

    cameraPreview.classList.add('hidden');
    capturedCanvas.classList.remove('hidden');
    captureButtons.classList.add('hidden');
    directionButtons.classList.remove('hidden');

    // 方向ボタンの選択状態をリセット
    document.querySelectorAll('.dir-btn').forEach(btn => btn.classList.remove('selected'));

    // 即時保存 (IndexedDB)
    try {
        const photoRecord = {
            data: state.capturedPhotoData,
            timestamp: new Date().toISOString(),
            direction: '',
            location: location ? {
                lat: parseFloat(location.lat.toFixed(5)),
                lng: parseFloat(location.lng.toFixed(5))
            } : null,
            text: ''
        };

        const photoId = await savePhoto(photoRecord);
        state.setCurrentPhotoId(photoId);
        state.setPhotosInSession(state.photosInSession + 1);


        if (location) {
            photoRecord.id = photoId;
            addPhotoMarkerToMap(photoRecord, showPhotoFromMarker);
        }
        updateDataSizeIfOpen();

    } catch (error) {
        console.error('写真一時保存エラー:', error);
        alert('写真の保存に失敗しましたが、撮影は継続できます');
    }

    updateStatus('方向を選択してください');
}

/**
 * 方向を選択して写真を保存
 * @param {string} direction - 方向（left/up/right）
 */
export async function savePhotoWithDirection(direction) {
    if (!state.capturedPhotoData) {
        console.error('撮影データがありません');
        return;
    }

    try {
        // 方向ボタンのスタイル更新
        document.querySelectorAll('.dir-btn').forEach(btn => {
            if (btn.dataset.direction === direction) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        const stampedPhotoData = await drawArrowStamp(state.capturedPhotoData, direction);


        // state.capturedPhotoLocation を使用 (撮影時の位置)
        const location = state.capturedPhotoLocation;

        const photoRecord = {
            data: stampedPhotoData,
            timestamp: new Date().toISOString(), // Timestamp updates on overwrite? Prompt says "overwrite direction", implies update.
            direction: direction,
            location: location ? {
                lat: parseFloat(location.lat.toFixed(5)),
                lng: parseFloat(location.lng.toFixed(5))
            } : null,
            text: currentPhotoText
        };

        let photoId;

        if (state.currentPhotoId) {
            // 上書き保存
            photoRecord.id = state.currentPhotoId;
            // 既存のタイムスタンプを維持するべきか？今の実装では更新日時になる。
            // 指示は「方向を上書きして」なので、データとしては最新の状態にするのが自然。
            await updatePhoto(photoRecord);
            photoId = state.currentPhotoId;


            // 地図上のマーカーを更新（削除して追加）
            removePhotoMarker(photoId);
        } else {
            // 新規保存
            photoId = await savePhoto(photoRecord);
            state.setCurrentPhotoId(photoId);

            state.setPhotosInSession(state.photosInSession + 1);
        }

        if (location) {
            // photoRecordにIDを含めて渡す必要がある（map.jsの修正により）
            photoRecord.id = photoId;
            addPhotoMarkerToMap(photoRecord, showPhotoFromMarker);
        }

        // closeCameraDialog(); // 連続撮影・確認のため閉じない
        updateStatus(`写真を${state.currentPhotoId ? '更新' : '保存'}しました（方向: ${direction}）`);

        setTimeout(() => {
            if (state.isTracking) {
                // updateStatus(`GPS記録中 (${state.trackingData.length}点記録)`);
            } else {
                // updateStatus('GPS待機中...');
            }
        }, 2000);

        updateDataSizeIfOpen();

    } catch (error) {
        console.error('写真保存エラー:', error);
        alert('写真の保存に失敗しました: ' + error.message);
    }

    // データは保持する（連続操作のため）
}

/**
 * テキスト入力ボタン処理
 */
export function handleTextButton() {
    const text = prompt('写真へのメモを入力してください:', currentPhotoText);
    if (text !== null) {
        currentPhotoText = text;

        if (text) {

        }

        // すでに保存済みの写真がある場合は、テキストを即時反映して保存
        if (state.currentPhotoId) {
            getPhoto(state.currentPhotoId).then(photo => {
                if (photo) {
                    photo.text = currentPhotoText;
                    return updatePhoto(photo).then(() => {


                        // マーカー更新
                        removePhotoMarker(photo.id);
                        addPhotoMarkerToMap(photo, showPhotoFromMarker);

                        updateStatus('メモを保存しました');
                        setTimeout(() => {
                            if (state.isTracking) {
                                // updateStatus...
                            } else {
                                // updateStatus...
                            }
                        }, 2000);
                    });
                }
            }).catch(error => {
                console.error('テキスト保存エラー:', error);
                alert('メモの保存に失敗しました');
            });
        }
    }
}
