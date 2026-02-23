// ============= v2.9: TUTORIAL SYSTEM =============
// Fixes: properly hooks into app lifecycle, uses server-side flag,
// adds help/replay button, syncs with admin reset

(function () {
    'use strict';

    // Override the dead setupTutorialListener
    window.setupTutorialListener = function () {
        const closeBtn = document.getElementById('close-tutorial-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('tutorial-modal').style.display = 'none';
                localStorage.setItem('tutorial_completed', 'true');
                if (typeof soundManager !== 'undefined') soundManager.play('button');
                if (typeof showNotification !== 'undefined') showNotification('Удачной работы! 🚀', 'success');

                // Mark tutorial complete on server
                const tid = window.TELEGRAM_ID || 'test_user_123';
                fetch(`${window.API_BASE_URL || '/api'}/user/${tid}/tutorial-complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }).catch(() => { });
            });
        }

        // Help button to replay tutorial
        const helpBtn = document.getElementById('help-tutorial-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                showTutorialModal();
            });
        }
    };

    // Override the dead checkTutorial
    window.checkTutorial = function () {
        if (!window.userData) return;

        // Server says tutorial not completed? Show it.
        const serverFlag = window.userData.tutorial_completed;

        // If server says completed, also sync localStorage
        if (serverFlag) {
            localStorage.setItem('tutorial_completed', 'true');
            return; // Don't show
        }

        // Server says not completed (new user or admin-reset user)
        const localFlag = localStorage.getItem('tutorial_completed');
        if (localFlag === 'true') {
            // localStorage says done but server says not — admin must have reset
            // Clear local flag so tutorial shows again
            localStorage.removeItem('tutorial_completed');
        }

        // Show tutorial for new/reset users
        setTimeout(() => {
            showTutorialModal();
        }, 1500);
    };

    function showTutorialModal() {
        const modal = document.getElementById('tutorial-modal');
        if (modal) {
            modal.style.display = 'flex';
            if (typeof soundManager !== 'undefined') soundManager.play('button');
        }
    }

    // Expose for help button
    window.showTutorialModal = showTutorialModal;

    // Auto-init: since tutorial.js loads after script.js (both defer),
    // we monkey-patch initApp to also call our tutorial functions.
    const originalInitApp = window.initApp;
    if (typeof originalInitApp === 'function') {
        window.initApp = async function () {
            await originalInitApp.call(this);
            // After userData is loaded, setup and check tutorial
            window.setupTutorialListener();
            window.checkTutorial();
        };
    } else {
        // Fallback: run on DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                window.setupTutorialListener();
                window.checkTutorial();
            }, 2000);
        });
    }
})();
