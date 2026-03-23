// RouteLogger - ユーザー接続UI（設定ダイアログ内）

import { getUserByUsername, registerUser, updateLastLogin, signInAnonymously } from './auth.js';
import * as state from './state.js';

const USERNAME_KEY = 'routeLogger_username';

/**
 * 接続状態に応じてUIを更新
 * 接続済み → 接続情報表示 / 未接続 → 入力フォーム表示
 */
export function updateUserConnectUI() {
    const userConnectedInfo = document.getElementById('userConnectedInfo');
    const userConnectForm = document.getElementById('userConnectForm');
    const usernameDisplay = document.getElementById('settingsUsernameDisplay');
    const emailDisplay = document.getElementById('settingsEmailDisplay');

    if (state.currentUserInfo) {
        if (userConnectForm) userConnectForm.classList.add('hidden');
        if (userConnectedInfo) userConnectedInfo.classList.remove('hidden');
        if (usernameDisplay) usernameDisplay.textContent = `@${state.currentUserInfo.username}`;
        if (emailDisplay) emailDisplay.textContent = state.currentUserInfo.email;
    } else {
        if (userConnectedInfo) userConnectedInfo.classList.add('hidden');
        if (userConnectForm) userConnectForm.classList.remove('hidden');

        // localStorageのユーザー名を復元、なければフォームをクリア
        const savedUsername = localStorage.getItem(USERNAME_KEY);
        const usernameInput = document.getElementById('settingsUsernameInput');
        const newUserFields = document.getElementById('newUserFields');
        const connectMsg = document.getElementById('userConnectMsg');
        if (usernameInput) usernameInput.value = savedUsername || '';
        if (newUserFields) newUserFields.classList.add('hidden');
        if (connectMsg) connectMsg.textContent = '';
    }
}

/**
 * 認証UIのイベントリスナーを初期化
 * @param {Function} onConnectComplete - 接続完了時のコールバック(userInfo)
 */
export function initAuthUI(onConnectComplete) {
    // Connectボタン
    const connectBtn = document.getElementById('userConnectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            const usernameInput = document.getElementById('settingsUsernameInput');
            const newUserFields = document.getElementById('newUserFields');
            const connectMsg = document.getElementById('userConnectMsg');
            const username = usernameInput?.value?.trim();

            if (connectMsg) connectMsg.textContent = '';

            if (!username) {
                if (connectMsg) connectMsg.textContent = 'ユーザー名を入力してください';
                return;
            }
            if (!/^[a-zA-Z0-9]+$/.test(username)) {
                if (connectMsg) connectMsg.textContent = 'ユーザー名は英数字のみ使用できます';
                return;
            }

            connectBtn.disabled = true;
            connectBtn.textContent = '接続中...';
            try {
                // 匿名認証（未サインインの場合のみ実行）
                await signInAnonymously();

                // Firestoreでユーザー検索
                const userInfo = await getUserByUsername(username);

                if (userInfo) {
                    // 既存ユーザー
                    if (userInfo.status === 'denied' || userInfo.status === 'disabled') {
                        if (connectMsg) connectMsg.textContent = 'このユーザーは無効化されています';
                        return;
                    }
                    localStorage.setItem(USERNAME_KEY, username);
                    await updateLastLogin(username);
                    state.setCurrentUserInfo(userInfo);
                    updateUserConnectUI();
                    if (onConnectComplete) onConnectComplete(userInfo);
                } else {
                    // 新規ユーザー: email/displayName入力欄が未表示なら表示して終了
                    if (newUserFields && newUserFields.classList.contains('hidden')) {
                        newUserFields.classList.remove('hidden');
                        if (connectMsg) connectMsg.textContent = '新規ユーザーです。メールアドレスと氏名を入力してください。';
                        return;
                    }
                    // email/displayName入力済み → 登録
                    const email = document.getElementById('settingsEmailInput')?.value?.trim();
                    const displayName = document.getElementById('settingsDisplayNameInput')?.value?.trim();
                    const newUserInfo = await registerUser(username, email, displayName);
                    localStorage.setItem(USERNAME_KEY, username);
                    state.setCurrentUserInfo(newUserInfo);
                    updateUserConnectUI();
                    if (onConnectComplete) onConnectComplete(newUserInfo);
                }
            } catch (error) {
                if (connectMsg) connectMsg.textContent = error.message;
            } finally {
                connectBtn.disabled = false;
                connectBtn.textContent = 'Connect';
            }
        });
    }

    // Disconnectボタン
    const disconnectBtn = document.getElementById('userDisconnectBtn');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            state.setCurrentUserInfo(null);
            localStorage.removeItem(USERNAME_KEY);
            updateUserConnectUI();
        });
    }
}
