// src/main.js
import { setupLoginForm, setupAuthListener } from './auth.js';
import { setupRegisterForm } from './register.js';
import { setupModalListeners, switchTab, showTab, hideTab, setupThemeToggle, setupScrollToTop } from './ui.js';
import { setupDashboard } from './pages/dashboard.js';
import { setupStockManagement } from './pages/stock.js';
import { setupSalesPage, renderCart } from './pages/sales.js';
import { setupCredits } from './pages/credits.js';
import { setupExpenses } from './pages/expenses.js';
import { setupReports } from './pages/reports.js';
import { setupAudit } from './pages/audit.js';
import { setupOrdersListener } from './pages/orders.js';
import { setupSuppliersPage } from './pages/suppliers.js';
import { setupAdminFeatures, setupSuperAdminDashboard, setupAdminAccessPage, loadBoutiquesList } from './admin/main.js'; 
import { setupImport } from './admin/import.js';
import { setupGlobalSearch } from './globalSearch.js';
import { setupHamburgerMenu, closeHamburgerMenu } from './hamburger.js';
import { setupTeamManagement } from './pages/team.js';

// Make some functions globally available for onclick attributes
window.switchTab = switchTab;
window.renderCart = renderCart;
window.closeHamburgerMenu = closeHamburgerMenu;

// This function is called after a user is authenticated and is not a super admin
function initializeApplication() {
    setupDashboard();
    setupStockManagement();
    setupSalesPage();
    setupCredits();
    setupExpenses();
    setupReports();
    setupAudit();
    setupOrdersListener();
    setupSuppliersPage();
    setupGlobalSearch();
    setupTeamManagement();
    if (window.lucide) window.lucide.createIcons();
}
window.initializeApplication = initializeApplication;

// This function is called if the authenticated user is a super admin
function showSuperAdminInterface() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('top-nav-bar').classList.remove('hidden');
    document.getElementById('dashboard-user-name').textContent = "SUPER ADMIN";
    
    // Hide all tabs to ensure a clean slate, but keep the logout button visible
    document.querySelectorAll('#top-nav-bar .tab').forEach(t => {
        if (t.id !== 'bottom-logout-btn') {
            t.classList.add('hidden');
        }
    });

    showTab('admin');
    showTab('admin-access');
    switchTab('admin');
    
    // Initialize all admin-related functionalities
    setupAdminFeatures();
    setupImport();
    loadBoutiquesList(); 
    setupAdminAccessPage(); 
    setupSuperAdminDashboard();
    
    if (window.lucide) window.lucide.createIcons();
}

// Main entry point for the application
function main() {
    // Pass the initialization functions to the auth listener
    setupAuthListener(initializeApplication, showSuperAdminInterface);
    
    setupLoginForm();
    setupRegisterForm();
    setupModalListeners();
    setupThemeToggle();
    setupScrollToTop();
    setupHamburgerMenu();
}

// Start the application
document.addEventListener('DOMContentLoaded', main);
