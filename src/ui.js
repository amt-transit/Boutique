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
        } else {
            document.body.classList.remove('dark');
            if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
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

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.body.classList.contains('dark');
            const newTheme = isDark ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
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
