// src/ui.js

let actionToConfirm = null;

export function formatPrice(p) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(p || 0); 
}

export function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let icon = '';
    let bgColor = 'bg-gray-800';

    switch (type) {
        case 'success':
            icon = '<i data-lucide="check-circle"></i>';
            bgColor = 'bg-green-600';
            break;
        case 'error':
            icon = '<i data-lucide="x-circle"></i>';
            bgColor = 'bg-red-600';
            break;
        case 'warning':
            icon = '<i data-lucide="alert-triangle"></i>';
            bgColor = 'bg-yellow-500';
            break;
        default:
            icon = '<i data-lucide="info"></i>';
            break;
    }

    toast.className = `fixed top-5 right-5 ${bgColor} text-white py-3 px-5 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in-up z-[1000]`;
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

export function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const textEl = document.getElementById('confirm-modal-text');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    if (!modal || !titleEl || !textEl || !confirmBtn || !cancelBtn) {
        console.error("Confirmation modal elements not found");
        return;
    }

    titleEl.textContent = title;
    textEl.textContent = message;

    // Clone and replace buttons to remove old event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const confirmHandler = () => {
        if (onConfirm) onConfirm();
        modal.classList.add('hidden');
    };

    const cancelHandler = () => {
        modal.classList.add('hidden');
    };

    newConfirmBtn.addEventListener('click', confirmHandler, { once: true });
    newCancelBtn.addEventListener('click', cancelHandler, { once: true });
    
    modal.classList.remove('hidden');
}

export function showPromptModal(title, message, inputType = 'text', onConfirm) {
    const modal = document.getElementById('prompt-modal');
    const titleEl = document.getElementById('prompt-modal-title');
    const labelEl = document.getElementById('prompt-modal-label');
    const inputEl = document.getElementById('prompt-modal-input');
    const confirmBtn = document.getElementById('prompt-modal-confirm');
    const cancelBtn = document.getElementById('prompt-modal-cancel');

    if (!modal) return;

    titleEl.textContent = title;
    labelEl.textContent = message;
    inputEl.type = inputType;
    inputEl.value = '';

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const confirmHandler = () => {
        const val = document.getElementById('prompt-modal-input').value;
        if (onConfirm) onConfirm(val);
        modal.classList.add('hidden');
    };

    newConfirmBtn.addEventListener('click', confirmHandler);
    newCancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
    
    inputEl.onkeydown = (e) => { if (e.key === 'Enter') confirmHandler(); };

    modal.classList.remove('hidden');
    setTimeout(() => inputEl.focus(), 100);
}

export function setupModalListeners() {
    const invoiceClose = document.getElementById('invoice-modal-close');
    if (invoiceClose) {
        invoiceClose.addEventListener('click', () => {
            document.getElementById('invoice-modal').classList.add('hidden');
        });
    }
    
    const accessClose = document.getElementById('access-modal-close');
    if (accessClose) {
        accessClose.addEventListener('click', () => {
            document.getElementById('access-modal').classList.add('hidden');
        });
    }
}

export function switchTab(tabId) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    const page = document.getElementById(`page-${tabId}`);
    if(page) page.classList.remove('hidden');

    const tabButton = document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`);
    if(tabButton) tabButton.classList.add('active');

    // Gestion de l'affichage de la barre de recherche globale
    const globalSearchContainer = document.getElementById('global-search-container');
    const globalSearchWrapper = document.getElementById('global-search-wrapper');
    
    if (globalSearchContainer && globalSearchWrapper) {
        if (tabId === 'dashboard') {
            globalSearchContainer.classList.remove('hidden');
            globalSearchWrapper.classList.remove('hidden');
        } else {
            if (window.innerWidth < 768) {
                // Mobile : On garde le conteneur principal (pour le bouton Hamburger), mais on cache le champ de recherche
                globalSearchContainer.classList.remove('hidden');
                globalSearchWrapper.classList.add('hidden');
            } else {
                // PC : Le menu Hamburger n'étant pas visible, on cache complètement le conteneur
                globalSearchContainer.classList.add('hidden');
            }
        }
    }
}

export function showTab(tabId) {
    const tabButton = document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`);
    if(tabButton) tabButton.classList.remove('hidden');
}

export function hideTab(tabId) {
    const tabButton = document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`);
    if(tabButton) tabButton.classList.add('hidden');
}

export function showAllTabs() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('hidden'));
}

export function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn?.querySelector('i');

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark');
            if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
                const desktopLabel = document.getElementById('desktop-theme-label');
            if (desktopLabel) desktopLabel.textContent = 'Mode Clair';
        } else {
            document.body.classList.remove('dark');
            if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
                const desktopLabel = document.getElementById('desktop-theme-label');
            if (desktopLabel) desktopLabel.textContent = 'Mode Sombre';
        }
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    // Check for saved theme in localStorage, or use system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (systemPrefersDark) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }
}

export function setupScrollToTop() {
    const scrollToTopBtn = document.getElementById('scroll-to-top');
    const mainContent = document.querySelector('main');

    if (!scrollToTopBtn || !mainContent) return;

    mainContent.addEventListener('scroll', () => {
        if (mainContent.scrollTop > 300) {
            scrollToTopBtn.classList.remove('hidden');
        } else {
            scrollToTopBtn.classList.add('hidden');
        }
    });

    scrollToTopBtn.addEventListener('click', () => {
        mainContent.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}
