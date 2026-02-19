import { toggleVisibility, updateStatus, setUiBusy } from './ui-common.js';
import { reloadFromFirebase } from './firebase-ops.js';
import { saveExternalData, restoreTrack, savePhoto, clearRouteLogData, getDataCounts } from './db.js';
import { displayExternalGeoJSON, displayPhotoMarkers, updateTrackingPath } from './map.js';
import { importKmz } from './kmz-handler.js';

/**
 * データ選択ダイアログを表示
 */
export function showLoadSelectionDialog() {
    toggleVisibility('loadSelectionDialog', true);
}

/**
 * データ選択ダイアログを閉じる
 */
export function closeLoadSelectionDialog() {
    toggleVisibility('loadSelectionDialog', false);
}

/**
 * Loadダイアログのコントロールを初期化
 */
export function initLoadDialogControls() {
    document.getElementById('loadDbBtn').onclick = () => {
        closeLoadSelectionDialog();
        // 既存のFirebaseロード処理を呼び出す
        reloadFromFirebase();
    };

    document.getElementById('loadDbKmzBtn').onclick = () => {
        alert('KMZファイルのインポートは現在実装されていません。\n(Not implemented yet)');
    };

    document.getElementById('loadExtGeoJsonBtn').onclick = () => {
        closeLoadSelectionDialog();
        // Hidden file inputをクリック
        document.getElementById('geoJsonInput').click();
    };

    document.getElementById('loadExtKmzBtn').onclick = () => {
        closeLoadSelectionDialog();
        // Hidden file input for KMZ
        const kmzInput = document.getElementById('kmzInput');
        if (kmzInput) {
            kmzInput.click();
        } else {
            console.error('KMZ input element not found');
        }
    };

    // File input handler for KMZ
    const kmzInput = document.getElementById('kmzInput');
    if (kmzInput) {
        kmzInput.onchange = handleKmzUpload;
    }

    document.getElementById('closeLoadSelectionBtn').onclick = closeLoadSelectionDialog;

    // File input handler
    document.getElementById('geoJsonInput').onchange = handleGeoJSONUpload;
}

/**
 * GeoJSONアップロード処理
 */
async function handleGeoJSONUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    updateStatus('GeoJSON読み込み中...');
    setUiBusy(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const geoJson = JSON.parse(e.target.result);

            // DBに保存
            await saveExternalData('geojson', file.name, geoJson);

            // 地図に表示
            displayExternalGeoJSON(geoJson);

            // データパネルを閉じる（メインコントロールに戻る動作に合わせる）
            const dataPanel = document.getElementById('dataPanel');
            if (dataPanel) dataPanel.classList.add('hidden');

            updateStatus('GeoJSONを表示しました');
            alert(`読み込み完了: ${file.name}`);

            // Clear input so same file can be selected again if needed
            event.target.value = '';

        } catch (error) {
            console.error('GeoJSON詳細エラー:', error);
            alert('GeoJSONの読み込みに失敗しました: ' + error.message);
            updateStatus('読み込み失敗');
            event.target.value = '';
        } finally {
            setUiBusy(false);
        }
    };
    reader.onerror = () => {
        alert('ファイルの読み込みエラーが発生しました');
        updateStatus('読み込み失敗');
        event.target.value = '';
        setUiBusy(false);
    };

    reader.readAsText(file);
}

/**
 * KMZアップロード処理
 */
async function handleKmzUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    updateStatus('KMZ読み込み中...');
    setUiBusy(true);

    try {
        // KMZインポート実行
        const result = await importKmz(file);

        if (result.type === 'RouteLogger') {
            // RouteLogger形式の場合: 既存データをクリアして復元
            if (confirm('現在の記録データをクリアして、このファイルを読み込みますか？')) {
                updateStatus('データをリセット中...');
                await clearRouteLogData();

                updateStatus('トラックデータを復元中...');
                if (result.tracks && result.tracks.length > 0) {
                    for (const track of result.tracks) {
                        await restoreTrack(track);
                        // 最新のトラックをマップに表示
                        updateTrackingPath(track.points);
                    }
                }

                updateStatus('写真データを復元中...');
                if (result.photos && result.photos.length > 0) {
                    for (const photo of result.photos) {
                        // IDは自動採番されるので削除
                        delete photo.id;
                        await savePhoto(photo);
                    }
                    // マーカー再表示
                    // displayPhotoMarkersにはクリックハンドラが必要だが、ui.jsからインポートしていないので、
                    // map.jsのデフォルト動作 (showPhotoFromMarkerの解決が必要)
                    // ui.jsのshowPhotoFromMarkerをexportしてここで使うか、
                    // ui-load.jsに関数を渡す等のリファクタが理想だが、
                    // 簡易的にここではマーカー表示のみ行うか、リロードを促す。
                    // ユーザーガイドに従い、Reloadボタンか何かで再描画されるはずだが、
                    // ここで直接更新したい。

                    // map.jsのdisplayPhotoMarkersは引数onMarkerClickを取る。
                    // ui-load.jsからはui.jsのshowPhotoFromMarkerが見えない（循環参照回避のためimportしていないかも）。
                    // ここではalertで再読み込みを促すか、location.reload()するか？
                    // prompt.mdでは「読み込んで」とある。
                    // UI更新のためにページリロードするのが確実。
                }

                alert(`読み込み完了: ${file.name}\n反映するためページをリロードします。`);

                // ログ出力（リロード前だが一応）
                try {
                    const counts = await getDataCounts();
                    console.log(`[DB Status] Tracks: ${counts.tracks}, Photos: ${counts.photos}, Externals: ${counts.externals}, External Photos: ${counts.externalPhotos}`);
                } catch (e) {
                    console.error('[DB Status] Error getting counts:', e);
                }

                location.reload();
            }
        } else {
            // 他形式の場合: 外部データとして表示
            // importKmz内でDB保存は完了しているので表示のみ
            if (result.geojson) {
                displayExternalGeoJSON(result.geojson);
            }
            updateStatus('外部データを表示しました');
            alert(`外部データ読み込み完了: ${file.name}`);
        }

    } catch (error) {
        console.error('KMZ読み込みエラー:', error);
        alert('KMZの読み込みに失敗しました: ' + error.message);
        updateStatus('読み込み失敗');
    } finally {
        setUiBusy(false);
        event.target.value = '';
    }
}
