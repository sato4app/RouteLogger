import { toggleVisibility, updateStatus } from './ui-common.js';
import { reloadFromFirebase } from './firebase-ops.js';
import { saveExternalData } from './db.js';
import { displayExternalGeoJSON } from './map.js';

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
        alert('外部KMZファイルの表示は現在実装されていません。\n(Not implemented yet)');
    };

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
        }
    };
    reader.onerror = () => {
        alert('ファイルの読み込みエラーが発生しました');
        updateStatus('読み込み失敗');
        event.target.value = '';
    };

    reader.readAsText(file);
}
