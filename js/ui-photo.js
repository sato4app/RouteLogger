// RouteLogger - 写真関連UI

import * as state from './state.js';
import { getAllPhotos } from './db.js';
import { toggleVisibility, updateStatus } from './ui-common.js';

let currentPhotoList = [];
let currentPhotoIndex = -1;
let zoomController = null;

/**
 * マーカークリックから写真を表示
 * @param {Object} photo - 写真データ
 */
export async function showPhotoFromMarker(photo) {
    try {
        // ナビゲーションを有効にするために全写真リストを取得
        const allPhotos = await getAllPhotos();

        let index = -1;
        if (allPhotos.length > 0) {
            // タイムスタンプで一致する写真を探す
            index = allPhotos.findIndex(p => p.timestamp === photo.timestamp);
        }

        if (index !== -1) {
            showPhotoViewer(photo, allPhotos, index);
        } else {
            console.warn('マーカーの画像がデータベース内で見つかりませんでした。単一表示します。');
            showPhotoViewer(photo, [photo], 0);
        }
    } catch (error) {
        console.error('showPhotoFromMarkerエラー:', error);
        // エラー時は単一表示へフォールバック
        showPhotoViewer(photo, [photo], 0);
    }
}

/**
 * 写真一覧を表示
 */
export async function showPhotoList() {
    if (!state.db) {
        alert('データベースが初期化されていません');
        return;
    }

    const photoGrid = document.getElementById('photoGrid');
    photoGrid.innerHTML = '';

    try {
        const photos = await getAllPhotos();

        // Update header with count
        const headerTitle = document.querySelector('#photoListContainer h2');
        if (headerTitle) {
            headerTitle.innerHTML = `Photo Gallery<br>(${photos.length} photos)`;
        }

        if (photos.length === 0) {
            photoGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #666;">保存された写真がありません</p>';
        } else {
            photos.forEach((photo, index) => {
                const item = document.createElement('div');
                item.className = 'photo-item';

                const img = document.createElement('img');
                img.src = photo.data;
                img.alt = '写真';

                item.appendChild(img);
                item.addEventListener('click', () => showPhotoViewer(photo, photos, index));
                photoGrid.appendChild(item);
            });
        }

        toggleVisibility('photoListContainer', true);
    } catch (error) {
        console.error('写真一覧表示エラー:', error);
        alert('写真一覧の表示に失敗しました');
    }
}

/**
 * 写真一覧を閉じる
 */
