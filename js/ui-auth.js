// RouteLogger - ユーザー接続UI（設定ダイアログ内）

const USERNAME_KEY = 'routeLogger_username';

/**
 * ユーザー名表示を更新
 */
export function updateUserConnectUI() {
    const usernameInput = document.getElementById('settingsUsernameInput');
    const usernameDisplay = document.getElementById('settingsUsernameDisplay');
    const savedUsername = localStorage.getItem(USERNAME_KEY);
    if (usernameInput) usernameInput.value = savedUsername || '';
    if (usernameDisplay) usernameDisplay.textContent = savedUsername ? `@${savedUsername}` : '';
}

/**
 * 認証UIのイベントリスナーを初期化
 */
export function initAuthUI() {
    const usernameInput = document.getElementById('settingsUsernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('change', () => {
            const username = usernameInput.value.trim();
            const display = document.getElementById('settingsUsernameDisplay');
            if (username) {
                localStorage.setItem(USERNAME_KEY, username);
                if (display) display.textContent = `@${username}`;
            } else {
                localStorage.removeItem(USERNAME_KEY);
                if (display) display.textContent = '';
            }
            usernameInput.value = username;
        });
    }
}
