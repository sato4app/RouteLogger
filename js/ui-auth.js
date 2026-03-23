// RouteLogger - ユーザー接続UI（設定ダイアログ内）

import { signInAnonymously, getUserByUsername, registerUser } from './auth.js';

const USERNAME_KEY = 'routeLogger_username';

/**
 * userAdminの登録状態を確認してUIを更新
 * Use Firebase ON時・設定ダイアログを開いた時・起動時に呼び出す
 */
export async function checkAndUpdateUserStatus() {
    const username = localStorage.getItem(USERNAME_KEY);
    const display = document.getElementById('settingsUsernameDisplay');
    const statusEl = document.getElementById('userRegistrationStatus');

    if (!username) {
        if (display) display.textContent = '@（ユーザ登録なし）';
        if (statusEl) statusEl.textContent = '';
        return;
    }

    if (display) display.textContent = `@${username}`;
    if (statusEl) statusEl.textContent = '';

    try {
        await signInAnonymously();
        const userInfo = await getUserByUsername(username);
        if (userInfo && userInfo.status !== 'denied' && userInfo.status !== 'disabled') {
            if (statusEl) statusEl.textContent = '（登録確認済み）';
        }
    } catch (e) {
        // ネットワークエラー等は無視
    }
}

/**
 * 認証UIのイベントリスナーを初期化
 */
export function initAuthUI() {
    // 通常表示をタップ → 編集フォームを展開
    document.getElementById('userNormalView')?.addEventListener('click', () => {
        const savedUsername = localStorage.getItem(USERNAME_KEY);
        const usernameInput = document.getElementById('registerUsernameInput');
        const emailInput = document.getElementById('registerEmailInput');
        const displayNameInput = document.getElementById('registerDisplayNameInput');
        const msg = document.getElementById('userEditMsg');
        if (usernameInput) usernameInput.value = savedUsername || '';
        if (emailInput) emailInput.value = '';
        if (displayNameInput) displayNameInput.value = '';
        if (msg) msg.textContent = '';
        document.getElementById('userNormalView')?.classList.add('hidden');
        document.getElementById('userEditForm')?.classList.remove('hidden');
    });

    // [登録] ボタン: 既存ユーザーならlocalStorage更新、新規ユーザーならFirestore登録
    document.getElementById('userEditSaveBtn')?.addEventListener('click', async () => {
        const username = document.getElementById('registerUsernameInput')?.value?.trim();
        const email = document.getElementById('registerEmailInput')?.value?.trim();
        const displayName = document.getElementById('registerDisplayNameInput')?.value?.trim();
        const msg = document.getElementById('userEditMsg');
        if (msg) msg.textContent = '';

        if (!username) { if (msg) msg.textContent = 'ユーザー名を入力してください'; return; }
        if (!/^[a-zA-Z0-9]+$/.test(username)) { if (msg) msg.textContent = 'ユーザー名は英数字のみ使用できます'; return; }

        const saveBtn = document.getElementById('userEditSaveBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = '確認中...';
        try {
            await signInAnonymously();
            const userInfo = await getUserByUsername(username);
            if (userInfo) {
                // 既存ユーザー
                if (userInfo.status === 'denied' || userInfo.status === 'disabled') {
                    if (msg) msg.textContent = 'このユーザーは無効化されています';
                    return;
                }
                localStorage.setItem(USERNAME_KEY, username);
            } else {
                // 新規ユーザー: email・氏名が必要
                if (!email) { if (msg) msg.textContent = '新規ユーザーです。メールアドレスを入力してください'; return; }
                if (!displayName) { if (msg) msg.textContent = '新規ユーザーです。氏名を入力してください'; return; }
                await registerUser(username, email, displayName);
                localStorage.setItem(USERNAME_KEY, username);
            }
            await checkAndUpdateUserStatus();
            document.getElementById('userNormalView')?.classList.remove('hidden');
            document.getElementById('userEditForm')?.classList.add('hidden');
        } catch (e) {
            if (msg) msg.textContent = e.message;
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '登録';
        }
    });

    // [キャンセル] ボタン
    document.getElementById('userEditCancelBtn')?.addEventListener('click', () => {
        document.getElementById('userNormalView')?.classList.remove('hidden');
        document.getElementById('userEditForm')?.classList.add('hidden');
    });
}
