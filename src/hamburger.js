// src/hamburger.js

export function setupHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openHamburgerMenu);

    const drawerThemeBtn = document.getElementById('drawer-theme-toggle');
    if (drawerThemeBtn) {
        drawerThemeBtn.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark');
            const newTheme = isDark ? 'light' : 'dark';
            document.body.classList.toggle('dark', newTheme === 'dark');
            localStorage.setItem('theme', newTheme);
            updateDrawerThemeButton(newTheme === 'dark');
            if (window.lucide) window.lucide.createIcons();
        });
    }

    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeHamburgerMenu();
    });

    // Sync état initial
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    updateDrawerThemeButton(savedTheme === 'dark' || (!savedTheme && systemDark));
}

export function openHamburgerMenu() {
    document.getElementById('hamburger-drawer').classList.add('open');
    document.getElementById('hamburger-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.lucide) window.lucide.createIcons();
}

export function closeHamburgerMenu() {
    document.getElementById('hamburger-drawer').classList.remove('open');
    document.getElementById('hamburger-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

function updateDrawerThemeButton(isDark) {
    const icon = document.getElementById('drawer-theme-icon');
    const label = document.getElementById('drawer-theme-label');
    if (icon) icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    if (label) label.textContent = isDark ? 'Mode clair' : 'Mode sombre';
    if (window.lucide) window.lucide.createIcons();
}