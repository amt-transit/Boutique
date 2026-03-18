// src/hamburger.js

export function setupHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openHamburgerMenu);

    const drawerThemeBtn = document.getElementById('drawer-theme-toggle');
    const headerThemeBtn = document.getElementById('theme-toggle');

    const toggleTheme = () => {
        const isDark = document.body.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        document.body.classList.toggle('dark', newTheme === 'dark');
        localStorage.setItem('theme', newTheme);
        updateDrawerThemeButton(newTheme === 'dark');
    };

    if (drawerThemeBtn) drawerThemeBtn.addEventListener('click', toggleTheme); 
    if (headerThemeBtn) headerThemeBtn.addEventListener('click', toggleTheme);

    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeHamburgerMenu();
    });

    // Sync état initial
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDarkInitial = savedTheme === 'dark' || (!savedTheme && systemDark);
    
    document.body.classList.toggle('dark', isDarkInitial);
    updateDrawerThemeButton(isDarkInitial);
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
    
    const headerIcon = document.querySelector('#theme-toggle i');
    if (headerIcon) headerIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    
    const desktopLabel = document.getElementById('desktop-theme-label');
    if (desktopLabel) desktopLabel.textContent = isDark ? 'Clair' : 'Sombre';
    
    if (window.lucide) window.lucide.createIcons();
}