export function closePhotoList() {
    toggleVisibility('photoListContainer', false);
    if (state.isTracking) {
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS追跡中 (${totalPoints}点記録)`);
    }
}

/**
 * 写真を拡大表示
 * @param {Object} photo - 写真データ
 * @param {Array} allPhotos - 全写真リスト (Optional)
 * @param {number} index - 写真のインデックス (Optional)
 */
export function showPhotoViewer(photo, allPhotos = [], index = -1) {
    if (allPhotos.length > 0) {
        currentPhotoList = allPhotos;
        currentPhotoIndex = index;
    } else {
        currentPhotoList = [photo];
        currentPhotoIndex = 0;
    }

    updatePhotoViewerUI(photo, currentPhotoIndex, currentPhotoList.length);
    toggleVisibility('photoViewer', true);

    // Initialize or reset zoom
    const viewerImage = document.getElementById('viewerImage');
    if (!zoomController && viewerImage) {
        zoomController = new ImageZoom(viewerImage);
    }
    if (zoomController) {
        zoomController.reset();
    }
}

/**
 * 写真ビューアのUIを更新
 * @param {Object} photo 
 * @param {number} index 
 * @param {number} total 
 */
function updatePhotoViewerUI(photo, index, total) {
    const viewerImage = document.getElementById('viewerImage');
    const photoInfo = document.getElementById('photoInfo');
    const counter = document.getElementById('photoCounter');
    const prevBtn = document.getElementById('prevPhotoBtn');
    const nextBtn = document.getElementById('nextPhotoBtn');

    if (!photo) return;

    viewerImage.src = photo.data;

    let infoHTML = `撮影日時: ${new Date(photo.timestamp).toLocaleString('ja-JP')}`;
    if (photo.location) {
        infoHTML += `<br>緯度: ${photo.location.lat.toFixed(5)}<br>経度: ${photo.location.lng.toFixed(5)}`;
    } else {
        infoHTML += '<br>位置情報なし';
    }

    if (photo.text) {
        infoHTML += `<br><br><span style="white-space: pre-wrap;">${photo.text}</span>`;
    }

    photoInfo.innerHTML = infoHTML;

    // Update counter
    if (total > 1) {
        counter.textContent = `${index + 1} of ${total}`;
        counter.style.display = 'block';
    } else {
        counter.style.display = 'none';
    }

    // Update buttons
    if (total > 1) {
        if (prevBtn) prevBtn.style.display = index > 0 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = index < total - 1 ? 'flex' : 'none';
    } else {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    }

    // Reset zoom when photo changes
    if (zoomController) {
        zoomController.reset();
    }
}

/**
 * 写真ビューアを閉じる
 */
export function closePhotoViewer() {
    toggleVisibility('photoViewer', false);
    if (state.isTracking) {
        const totalPoints = state.previousTotalPoints + state.trackingData.length;
        updateStatus(`GPS追跡中 (${totalPoints}点記録)`);
    }
    if (zoomController) {
        zoomController.reset();
    }
}

/**
 * Photo Viewerのナビゲーション初期化
 */
export function initPhotoViewerControls() {
    const prevBtn = document.getElementById('prevPhotoBtn');
    const nextBtn = document.getElementById('nextPhotoBtn');

    if (prevBtn) {
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentPhotoIndex > 0) {
                currentPhotoIndex--;
                updatePhotoViewerUI(currentPhotoList[currentPhotoIndex], currentPhotoIndex, currentPhotoList.length);
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentPhotoIndex < currentPhotoList.length - 1) {
                currentPhotoIndex++;
                updatePhotoViewerUI(currentPhotoList[currentPhotoIndex], currentPhotoIndex, currentPhotoList.length);
            }
        };
    }
}

/**
 * Image Zoom Controller
 */
class ImageZoom {
    constructor(element) {
        this.element = element;
        this.scale = 1;
        this.pointX = 0;
        this.pointY = 0;
        this.startX = 0;
        this.startY = 0;
        this.isPanning = false;

        // Touch state
        this.initialDistance = 0;
        this.initialScale = 1;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        this.init();
    }

    init() {
        this.element.addEventListener('mousedown', this.handleMouseDown);
        this.element.addEventListener('wheel', this.handleWheel, { passive: false });
        this.element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.element.addEventListener('touchend', this.handleTouchEnd);
    }

    reset() {
        this.scale = 1;
        this.pointX = 0;
        this.pointY = 0;
        this.updateTransform();
    }

    updateTransform() {
        this.element.style.transform = `translate(${this.pointX}px, ${this.pointY}px) scale(${this.scale})`;
    }

    handleMouseDown(e) {
        if (this.scale === 1) return; // Only pan if zoomed in
        e.preventDefault();
        this.startX = e.clientX - this.pointX;
        this.startY = e.clientY - this.pointY;
        this.isPanning = true;
        this.element.style.cursor = 'grabbing';

        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseMove(e) {
        if (!this.isPanning) return;
        e.preventDefault();
        this.pointX = e.clientX - this.startX;
        this.pointY = e.clientY - this.startY;
        this.updateTransform();
    }

    handleMouseUp(e) {
        this.isPanning = false;
        this.element.style.cursor = 'grab';
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleWheel(e) {
        e.preventDefault();
        const xs = (e.clientX - this.pointX) / this.scale;
        const ys = (e.clientY - this.pointY) / this.scale;
        const delta = -e.deltaY;

        const oldScale = this.scale;
        this.scale += delta * 0.001 * this.scale; // Proportional zoom
        this.scale = Math.min(Math.max(1, this.scale), 10); // Clamp 1x to 10x

        // Adjust position to zoom towards mouse pointer
        if (this.scale !== oldScale) {
            this.pointX = e.clientX - xs * this.scale;
            this.pointY = e.clientY - ys * this.scale;
            // Center correction if fully zoomed out
            if (this.scale === 1) {
                this.pointX = 0;
                this.pointY = 0;
            }
            this.updateTransform();
        }
    }

    getDistance(touches) {
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
    }

    getCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            this.initialDistance = this.getDistance(e.touches);
            this.initialScale = this.scale;
        } else if (e.touches.length === 1 && this.scale > 1) {
            // Pan init
            this.startX = e.touches[0].clientX - this.pointX;
            this.startY = e.touches[0].clientY - this.pointY;
            this.isPanning = true;
        }
    }

    handleTouchMove(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = this.getDistance(e.touches);
            if (this.initialDistance > 0) {
                this.scale = this.initialScale * (currentDistance / this.initialDistance);
                this.scale = Math.min(Math.max(1, this.scale), 10);
                this.updateTransform();
            }
        } else if (e.touches.length === 1 && this.isPanning && this.scale > 1) {
            e.preventDefault(); // Prevent scroll while panning
            this.pointX = e.touches[0].clientX - this.startX;
            this.pointY = e.touches[0].clientY - this.startY;
            this.updateTransform();
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.initialDistance = 0;
        }
        if (e.touches.length === 0) {
            this.isPanning = false;
            // Reset to center if scale is 1
            if (this.scale <= 1) {
                this.reset();
            }
        }
    }
}
