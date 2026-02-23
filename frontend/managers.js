// ============= SOUND MANAGER =============
class SoundManager {
    constructor() {
        this.sounds = {};
        this.muted = localStorage.getItem('soundMuted') === 'true';
        this.initSounds();
    }

    initSounds() {
        // We'll use Web Audio API for better control
        // For now, using simple audio elements
        this.sounds = {
            coin: this.createSound('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHgU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw'),
            engine: this.createSound('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHgU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw'),
            notification: this.createSound('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHgU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw'),
            button: this.createSound('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='),
            siren: this.createSound('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHgU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBQLSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw2o87ChJcsejsq1gVC0ig3/LBbiQFKYDN8tiJNwgYY7vs56JQEQxLpOHxumUgBTaN1fHLdyoFKH7M8NqPOwoSXLHo7KtYFQtIoN/ywW4kBSmAzfLYiTcIGGO77OeiUBEMS6Th8bplIAU2jdXxy3cqBSh+zPDajzsKElyx6OyrWBULSKDf8sFuJAUpgM3y2Ik3CBhju+znolARDEuk4fG6ZSAFNo3V8ct3KgUofszw')
        };
    }

    createSound(dataUrl) {
        const audio = new Audio(dataUrl);
        audio.volume = 0.3;
        return audio;
    }

    play(soundName) {
        if (this.muted || !this.sounds[soundName]) return;

        try {
            const sound = this.sounds[soundName].cloneNode();
            sound.volume = 0.3;
            sound.play().catch(e => console.log('Sound play failed:', e));
        } catch (e) {
            console.log('Sound error:', e);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('soundMuted', this.muted);
        return this.muted;
    }
}

const soundManager = new SoundManager();

// ============= THEME MANAGER =============
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'auto';
        this.applyTheme();
    }

    applyTheme() {
        const tg = window.Telegram?.WebApp;
        if (this.currentTheme === 'auto') {
            if (tg && tg.colorScheme) {
                document.documentElement.setAttribute('data-theme', tg.colorScheme);
                // Listen for theme changes from Telegram
                tg.onEvent('themeChanged', () => {
                    document.documentElement.setAttribute('data-theme', tg.colorScheme);
                });
            } else {
                const hour = new Date().getHours();
                const isDark = hour >= 20 || hour < 6;
                document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            }
        } else {
            document.documentElement.setAttribute('data-theme', this.currentTheme);
        }
    }

    setTheme(theme) {
        this.currentTheme = theme;
        localStorage.setItem('theme', theme);
        this.applyTheme();
    }

    toggle() {
        const themes = ['light', 'dark', 'auto'];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        this.setTheme(nextTheme);
        return nextTheme;
    }
}

const themeManager = new ThemeManager();

// Auto-update theme every minute
setInterval(() => {
    if (themeManager.currentTheme === 'auto') {
        themeManager.applyTheme();
    }
}, 60000);
