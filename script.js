// ===============================================
// SCRIPT: GESTION BOUTIQUE V12 (STABLE & CORRIGÉE)
// ===============================================

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, 
    onSnapshot, query, where, orderBy, limit, serverTimestamp, writeBatch, deleteDoc, 
    increment, setLogLevel, initializeFirestore, persistentLocalCache
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCluRVv-olQsTuZZBPjjJns1jHq0vkhjSw",
    authDomain: "maboutique-7891.firebaseapp.com",
    projectId: "maboutique-7891",
    storageBucket: "maboutique-7891.firebasestorage.app",
    messagingSenderId: "402820959115",
    appId: "1:402820959115:web:6fb6b2c78fc9c5fe203d8e"
};

// --- VARIABLES GLOBALES ---
let db, auth, userId;
let allProducts = [], saleCart = []; 
let currentBoutiqueId = null, userRole = null;
let actionToConfirm = null;
let isQuickAddMode = false;
let currentAccessShopId = null;
let allShopsList = []; 
let loadedTransactions = [];
let isScanningForNewProduct = false;

// ================= INIT =================

async function main() {
    const app = initializeApp(firebaseConfig);
    
    // ACTIVATION DU MODE HORS-LIGNE (Nouvelle méthode v11+ pour éviter le warning deprecated)
    db = initializeFirestore(app, {localCache: persistentLocalCache()});
    console.log("Mode hors-ligne activé");

    auth = getAuth(app);
    setLogLevel('error');

    setupLoginForm();
    setupAuthListener();
    setupAdminFeatures();
    setupModalListeners();
}

async function getAvailableBoutiques() {
    try {
        const s = await getDocs(collection(db, "boutiques"));
        const b = [];
        s.forEach(d => b.push({id: d.id, ...d.data()}));
        return b;
    } catch (e) { return []; }
}

const convertBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

// ================= AUTHENTIFICATION =================

function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error-msg');
    const errorText = document.getElementById('login-error-text');
    const forgotLink = document.getElementById('forgot-password-link');
    const logoutBtn = document.getElementById('bottom-logout-btn');
    const togglePwdBtn = document.getElementById('toggle-password-visibility');
    const pwdInput = document.getElementById('login-password');

    if (togglePwdBtn && pwdInput) {
        togglePwdBtn.addEventListener('click', () => {
            // Vérifier le type actuel
            const type = pwdInput.getAttribute('type') === 'password' ? 'text' : 'password';
            
            // Changer le type (Texte <-> Masqué)
            pwdInput.setAttribute('type', type);
            
            // Changer l'icône (Oeil ouvert <-> Oeil barré)
            if (type === 'password') {
                togglePwdBtn.innerHTML = '<i data-lucide="eye"></i>';
            } else {
                togglePwdBtn.innerHTML = '<i data-lucide="eye-off"></i>';
            }
            
            // Rafraîchir les icônes Lucide
            if (window.lucide) window.lucide.createIcons();
        });
    }

    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(errorBox) errorBox.classList.add('hidden');
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;

            try {
                await signInWithEmailAndPassword(auth, email, pass);
            } catch (error) {
                console.error("Erreur Auth:", error.code);
                let message = "Erreur de connexion.";
                if (error.code.includes('invalid') || error.code.includes('user-not-found') || error.code.includes('wrong-password')) message = "Email ou mot de passe incorrect.";
                if(errorText) errorText.textContent = message;
                if(errorBox) errorBox.classList.remove('hidden');
            }
        });
    }

    if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

    if(forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            let email = document.getElementById('login-email').value;
            if (!email) email = prompt("Entrez votre email :");
            if (email) { 
                try { 
                    await sendPasswordResetEmail(auth, email); 
                    showToast("Email envoyé !", "success"); 
                } catch (err) { showToast(err.message, "error"); } 
            }
        });
    }
}

function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            try {
                const superAdminDoc = await getDoc(doc(db, "super_admins", userId));
                if (superAdminDoc.exists()) { showSuperAdminInterface(); return; }
                
                const userDoc = await getDoc(doc(db, "users", userId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    if (!data.boutiqueId) { showToast("Erreur compte", "error"); await signOut(auth); return; }
                    currentBoutiqueId = data.boutiqueId;
                    userRole = data.role;
                    
                    const dashName = document.getElementById('dashboard-user-name');
                    if(dashName) dashName.textContent = `${data.boutiqueName}`;
                    
                    const adminTab = document.getElementById('admin-tab-btn');
                    if(adminTab) adminTab.classList.add('hidden'); 
                    const accessTab = document.getElementById('admin-access-tab-btn');
                    if(accessTab) accessTab.classList.add('hidden'); 

                    document.getElementById('auth-container').classList.add('hidden');
                    document.getElementById('app-container').classList.remove('hidden');
                    document.getElementById('top-nav-bar').classList.remove('hidden');
                    
                    showAllTabs(); 
                    if (userRole === 'seller') { 
                        hideTab('dashboard'); hideTab('admin'); hideTab('admin-access'); 
                        switchTab('ventes'); 
                    } 
                    else { 
                        hideTab('admin'); hideTab('admin-access'); 
                        switchTab('dashboard'); 
                    }
                    initializeApplication();
                } else { showToast("Compte introuvable", "error"); await signOut(auth); }
            } catch (err) { console.error(err); }
        } else {
            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
            document.getElementById('top-nav-bar').classList.add('hidden');
            currentBoutiqueId = null;
            // On s'assure que les icônes de la page de connexion sont bien dessinées
            if (window.lucide) window.lucide.createIcons();
        }
    });
}

function showSuperAdminInterface() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('top-nav-bar').classList.remove('hidden');
    document.getElementById('dashboard-user-name').textContent = "SUPER ADMIN";
    
    const adminTab = document.getElementById('admin-tab-btn');
    if(adminTab) adminTab.classList.remove('hidden');
    const accessTab = document.getElementById('admin-access-tab-btn');
    if(accessTab) accessTab.classList.remove('hidden');

    ['dashboard','ventes','stock','commandes','credits','rapports','charges','audit'].forEach(hideTab);
    showTab('admin');
    showTab('admin-access');
    switchTab('admin');
    loadShopsForImport();  // <--- Le bon nom de la fonction
    loadBoutiquesList(); 
    setupAdminAccessPage(); 
    if (window.lucide) window.lucide.createIcons();
}

function initializeApplication() {
    if(!currentBoutiqueId) return;
    setupDashboard();
    setupStockManagement();
    setupSalesPage();
    setupCredits();
    setupExpenses();
    setupReports();
    setupAudit();
    setupOrdersListener();
    if (window.lucide) window.lucide.createIcons();
}
function setupOrdersListener() {
    const container = document.getElementById('orders-list-container');
    if(!container) return;

    onSnapshot(query(collection(db, "boutiques", currentBoutiqueId, "commandes"), where("status", "==", "en_attente")), (snap) => {
        container.innerHTML = '';
        
        if (snap.empty) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-400 p-8 bg-white rounded-xl">Aucune commande en attente.</div>';
            return;
        }

        snap.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString() : '-';
            
            // Création de la carte HTML pour chaque commande
            const card = document.createElement('div');
            card.className = "bg-white p-5 rounded-xl shadow border border-indigo-100 flex flex-col justify-between";
            
            let itemsHtml = order.items.map(i => `<div class="flex justify-between text-sm text-gray-600"><span>${i.qty}x ${i.nomDisplay}</span><span>${formatPrice(i.prixVente * i.qty)}</span></div>`).join('');

            card.innerHTML = `
                <div class="mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-lg text-indigo-900">${order.client}</h4>
                        <span class="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded">${dateStr}</span>
                    </div>
                    <div class="text-xs text-gray-400 mb-3">${order.telephone}</div>
                    <div class="space-y-1 border-t border-b py-2 my-2 border-gray-100 max-h-32 overflow-y-auto">
                        ${itemsHtml}
                    </div>
                    <div class="flex justify-between font-bold text-lg mt-2">
                        <span>Total:</span>
                        <span class="text-indigo-600">${formatPrice(order.total)}</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <button onclick="cancelOrder('${order.id}')" class="bg-red-50 text-red-600 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition">Annuler</button>
                    <button onclick="validateOrder('${order.id}')" class="bg-green-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition shadow">Encaisser</button>
                </div>
            `;
            container.appendChild(card);
        });
        if (window.lucide) window.lucide.createIcons();
    });
}
// Transformer la commande en VRAIE vente (Encaissement)
window.validateOrder = async (orderId) => {
    if(!confirm("Le client a payé ? Confirmer la vente ?")) return;

    try {
        const orderDoc = await getDoc(doc(db, "boutiques", currentBoutiqueId, "commandes", orderId));
        if(!orderDoc.exists()) return;
        const order = orderDoc.data();

        const batch = writeBatch(db);

        // 1. Créer la vente officielle (C'est là que l'argent rentre dans le rapport)
        const saleRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
        
        let profit = 0;
        // On recalcule le profit et on met à jour les stats de vente
        for(const item of order.items) {
            profit += (item.prixVente - (item.prixAchat || 0)) * item.qty;
            
            // MAINTENANT on augmente la stat "Quantité Vendue" 
            // (Le stock a déjà été baissé à la commande, on ne le touche plus)
            const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(pRef, { quantiteVendue: increment(item.qty) });
        }

        batch.set(saleRef, {
            items: order.items,
            total: order.total,
            profit: profit,
            date: serverTimestamp(),
            vendeurId: userId,
            type: 'cash', // Ou demandez si c'est un crédit
            clientName: order.client,
            deleted: false
        });

        // 2. Supprimer la commande (ou la passer en archivée)
        // Ici on supprime pour garder la liste propre
        batch.delete(doc(db, "boutiques", currentBoutiqueId, "commandes", orderId));

        await batch.commit();
        showToast("Vente encaissée avec succès !", "success");

    } catch (e) {
        console.error(e);
        showToast("Erreur validation", "error");
    }
};

// Annuler la commande (Remettre en stock)
window.cancelOrder = async (orderId) => {
    if(!confirm("Annuler cette commande et remettre les articles en stock ?")) return;

    try {
        const orderDoc = await getDoc(doc(db, "boutiques", currentBoutiqueId, "commandes", orderId));
        if(!orderDoc.exists()) return;
        const order = orderDoc.data();

        const batch = writeBatch(db);

        // 1. Remettre le stock (Restockage)
        for (const item of order.items) {
            const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(item.qty) });
        }

        // 2. Supprimer la commande
        batch.delete(doc(db, "boutiques", currentBoutiqueId, "commandes", orderId));

        await batch.commit();
        showToast("Commande annulée, stock restauré.");

    } catch (e) {
        console.error(e);
        showToast("Erreur annulation", "error");
    }
};
// ================= DASHBOARD =================

function setupDashboard() {
    let totalVentesEncaissees = 0; 
    let totalDepenses = 0; 
    let caisseInitiale = 0;
    let salesChartInstance = null;
    let topProductsChartInstance = null;

    function updateDashboardTotals() {
        const beneficeReel = (caisseInitiale + totalVentesEncaissees) - totalDepenses;
        const elCaisse = document.getElementById('dash-caisse-initiale');
        if(elCaisse) elCaisse.textContent = formatPrice(caisseInitiale);
        const elSales = document.getElementById('dash-total-sales');
        if(elSales) elSales.textContent = formatPrice(totalVentesEncaissees);
        const elExp = document.getElementById('dash-total-expenses');
        if(elExp) elExp.textContent = formatPrice(totalDepenses);
        const elProfit = document.getElementById('dash-total-profit');
        if(elProfit) {
            elProfit.textContent = formatPrice(beneficeReel);
            elProfit.className = `text-2xl font-bold ${beneficeReel < 0 ? 'text-red-600' : 'text-green-600'}`;
        }
    }

    onSnapshot(doc(db, "boutiques", currentBoutiqueId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            caisseInitiale = data.caisseInitiale || 0;
            const logoImg = document.getElementById('dash-shop-logo');
            if(logoImg && data.logo) { logoImg.src = data.logo; logoImg.classList.remove('hidden'); }
            else if(logoImg) { logoImg.classList.add('hidden'); }
            updateDashboardTotals();
        }
    });

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => {
        totalDepenses = 0;
        snap.forEach(d => { if (!d.data().deleted) totalDepenses += (d.data().montant || 0); });
        updateDashboardTotals();
    });

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "ventes"), (snap) => {
        totalVentesEncaissees = 0;
        const productStats = {}; 
        const sales = [];
        snap.forEach(d => { if(!d.data().deleted) sales.push(d.data()); });
        sales.sort((a,b) => b.date?.seconds - a.date?.seconds);

        sales.forEach(s => {
            if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement') {
                totalVentesEncaissees += s.total || 0;
            }
            if (s.type === 'retour') totalVentesEncaissees -= (s.total || 0);

            if(s.items && Array.isArray(s.items) && s.type !== 'remboursement') {
                const multiplier = (s.type === 'retour' || s.type === 'retour_credit') ? -1 : 1;
                s.items.forEach(item => {
                    const keyName = (item.nomDisplay || item.nom || "Inconnu").trim().toUpperCase();
                    if (!productStats[keyName]) productStats[keyName] = { name: keyName, qty: 0, revenue: 0 };
                    productStats[keyName].qty += (item.qty || 0) * multiplier;
                    productStats[keyName].revenue += (s.type === 'cash_import' ? s.total : ((item.prixVente || 0) * (item.qty || 0))) * multiplier;
                });
            }
        });

        updateDashboardTotals();
        renderDashboardCharts(sales, productStats);
        setupClickableModals(sales, productStats);
    });

    function renderDashboardCharts(sales, productStats) {
        if (typeof Chart === 'undefined') return;
        const salesCtx = document.getElementById('sales-over-time-chart')?.getContext('2d');
        if (salesCtx) {
            const last30days = {};
            for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); last30days[d.toISOString().split('T')[0]] = 0; }
            sales.forEach(s => { if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement') { const key = s.date.toDate().toISOString().split('T')[0]; if (last30days.hasOwnProperty(key)) last30days[key] += s.total; }});
            const labels = Object.keys(last30days).map(d => new Date(d).toLocaleDateString('fr-FR', {day:'2-digit', month:'short'}));
            const data = Object.values(last30days);
            if (salesChartInstance) { salesChartInstance.data.labels = labels; salesChartInstance.data.datasets[0].data = data; salesChartInstance.update(); } 
            else { salesChartInstance = new Chart(salesCtx, { type: 'line', data: { labels, datasets: [{ label: 'CA', data, backgroundColor: 'rgba(37, 99, 235, 0.1)', borderColor: '#2563eb', borderWidth: 2, tension: 0.3, fill: true }] }, options: { responsive: true, maintainAspectRatio: false } }); }
        }
        const topProductsCtx = document.getElementById('top-products-chart')?.getContext('2d');
        if (topProductsCtx) {
            const top5 = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
            const labels = top5.map(p => p.name);
            const data = top5.map(p => p.revenue);
            if (topProductsChartInstance) { topProductsChartInstance.data.labels = labels; topProductsChartInstance.data.datasets[0].data = data; topProductsChartInstance.update(); } 
            else { topProductsChartInstance = new Chart(topProductsCtx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }); }
        }
    }

    function setupClickableModals(sales, productStats) {
        const setup = (triggerId, modalId, title, data, renderer) => {
            const trigger = document.getElementById(triggerId);
            if (trigger) trigger.onclick = () => {
                document.getElementById(modalId + '-title').textContent = title;
                document.getElementById(modalId + '-body').innerHTML = renderer(data);
                document.getElementById(modalId).classList.remove('hidden');
            };
        };
        setup('dash-low-stock-trigger', 'dashboard-generic-modal', 'Produits en Stock Faible', null, () => {
            // CORRECTION : On exclut les produits "discontinued"
            const low = allProducts.filter(p => !p.deleted && !p.discontinued && p.stock < 5).sort((a,b) => a.stock - b.stock);
            return low.length === 0 ? '<p class="p-4 text-center">Aucun</p>' : `<table class="w-full text-sm"><thead><tr class="border-b"><th class="p-2 text-left">Produit</th><th class="p-2 text-right">Stock</th></tr></thead><tbody>${low.map(p => `<tr class="border-b last:border-0"><td class="p-2">${p.nomDisplay}</td><td class="p-2 text-right font-bold text-red-600">${p.stock}</td></tr>`).join('')}</tbody></table>`;
        });
        setup('dash-recent-sales-trigger', 'dashboard-generic-modal', 'Dernières Ventes', sales, (d) => {
            return d.length === 0 ? '<p class="p-4 text-center">Aucune</p>' : `<table class="w-full text-sm"><thead><tr class="border-b"><th class="p-2 text-left">Date</th><th class="p-2 text-left">Description</th><th class="p-2 text-right">Total</th></tr></thead><tbody>${d.slice(0,20).map(s => { const desc = s.items?.map(i=>i.nomDisplay).join(', ') || 'Vente'; return `<tr class="border-b last:border-0"><td class="p-2 text-xs">${s.date.toDate().toLocaleString()}</td><td class="p-2">${desc}</td><td class="p-2 text-right font-bold">${formatPrice(s.total)}</td></tr>`}).join('')}</tbody></table>`;
        });
        setup('dash-top-profit-trigger', 'dashboard-generic-modal', 'Top 10 Rentabilité', productStats, (d) => {
            const top = Object.values(d).sort((a,b) => b.revenue - a.revenue).slice(0,10);
            return top.length === 0 ? '<p class="p-4 text-center">Aucun</p>' : `<table class="w-full text-sm"><thead><tr class="border-b"><th class="p-2 text-left">Produit</th><th class="p-2 text-right">Revenu</th></tr></thead><tbody>${top.map(p => `<tr class="border-b last:border-0"><td class="p-2">${p.name}</td><td class="p-2 text-right font-bold text-green-600">${formatPrice(p.revenue)}</td></tr>`).join('')}</tbody></table>`;
        });
        setup('dash-top-qty-trigger', 'dashboard-generic-modal', 'Top 10 Ventes (Quantité)', productStats, (d) => {
            const top = Object.values(d).sort((a,b) => b.qty - a.qty).slice(0,10);
            return top.length === 0 ? '<p class="p-4 text-center">Aucun</p>' : `<table class="w-full text-sm"><thead><tr class="border-b"><th class="p-2 text-left">Produit</th><th class="p-2 text-right">Quantité</th></tr></thead><tbody>${top.map(p => `<tr class="border-b last:border-0"><td class="p-2">${p.name}</td><td class="p-2 text-right font-bold text-blue-600">${p.qty}</td></tr>`).join('')}</tbody></table>`;
        });
    }
}

// ================= STOCK =================

function setupStockManagement() {
    const stockForm = document.getElementById('form-stock');
    const editForm = document.getElementById('form-edit-product');
    const searchInput = document.getElementById('stock-search-input');
    const sortSelect = document.getElementById('stock-sort-select');
    const btnScanNew = document.getElementById('btn-scan-new-prod');
    if (btnScanNew) {
        btnScanNew.addEventListener('click', () => {
            isScanningForNewProduct = true; // On active le mode "Nouveau Produit"
            startScanner();
        });
    }

    const renderStockTable = () => {
        const tbody = document.getElementById('stock-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        let filteredData = allProducts;
        if (searchInput && searchInput.value) {
            const term = searchInput.value.toLowerCase();
            filteredData = allProducts.filter(p => p.nom.includes(term));
        }
        if (sortSelect) {
            const sortType = sortSelect.value;
            filteredData.sort((a, b) => {
                if (sortType === 'name_asc') return a.nom.localeCompare(b.nom);
                if (sortType === 'price_asc') return (a.prixAchat || 0) - (b.prixAchat || 0);
                if (sortType === 'price_desc') return (b.prixAchat || 0) - (a.prixAchat || 0);
                if (sortType === 'stock_asc') return a.stock - b.stock;
                if (sortType === 'stock_desc') return b.stock - a.stock;
                if (sortType === 'date_desc') return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0);
                return 0;
            });
        }

        filteredData.forEach(p => {
            const tr = document.createElement('tr');
            let rowClass = p.deleted ? "deleted-row" : "border-b border-gray-100 hover:bg-gray-50 transition";
            let rowAction = "";
            if (userRole === 'admin' && !p.deleted) { 
                const productData = encodeURIComponent(JSON.stringify(p)); 
                rowAction = `onclick="openEditProduct('${productData}')"`; 
                rowClass += " cursor-pointer hover:bg-blue-50"; 
            }
            const deleteBtn = (userRole === 'admin' && !p.deleted) ? `<button class="text-red-500 hover:bg-red-100 p-2 rounded-full transition" onclick="event.stopPropagation(); deleteProduct('${p.id}')" title="Archiver"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
            
            const reste = p.stock || 0; 
            const vendu = p.quantiteVendue || 0; 
            const total = reste + vendu;
            const dateStr = p.createdAt ? new Date(p.createdAt.seconds*1000).toLocaleDateString() : '-';

            // Indicateur visuel pour les produits arrêtés
            let statusBadge = "";
            if (p.discontinued) {
                statusBadge = '<span class="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-300 ml-2" title="Ce produit ne sera plus approvisionné">⛔ Fin</span>';
            }

            tr.className = rowClass;
            tr.innerHTML = `<td ${rowAction} class="p-4 text-xs text-gray-400">${dateStr}</td><td ${rowAction} class="p-4 font-medium text-gray-800">${p.nomDisplay || p.nom} ${statusBadge} ${p.deleted ? '(Archivé)' : ''}</td><td ${rowAction} class="p-4 font-bold text-blue-600">${formatPrice(p.prixAchat || 0)}</td><td ${rowAction} class="p-4 text-gray-500 text-sm">${formatPrice(p.prixVente || 0)}</td><td ${rowAction} class="p-4 text-center font-bold text-gray-500">${total}</td><td ${rowAction} class="p-4 text-center font-bold text-orange-600">${vendu}</td><td ${rowAction} class="p-4 text-center"><span class="${reste < 5 && !p.deleted ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'} px-3 py-1 rounded-full text-xs font-bold">${reste}</span></td><td class="p-4 text-right">${deleteBtn}</td>`;
            tbody.appendChild(tr);
        });
        
        if (window.lucide) window.lucide.createIcons();
        
        let totalAchat = 0, totalVente = 0, totalItems = 0;
        allProducts.forEach(p => { if(!p.deleted) { totalAchat += (p.prixAchat||0)*(p.stock||0); totalVente += (p.prixVente||0)*(p.stock||0); totalItems += (p.stock||0); }});
        if(document.getElementById('stock-total-value')) document.getElementById('stock-total-value').textContent = formatPrice(totalAchat);
        if(document.getElementById('stock-potential-value')) document.getElementById('stock-potential-value').textContent = formatPrice(totalVente);
        if(document.getElementById('stock-total-count')) document.getElementById('stock-total-count').textContent = totalItems;
    };

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "products"), (snap) => {
        allProducts = [];
        snap.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            if (p.deleted && userRole === 'seller') return;
            allProducts.push(p);
        });

        // Mise à jour du badge "Stock Faible" sur le dashboard
        const lowStockBadge = document.getElementById('dash-low-stock-badge');
        if (lowStockBadge) {
            // CORRECTION : On exclut les produits "discontinued" (Fin de série)
            const lowCount = allProducts.filter(p => !p.deleted && !p.discontinued && p.stock > 0 && p.stock < 5).length;
            lowStockBadge.textContent = lowCount;
            lowStockBadge.classList.toggle('hidden', lowCount === 0);
        }
        renderStockTable();
    });

    if(searchInput) searchInput.addEventListener('input', renderStockTable);
    if(sortSelect) sortSelect.addEventListener('change', renderStockTable);

    const nameInput = document.getElementById('prod-nom');
    const suggestionsDiv = document.getElementById('prod-nom-suggestions');
    if(nameInput && suggestionsDiv) {
        nameInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            suggestionsDiv.innerHTML = '';
            if (val.length < 1) { suggestionsDiv.classList.add('hidden'); return; }
            const uniqueNames = [...new Set(allProducts.map(p => p.nomDisplay))];
            const matches = uniqueNames.filter(n => n.toLowerCase().includes(val));
            if (matches.length > 0) {
                suggestionsDiv.classList.remove('hidden');
                matches.forEach(matchName => {
                    const div = document.createElement('div');
                    div.className = "p-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 border-b last:border-0";
                    div.textContent = matchName;
                    div.onclick = () => {
                        nameInput.value = matchName;
                        suggestionsDiv.classList.add('hidden');
                        const existingProduct = allProducts.find(p => p.nomDisplay === matchName);
                        if(existingProduct) {
                            document.getElementById('prod-achat').value = existingProduct.prixAchat;
                            document.getElementById('prod-prix').value = existingProduct.prixVente;
                            showToast("Produit existant détecté", "success");
                        }
                    };
                    suggestionsDiv.appendChild(div);
                });
            } else { suggestionsDiv.classList.add('hidden'); }
        });
        document.addEventListener('click', (e) => { if(e.target !== nameInput && e.target !== suggestionsDiv) suggestionsDiv.classList.add('hidden'); });
    }

    if(stockForm) {
        stockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Récupération des données
            const codeBarre = document.getElementById('prod-code').value.trim(); // <--- NOUVEAU
            const nomBrut = document.getElementById('prod-nom').value;
            const nom = nomBrut.toLowerCase().trim();
            const pAchat = parseFloat(document.getElementById('prod-achat').value)||0;
            const pVente = parseFloat(document.getElementById('prod-prix').value)||0;
            const qte = parseInt(document.getElementById('prod-qte').value);

            try {
                // On vérifie si le nom existe déjà (votre code actuel)
                const q = query(collection(db, "boutiques", currentBoutiqueId, "products"), where("nom", "==", nom), where("deleted", "==", false));
                const snap = await getDocs(q);
                
                // On vérifie aussi si le CODE BARRE existe déjà (sécurité)
                let existingByCode = null;
                if(codeBarre) {
                    existingByCode = allProducts.find(p => p.codeBarre === codeBarre && !p.deleted);
                }

                const batch = writeBatch(db);
                let productId = null;

                if (!snap.empty || existingByCode) {
                    // Produit existant (par nom ou par code)
                    const docExist = snap.empty ? null : snap.docs[0];
                    const existingData = existingByCode || (docExist ? {id: docExist.id, ...docExist.data()} : null);
                    
                    if(existingData) {
                        productId = existingData.id;
                        const ref = doc(db, "boutiques", currentBoutiqueId, "products", productId);
                        
                        // On met à jour le stock et on ajoute le code-barre si manquant
                        batch.update(ref, { 
                            stock: increment(qte), 
                            prixAchat: pAchat, 
                            prixVente: pVente, 
                            codeBarre: codeBarre || existingData.codeBarre, // Mise à jour code
                            lastRestock: serverTimestamp() 
                        });
                        showToast(`Stock mis à jour (+${qte})`);
                    }
                } else {
                    // Création nouveau produit
                    const newRef = doc(collection(db, "boutiques", currentBoutiqueId, "products"));
                    productId = newRef.id;
                    batch.set(newRef, { 
                        nom: nom, 
                        nomDisplay: nomBrut, 
                        codeBarre: codeBarre, // <--- ENREGISTREMENT DU CODE
                        prixVente: pVente, 
                        prixAchat: pAchat, 
                        stock: qte, 
                        quantiteVendue: 0, 
                        createdAt: serverTimestamp(), 
                        deleted: false 
                    });
                    showToast("Produit créé avec succès");
                }

                // Historique Mouvement
                const histRef = doc(collection(db, "boutiques", currentBoutiqueId, "mouvements_stock"));
                batch.set(histRef, { productId: productId, nom: nomBrut, type: 'ajout', quantite: qte, prixAchat: pAchat, date: serverTimestamp(), user: userId });
                
                await batch.commit();
                
                // Reset du formulaire
                stockForm.reset(); 
                document.getElementById('add-product-form').classList.add('hidden'); 
                if(suggestionsDiv) suggestionsDiv.classList.add('hidden');
                isScanningForNewProduct = false; // Reset du mode

            } catch (err) { console.error(err); showToast("Erreur ajout", "error"); }
        });
    }
    
    window.openEditProduct = async (encodedProduct) => {
        const p = JSON.parse(decodeURIComponent(encodedProduct));
        document.getElementById('edit-prod-id').value = p.id;
        document.getElementById('edit-prod-nom').value = p.nomDisplay;
        document.getElementById('edit-prod-achat').value = p.prixAchat;
        document.getElementById('edit-prod-vente').value = p.prixVente;
        document.getElementById('edit-prod-stock').value = p.stock;
        document.getElementById('edit-prod-discontinued').checked = p.discontinued || false; // Charger l'état de la case
        
        const form = document.getElementById('form-edit-product');
        if(form) { form.dataset.oldAchat = p.prixAchat; form.dataset.oldVente = p.prixVente; form.dataset.oldStock = p.stock; }
        document.getElementById('edit-product-modal').classList.remove('hidden');

        const historyBody = document.getElementById('product-history-body');
        if(historyBody) {
            historyBody.innerHTML = '<tr><td colspan="3" class="p-2 text-center text-gray-500">Chargement...</td></tr>';
            try {
                const q = query(collection(db, "boutiques", currentBoutiqueId, "mouvements_stock"), where("productId", "==", p.id));
                const snap = await getDocs(q);
                let moves = [];
                snap.forEach(d => moves.push(d.data()));
                moves.sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0));

                historyBody.innerHTML = '';
                if (moves.length === 0) historyBody.innerHTML = '<tr><td colspan="3" class="p-2 text-center text-gray-400 italic">Aucun historique</td></tr>';
                else {
                    moves.forEach(m => {
                        const dateStr = m.date ? new Date(m.date.seconds*1000).toLocaleDateString() : '-';
                        let label = ""; let color = "text-gray-600"; let details = "";
                        if (m.type === 'ajout') { label = `📥 Appro.`; color = "text-green-600 font-bold"; details = `+${m.quantite} (Achat: ${formatPrice(m.prixAchat)})`; } 
                        else if (m.type === 'perime') { label = `🗑️ Perte`; color = "text-red-600 font-bold"; details = `-${m.quantite}`; } 
                        else if (m.type === 'modif') { label = `✏️ Modif`; color = "text-blue-600"; details = "Infos"; }
                        else if (m.type === 'retour') { label = `↩️ Retour`; color = "text-blue-600 font-bold"; details = `+${m.quantite}`; }
                        historyBody.innerHTML += `<tr class="border-b last:border-0 hover:bg-gray-50"><td class="p-2 text-gray-500 text-xs">${dateStr}</td><td class="p-2 text-xs ${color}">${label}</td><td class="p-2 text-xs text-right">${details}</td></tr>`;
                    });
                }
            } catch (e) { console.error(e); }
        }
    };

    if(editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-prod-id').value;
            const nom = document.getElementById('edit-prod-nom').value;
            const newAchat = parseFloat(document.getElementById('edit-prod-achat').value) || 0;
            const newVente = parseFloat(document.getElementById('edit-prod-vente').value) || 0;
            const newStock = parseInt(document.getElementById('edit-prod-stock').value) || 0;
            const oldAchat = parseFloat(editForm.dataset.oldAchat) || 0;
            const oldVente = parseFloat(editForm.dataset.oldVente) || 0;
            const oldStock = parseInt(editForm.dataset.oldStock) || 0;
            const discontinued = document.getElementById('edit-prod-discontinued').checked;

            try {
                const batch = writeBatch(db);
                const prodRef = doc(db, "boutiques", currentBoutiqueId, "products", id);
                batch.update(prodRef, { prixAchat: newAchat, prixVente: newVente, stock: newStock, discontinued: discontinued, lastModified: serverTimestamp() });
                
                let changes = [];
                if (newAchat !== oldAchat) changes.push(`Achat`);
                if (newVente !== oldVente) changes.push(`Vente`);
                if (newStock !== oldStock) changes.push(`Stock`);
                if (discontinued) changes.push(`Arrêt Appro.`);

                if (changes.length > 0) {
                    const traceRef = doc(collection(db, "boutiques", currentBoutiqueId, "mouvements_stock"));
                    batch.set(traceRef, { productId: id, productName: nom, type: 'modif', details: changes.join(', '), user: userId, date: serverTimestamp() });
                }
                await batch.commit();
                showToast("Modifié avec succès");
                document.getElementById('edit-product-modal').classList.add('hidden');
            } catch (err) { console.error(err); showToast("Erreur modification", "error"); }
        });
    }

    window.signalerPerime = async () => {
        const id = document.getElementById('edit-prod-id').value;
        const nom = document.getElementById('edit-prod-nom').value;
        const qteStr = prompt("Quantité périmée ou cassée à retirer du stock :");
        if(!qteStr) return;
        const qte = parseInt(qteStr);
        if(isNaN(qte) || qte <= 0) return showToast("Quantité invalide", "error");
        try {
            const batch = writeBatch(db);
            const prodRef = doc(db, "boutiques", currentBoutiqueId, "products", id);
            batch.update(prodRef, { stock: increment(-qte) });
            const traceRef = doc(collection(db, "boutiques", currentBoutiqueId, "mouvements_stock"));
            batch.set(traceRef, { productId: id, productName: nom, type: 'perime', quantite: qte, date: serverTimestamp(), user: userId });
            await batch.commit();
            showToast(`${qte} produits retirés`);
            document.getElementById('edit-product-modal').classList.add('hidden');
        } catch(e) { console.error(e); showToast("Erreur", "error"); }
    };

    window.deleteProduct = (id) => { if(confirm("Archiver ce produit ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "products", id), { deleted: true }); };
}

// ================= VENTES =================

async function loadClientsIntoSelect() {
    const select = document.getElementById('credit-client-select');
    select.innerHTML = '<option value="">Chargement...</option>';
    const clientsSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "clients"));
    if (clientsSnap.empty) { select.innerHTML = '<option value="">Aucun client</option>'; return; }
    select.innerHTML = '<option value="">-- Choisir un client --</option>';
    clientsSnap.forEach(doc => { if(!doc.data().deleted) { const opt = document.createElement('option'); opt.value = doc.id; opt.textContent = doc.data().nom; select.appendChild(opt); }});
}

function setupSalesPage() {
    const searchInput = document.getElementById('sale-search');
    const resultsDiv = document.getElementById('sale-search-results');
    const btnCash = document.getElementById('btn-validate-cash');
    const btnCredit = document.getElementById('btn-open-credit-modal');
    const btnQuickAdd = document.getElementById('btn-quick-add-client');
    const dateDisplay = document.getElementById('current-date-display');
    const btnScan = document.getElementById('btn-scan-product');
    if (btnScan) {
        // On attache la fonction ici, c'est beaucoup plus fiable qu'un onclick HTML
        btnScan.addEventListener('click', startScanner);
    }
    if(dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (term.length < 1) { resultsDiv.classList.add('hidden'); return; }
        const matches = allProducts.filter(p => p.nom.includes(term) && !p.deleted);
        resultsDiv.innerHTML = '';
        if (matches.length > 0) {
            resultsDiv.classList.remove('hidden');
            matches.forEach(p => {
                const div = document.createElement('div');
                div.className = "p-3 hover:bg-blue-50 cursor-pointer border-b flex justify-between";
                div.innerHTML = `<span>${p.nomDisplay}</span><span class="${p.stock>0?'text-green-600':'text-red-600'} font-bold">${p.stock}</span>`;
                div.onclick = () => addToCart(p);
                resultsDiv.appendChild(div);
            });
        } else { resultsDiv.classList.add('hidden'); }
    });
    document.addEventListener('click', (e) => { if (!searchInput.contains(e.target)) resultsDiv.classList.add('hidden'); });
    btnCash.addEventListener('click', () => { if (saleCart.length === 0) return showToast("Vide", "error"); showConfirmModal("Encaisser ?", `Total: ${document.getElementById('cart-total-display').textContent}`, async () => await processSale('cash', null, null)); });
    btnCredit.addEventListener('click', async () => { if (saleCart.length === 0) return showToast("Vide", "error"); await loadClientsIntoSelect(); document.getElementById('credit-sale-modal').classList.remove('hidden'); });
    if(btnQuickAdd) btnQuickAdd.addEventListener('click', () => { document.getElementById('credit-sale-modal').classList.add('hidden'); document.getElementById('add-client-modal').classList.remove('hidden'); isQuickAddMode = true; });
    document.getElementById('confirm-credit-sale-btn').addEventListener('click', async () => { const sel = document.getElementById('credit-client-select'); if (!sel.value) return showToast("Client?", "error"); document.getElementById('credit-sale-modal').classList.add('hidden'); await processSale('credit', sel.value, sel.options[sel.selectedIndex]?.text); });
}

async function processSale(type, clientId, clientName) {
    try {
        const batch = writeBatch(db);
        const saleRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
        let total = 0, profit = 0;
        const itemsForInvoice = JSON.parse(JSON.stringify(saleCart)); 
        for (const item of saleCart) {
            const lineTotal = item.prixVente * item.qty;
            total += lineTotal;
            profit += (item.prixVente - (item.prixAchat || 0)) * item.qty;
            const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(-item.qty), quantiteVendue: increment(item.qty) });
        }
        if (type === 'credit' && clientId) batch.update(doc(db, "boutiques", currentBoutiqueId, "clients", clientId), { dette: increment(total) });
        batch.set(saleRef, { items: saleCart, total, profit, date: serverTimestamp(), vendeurId: userId, type, clientId: clientId || null, clientName: clientName || null, deleted: false, isReturned: false });
        await batch.commit();
        showInvoiceModal(itemsForInvoice, total, type, clientName);
        saleCart = []; renderCart();
    } catch (err) { console.error(err); showToast("Erreur vente", "error"); }
}

function showInvoiceModal(items, total, type, clientName) {
    const modal = document.getElementById('invoice-modal');
    document.getElementById('invoice-amount').textContent = formatPrice(total);
    const shopName = document.getElementById('dashboard-user-name').textContent.trim();
    const dateStr = new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    let receiptText = `🧾 *REÇU*\n🏪 ${shopName}\n📅 ${dateStr}\n`;
    if(clientName) receiptText += `👤 Client: ${clientName}\n`;
    receiptText += `----------------\n`;
    let html = "";
    items.forEach(i => { receiptText += `${i.qty}x ${i.nomDisplay}: ${formatPrice(i.prixVente*i.qty)}\n`; html += `<div class="flex justify-between"><span>${i.qty}x ${i.nomDisplay}</span><span>${formatPrice(i.prixVente*i.qty)}</span></div>`; });
    receiptText += `----------------\n💰 TOTAL: ${formatPrice(total)}\n`;
    document.getElementById('invoice-preview').innerHTML = html;
    document.getElementById('btn-whatsapp-share').href = `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
    modal.classList.remove('hidden');
}

window.addToCart = (p) => { if (p.stock <= 0) return showToast("Epuisé", "error"); const ex = saleCart.find(i => i.id === p.id); if(ex) { if(ex.qty>=p.stock) return showToast("Max atteint", "error"); ex.qty++; } else saleCart.push({...p, qty:1, addedAt: new Date()}); document.getElementById('sale-search').value = ''; document.getElementById('sale-search-results').classList.add('hidden'); renderCart(); };
window.renderCart = () => { const tb = document.getElementById('cart-table-body'); document.getElementById('cart-total-display').textContent = formatPrice(saleCart.reduce((a,b)=>a+(b.prixVente*b.qty),0)); tb.innerHTML = saleCart.length===0 ? '<tr><td colspan="5" class="p-8 text-center text-gray-400">Vide</td></tr>' : ''; saleCart.forEach((i,x) => { const ts = i.addedAt ? new Date(i.addedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''; tb.innerHTML += `<tr class="border-b last:border-0"><td class="p-3"><div>${i.nomDisplay}</div><small class="text-gray-400">${ts}</small></td><td class="p-3 text-center"><input type="number" value="${i.prixVente}" onchange="updateItemPrice(${x},this.value)" class="w-24 p-1 border rounded text-center"></td><td class="p-3 text-center flex justify-center gap-1"><button onclick="updateQty(${x},-1)" class="w-6 bg-gray-200 rounded">-</button><span class="w-6 font-bold text-sm">${i.qty}</span><button onclick="updateQty(${x},1)" class="w-6 bg-gray-200 rounded">+</button></td><td class="p-3 text-right font-bold">${formatPrice(i.prixVente*i.qty)}</td><td class="p-3 text-right"><button onclick="saleCart.splice(${x},1);renderCart()" class="text-red-500">X</button></td></tr>`; }); };
window.updateItemPrice = (i,v) => { let p = parseFloat(v); if(p<0||isNaN(p)) return renderCart(); saleCart[i].prixVente = p; renderCart(); };
window.updateQty = (i,d) => { const it = saleCart[i]; const st = allProducts.find(p => p.id===it.id)?.stock||0; if(d>0 && it.qty>=st) return showToast("Stock max", "error"); it.qty+=d; if(it.qty<=0) saleCart.splice(i,1); renderCart(); };
window.clearCart = () => { if(saleCart.length>0 && confirm("Vider ?")) { saleCart=[]; renderCart(); } };

// ================= CREDITS =================
function setupCredits() {
    const form = document.getElementById('form-client');
    const searchInput = document.getElementById('credits-search');
    const sortSelect = document.getElementById('credits-sort');
    let allClients = [];

    const renderTable = () => {
        const tbody = document.getElementById('credits-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        let filtered = allClients;
        if(searchInput && searchInput.value) { const term = searchInput.value.toLowerCase(); filtered = allClients.filter(c => c.nom.toLowerCase().includes(term)); }
        if(sortSelect) { const sort = sortSelect.value; filtered.sort((a, b) => { if(sort === 'name_asc') return a.nom.localeCompare(b.nom); if(sort === 'dette_desc') return b.dette - a.dette; if(sort === 'dette_asc') return a.dette - b.dette; return 0; }); }
        
        filtered.forEach(c => {
            const rowClass = c.deleted ? "deleted-row" : "border-b hover:bg-gray-50";
            const actions = (userRole === 'admin' && !c.deleted) ? `<button onclick="deleteClient('${c.id}')" class="text-red-400 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
            const safeName = c.nom.replace(/'/g, "\\'");
            const payBtn = (!c.deleted && c.dette > 0) ? `<button onclick="rembourserClient('${c.id}', ${c.dette}, '${safeName}')" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs mr-2 font-bold">Payer</button>` : '';
            tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 font-medium">${c.nom} ${c.deleted?'(Archivé)':''}</td><td class="p-4">${c.telephone||'-'}</td><td class="p-4 font-bold text-orange-600">${formatPrice(c.dette||0)}</td><td class="p-4 text-right flex gap-2 justify-end">${payBtn} ${actions}</td></tr>`;
        });
    };

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "clients"), (snap) => {
        allClients = [];
        let totalDette = 0;
        snap.forEach(d => {
            const c = { id: d.id, ...d.data() };
            if(!c.deleted) totalDette += (c.dette || 0);
            if(c.deleted && userRole === 'seller') return;
            allClients.push(c);
        });
        renderTable();
        if(document.getElementById('dash-total-credits')) document.getElementById('dash-total-credits').textContent = formatPrice(totalDette);
        if (window.lucide) window.lucide.createIcons();
    });

    if(searchInput) searchInput.addEventListener('input', renderTable);
    if(sortSelect) sortSelect.addEventListener('change', renderTable);

    if(form) { form.addEventListener('submit', async (e) => { e.preventDefault(); try { await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "clients")), { nom: document.getElementById('client-nom').value, telephone: document.getElementById('client-tel').value, dette: 0, createdAt: serverTimestamp(), deleted: false }); form.reset(); document.getElementById('add-client-modal').classList.add('hidden'); showToast("Client ajouté"); if (isQuickAddMode) { await loadClientsIntoSelect(); document.getElementById('credit-sale-modal').classList.remove('hidden'); isQuickAddMode = false; } } catch(e) { showToast("Erreur", "error"); } }); }
    
    window.rembourserClient = async (id, dette, nomClient) => { const m = prompt(`Dette: ${formatPrice(dette)}\nMontant versé :`); if(!m) return; const montant = parseFloat(m); if(isNaN(montant) || montant <= 0) return showToast("Montant invalide", "error"); try { const batch = writeBatch(db); const clientRef = doc(db, "boutiques", currentBoutiqueId, "clients", id); batch.update(clientRef, { dette: increment(-montant) }); const moveRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes")); batch.set(moveRef, { date: serverTimestamp(), total: montant, profit: 0, type: 'remboursement', clientName: nomClient, clientId: id, items: [], vendeurId: userId, deleted: false }); await batch.commit(); showToast("Remboursement encaissé !", "success"); } catch(e) { console.error(e); showToast("Erreur", "error"); } };
    window.deleteClient = (id) => { if(confirm("Archiver ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id), { deleted: true }); };
}

// ================= EXPENSES =================
function setupExpenses() {
    const form = document.getElementById('form-expense');
    const searchInput = document.getElementById('expenses-search');
    const sortSelect = document.getElementById('expenses-sort');
    let allExpenses = [];
    
    const renderTable = () => {
        const tbody = document.getElementById('expenses-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        let filtered = allExpenses;
        if(searchInput && searchInput.value) { 
            const term = searchInput.value.toLowerCase(); 
            filtered = allExpenses.filter(e => e.motif.toLowerCase().includes(term)); 
        }
        if(sortSelect) { 
            const sort = sortSelect.value; 
            filtered.sort((a, b) => { 
                const dateA = a.date?.seconds || 0; 
                const dateB = b.date?.seconds || 0; 
                if(sort === 'date_desc') return dateB - dateA; 
                if(sort === 'date_asc') return dateA - dateB; 
                if(sort === 'amount_desc') return b.montant - a.montant; 
                return 0; 
            }); 
        }
        filtered.forEach(ex => {
            const rowClass = ex.deleted ? "deleted-row" : "border-b hover:bg-gray-50 transition";
            const deleteBtn = (userRole === 'admin' && !ex.deleted) ? `<button onclick="deleteExp('${ex.id}')" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
            tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 text-sm text-gray-500">${new Date(ex.date?.seconds*1000).toLocaleDateString()}</td><td class="p-4 font-medium text-gray-800">${ex.motif}</td><td class="p-4 text-right font-bold text-red-600">-${formatPrice(ex.montant)}</td><td class="p-4 text-right">${deleteBtn}</td></tr>`;
        });
        if (window.lucide) window.lucide.createIcons();
    };
    
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => { 
        allExpenses = []; 
        snap.forEach(d => { 
            const ex = { id: d.id, ...d.data() }; 
            if (ex.deleted && userRole === 'seller') return; 
            allExpenses.push(ex); 
        }); 
        renderTable(); 
    });
    
    if(searchInput) searchInput.addEventListener('input', renderTable);
    if(sortSelect) sortSelect.addEventListener('change', renderTable);
    
    if(form) { 
        form.addEventListener('submit', async (e) => { 
            e.preventDefault(); 
            try { 
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "expenses")), { 
                    motif: document.getElementById('exp-motif').value, 
                    montant: parseFloat(document.getElementById('exp-montant').value), 
                    date: serverTimestamp(), user: userId, deleted: false 
                }); 
                form.reset(); showToast("Dépense ajoutée"); 
            } catch(e) { showToast("Erreur", "error"); } 
        }); 
    }
    window.deleteExp = (id) => { if(confirm("Annuler dépense ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "expenses", id), { deleted: true }); };
}

// ================= RAPPORTS & RETOURS =================
function setupReports() {
    if (!currentBoutiqueId) return;
    const btnFilter = document.getElementById('btn-filter-reports');
    if(!btnFilter) return;
    const dateStart = document.getElementById('report-date-start');
    const dateEnd = document.getElementById('report-date-end');
    const caisseInput = document.getElementById('caisse-initiale-input');
    const btnSaveCaisse = document.getElementById('btn-save-caisse');
    const searchInput = document.getElementById('reports-search');
    const sortSelect = document.getElementById('reports-sort');
    const adminStatsDiv = document.getElementById('report-financial-stats');

    if (userRole === 'seller') { if(adminStatsDiv) adminStatsDiv.classList.add('hidden'); } 
    else { if(adminStatsDiv) adminStatsDiv.classList.remove('hidden'); }

    const now = new Date();
    dateStart.valueAsDate = new Date(now.getFullYear(), now.getMonth(), 1);
    dateEnd.valueAsDate = now;

    const shopRef = doc(db, "boutiques", currentBoutiqueId);
    if (userRole !== 'seller') {
        getDoc(shopRef).then(snap => { if(snap.exists()) { caisseInput.value = snap.data().caisseInitiale || 0; loadData(); } });
        btnSaveCaisse.addEventListener('click', async () => { await updateDoc(shopRef, { caisseInitiale: parseFloat(caisseInput.value)||0 }); showToast("Sauvegardé"); loadData(); });
    } else { setTimeout(() => loadData(), 100); }

    const renderReportsTable = () => {
        const tbody = document.getElementById('reports-table-body');
        tbody.innerHTML = '';
        let filtered = loadedTransactions;
        if(searchInput && searchInput.value) { const term = searchInput.value.toLowerCase(); filtered = loadedTransactions.filter(t => t.desc.toLowerCase().includes(term) || t.type.toLowerCase().includes(term)); }
        if(sortSelect) { const sort = sortSelect.value; filtered.sort((a, b) => { if(sort === 'date_desc') return b.date - a.date; if(sort === 'date_asc') return a.date - b.date; if(sort === 'amount_desc') return b.amount - a.amount; return 0; }); }

        let totalEncaisse = 0; let totalSorties = 0;
        loadedTransactions.forEach(t => { if(t.isExpense) totalSorties += t.amount; else if (t.isEffectiveEntry) totalEncaisse += t.amount; });

        filtered.forEach(t => {
            const row = document.createElement('tr');
            let classMontant = ''; let classType = 'text-gray-500';
            if (t.type === 'RETOUR' || t.type === 'RETOUR_CR') { classMontant = 'text-red-600 font-bold'; classType = 'text-red-500'; } 
            else if (t.isExpense) { classMontant = 'text-red-600 font-bold'; classType = 'text-red-400'; } 
            else if (t.isCreditSale) { classMontant = 'text-orange-400 italic'; classType = 'text-orange-400'; } 
            else { classMontant = 'text-green-600 font-bold'; classType = 'text-green-600'; } 

            let returnBtn = "";
            if (userRole === 'admin' && (t.type === 'VENTE' || t.type === 'CRÉDIT') && !t.isReturned) {
                returnBtn = `<button onclick="processReturn('${t.id}')" class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200 ml-2 border border-red-200" title="Retour">Retour</button>`;
            } else if (t.isReturned) {
                returnBtn = `<span class="text-xs text-gray-400 ml-2">(Annulé)</span>`;
                row.classList.add('opacity-50'); 
            }

            row.className = "border-b hover:bg-gray-50 transition";
            row.innerHTML = `<td class="p-3 text-xs">${t.date.toLocaleString()}</td><td class="p-3 text-sm text-gray-700">${t.desc} ${returnBtn}</td><td class="p-3 text-center text-xs font-bold ${classType}">${t.type}</td><td class="p-3 text-right ${!t.isExpense && !t.type.includes('RETOUR')?classMontant:'text-gray-300'}">${!t.isExpense && !t.type.includes('RETOUR')?formatPrice(t.amount):'-'}</td><td class="p-3 text-right ${t.isExpense || t.type.includes('RETOUR')?classMontant:'text-gray-300'}">${t.isExpense || t.type.includes('RETOUR')?formatPrice(t.amount):'-'}</td>`;
            tbody.appendChild(row);
        });

        if (userRole !== 'seller') {
            const caisseInitiale = parseFloat(caisseInput.value) || 0;
            const totalDispo = caisseInitiale + totalEncaisse;
            document.getElementById('report-total-dispo').textContent = formatPrice(totalDispo);
            document.getElementById('report-only-sales').textContent = formatPrice(totalEncaisse);
            document.getElementById('report-total-expenses').textContent = formatPrice(totalSorties);
            document.getElementById('report-balance').textContent = formatPrice(totalDispo - totalSorties);
        }
    };

    if(searchInput) searchInput.addEventListener('input', renderReportsTable);
    if(sortSelect) sortSelect.addEventListener('change', renderReportsTable);

    const loadData = async () => {
        const tbody = document.getElementById('reports-table-body');
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Chargement...</td></tr>';
        try {
            const salesSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "ventes"));
            const expSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "expenses"));
            loadedTransactions = [];
            salesSnap.forEach(doc => {
                const s = doc.data();
                if(s.deleted) return; 
                let desc = ""; let typeLabel = "VENTE"; let isEffectiveEntry = false; let isCreditSale = false; let isExpense = false;
                if (s.type === 'remboursement') { desc = `💰 <strong>Remboursement</strong> (${s.clientName || 'Client'})`; typeLabel = "REMB."; isEffectiveEntry = true; } 
                else if (s.type === 'retour') { desc = `↩️ <strong>Retour Marchandise</strong>`; typeLabel = "RETOUR"; isExpense = true; }
                else if (s.type === 'retour_credit') { desc = `↩️ <strong>Retour Crédit</strong>`; typeLabel = "RETOUR_CR"; isExpense = false; }
                else { 
                    let pList = s.items ? s.items.map(i => `${i.nomDisplay||i.nom} (${i.qty}x${formatPrice(i.prixVente)})`).join(', ') : 'Vente'; 
                    if (s.clientName) desc = `👤 <strong>${s.clientName}</strong> : ` + pList; else desc = pList; 
                    if (s.type === 'credit') { desc += ' <span class="text-xs bg-orange-100 text-orange-600 px-1 rounded">Non Payé</span>'; typeLabel = "CRÉDIT"; isCreditSale = true; } 
                    else { typeLabel = "VENTE"; isEffectiveEntry = true; } 
                }
                loadedTransactions.push({ 
                    id: doc.id, date: s.date?.toDate(), desc, type: typeLabel, 
                    amount: s.total||0, isExpense, isEffectiveEntry, isCreditSale, 
                    isReturned: s.isReturned, originalItems: s.items 
                });
            });
            expSnap.forEach(doc => { const e = doc.data(); if(e.deleted) return; loadedTransactions.push({ date: e.date?.toDate(), desc: e.motif, type: 'SORTIE', amount: e.montant||0, isExpense: true, isEffectiveEntry: false }); });
            const start = new Date(dateStart.value); start.setHours(0,0,0,0); const end = new Date(dateEnd.value); end.setHours(23,59,59,999);
            loadedTransactions = loadedTransactions.filter(t => t.date >= start && t.date <= end).sort((a,b)=>a.date-b.date);
            renderReportsTable();
        } catch (error) { console.error(error); }
    };
    btnFilter.addEventListener('click', loadData);
    const observer = new MutationObserver((mutations) => { mutations.forEach((mutation) => { if (!mutation.target.classList.contains('hidden')) { if (userRole === 'seller') loadData(); else setTimeout(() => { getDoc(shopRef).then(snap => { if(snap.exists()) caisseInput.value = snap.data().caisseInitiale || 0; loadData(); }); }, 100); } }); });
    observer.observe(document.getElementById('page-rapports'), { attributes: true, attributeFilter: ['class'] });

    window.processReturn = async (saleId) => {
        if(!confirm("Confirmer le retour ?")) return;
        const t = loadedTransactions.find(tr => tr.id === saleId);
        if(!t) return;
        try {
            const batch = writeBatch(db);
            if(t.originalItems) { 
                t.originalItems.forEach(i => { 
                    const pr = doc(db, "boutiques", currentBoutiqueId, "products", i.id); 
                    batch.update(pr, { stock: increment(i.qty), quantiteVendue: increment(-i.qty) }); 
                    const histRef = doc(collection(db, "boutiques", currentBoutiqueId, "mouvements_stock"));
                    batch.set(histRef, { productId: i.id, nom: i.nomDisplay, type: 'retour', quantite: i.qty, date: serverTimestamp(), user: userId });
                }); 
            }
            if(t.isCreditSale) { 
                const sDoc = await getDoc(doc(db, "boutiques", currentBoutiqueId, "ventes", saleId));
                if(sDoc.exists() && sDoc.data().clientId) {
                     batch.update(doc(db, "boutiques", currentBoutiqueId, "clients", sDoc.data().clientId), { dette: increment(-t.amount) });
                     const retRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
                     batch.set(retRef, { date: serverTimestamp(), total: t.amount, profit: 0, type: 'retour_credit', originalRef: saleId, items: t.originalItems || [], vendeurId: userId, deleted: false });
                }
            } else {
                const retRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
                batch.set(retRef, { date: serverTimestamp(), total: t.amount, profit: 0, type: 'retour', originalRef: saleId, items: t.originalItems || [], vendeurId: userId, deleted: false });
            }
            batch.update(doc(db, "boutiques", currentBoutiqueId, "ventes", saleId), { isReturned: true });
            await batch.commit(); showToast("Retour effectué !"); loadData();
        } catch(e) { showToast("Erreur retour", "error"); }
    };
}

// ================= AUDIT =================
function setupAudit() {
    let auditChart = null;
    const tableBody = document.getElementById('audit-table-body');

    const loadAudit = async () => {
        if(!currentBoutiqueId) return;
        
        // 1. Récupérer Caisse Initiale
        const shopDoc = await getDoc(doc(db, "boutiques", currentBoutiqueId));
        let balance = shopDoc.exists() ? (shopDoc.data().caisseInitiale || 0) : 0;

        // 2. Récupérer TOUS les mouvements financiers
        const salesSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "ventes"));
        const expSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "expenses"));
        
        let movements = [];

        salesSnap.forEach(d => {
            const s = d.data();
            if(s.deleted) return;
            // Seuls les mouvements CASH affectent le solde réel
            if(s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement') {
                movements.push({ date: s.date?.toDate(), amount: s.total || 0, type: 'VENTE', details: s.clientName || 'Client' });
            } else if (s.type === 'retour') {
                movements.push({ date: s.date?.toDate(), amount: -(s.total || 0), type: 'RETOUR', details: 'Retour article' });
            }
        });

        expSnap.forEach(d => {
            const e = d.data();
            if(!e.deleted) movements.push({ date: e.date?.toDate(), amount: -(e.montant || 0), type: 'DÉPENSE', details: e.motif });
        });

        // 3. Trier par date
        movements.sort((a,b) => a.date - b.date);

        // 4. Calculer l'évolution cumulée
        const labels = [];
        const dataPoints = [];
        const tableRows = []; // Pour stocker les données du tableau
        
        // Point de départ
        labels.push("Départ");
        dataPoints.push(balance);

        movements.forEach(m => {
            balance += m.amount;
            labels.push(m.date.toLocaleDateString('fr-FR'));
            dataPoints.push(balance);
            
            // On prépare la ligne du tableau
            tableRows.push({
                date: m.date,
                type: m.type,
                amount: m.amount,
                balance: balance,
                details: m.details
            });
        });

        // 5. Afficher le Graphique
        const ctx = document.getElementById('audit-chart')?.getContext('2d');
        if(ctx) {
            if(auditChart) auditChart.destroy();
            auditChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Solde Trésorerie (CFA)', data: dataPoints, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.1, pointRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { y: { beginAtZero: true } } } });
        }

        // 6. Afficher le Tableau (Inversé : le plus récent en haut)
        if(tableBody) {
            tableBody.innerHTML = '';
            // On inverse pour voir les derniers mouvements en premier
            [...tableRows].reverse().forEach(row => {
                const tr = document.createElement('tr');
                const isPositive = row.amount >= 0;
                const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
                const sign = isPositive ? '+' : '';
                
                tr.className = "hover:bg-gray-50 transition border-b border-gray-100";
                tr.innerHTML = `
                    <td class="p-3 text-xs text-gray-500">${row.date.toLocaleString()}</td>
                    <td class="p-3 text-xs font-bold text-gray-700">${row.type} <span class="font-normal text-gray-400">- ${row.details}</span></td>
                    <td class="p-3 text-right font-mono font-bold ${colorClass}">${sign}${formatPrice(row.amount)}</td>
                    <td class="p-3 text-right font-mono font-bold text-blue-800 bg-blue-50">${formatPrice(row.balance)}</td>
                `;
                tableBody.appendChild(tr);
            });
        }
    };

    const observer = new MutationObserver((mutations) => { mutations.forEach((mutation) => { if (!mutation.target.classList.contains('hidden')) loadAudit(); }); });
    const page = document.getElementById('page-audit');
    if(page) observer.observe(page, { attributes: true, attributeFilter: ['class'] });
}

// ================= ADMIN & EXPORTS =================
function setupAdminFeatures() {
    const form = document.getElementById('create-boutique-form');
    document.getElementById('open-admin-modal')?.addEventListener('click', () => document.getElementById('admin-modal').classList.remove('hidden'));
    document.getElementById('admin-modal-close-btn')?.addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));

    // Gestion visibilité mots de passe (Onglet Secours)
    const setupPassToggle = (toggleId, inputId) => {
        const toggle = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        if(toggle && input) {
            toggle.addEventListener('click', () => {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                toggle.innerHTML = type === 'password' ? '<i data-lucide="eye" class="w-4 h-4"></i>' : '<i data-lucide="eye-off" class="w-4 h-4"></i>';
                if(window.lucide) window.lucide.createIcons();
            });
        }
    };
    setupPassToggle('toggle-admin-access-pass', 'new-admin-access-pass');
    setupPassToggle('toggle-seller-access-pass', 'new-seller-access-pass');
    setupPassToggle('toggle-create-admin-pass', 'admin-password');
    setupPassToggle('toggle-create-seller-pass', 'seller-password');

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('new-boutique-name').value;
            const aEm = document.getElementById('admin-email').value;
            const aPs = document.getElementById('admin-password').value;
            const sEm = document.getElementById('seller-email').value;
            const sPs = document.getElementById('seller-password').value;
            const logoFile = document.getElementById('new-boutique-logo').files[0];
            
            if(aPs.length < 6 || sPs.length < 6) return showToast("Pass trop court", "error");
            showToast("Création...", "warning");

            try {
                let logoStr = null;
                if(logoFile) {
                    if(logoFile.size > 100000) return showToast("Logo > 100ko", "error");
                    logoStr = await convertBase64(logoFile);
                }

                const secApp = initializeApp(firebaseConfig, "Sec");
                const secAuth = getAuth(secApp);
                const ref = doc(collection(db, "boutiques"));
                await setDoc(ref, { nom: nom, logo: logoStr, createdAt: serverTimestamp(), createdBy: userId });

                const adm = await createUserWithEmailAndPassword(secAuth, aEm, aPs);
                await setDoc(doc(db, "users", adm.user.uid), { email: aEm, role: 'admin', boutiqueId: ref.id, boutiqueName: nom });
                await signOut(secAuth);

                const sell = await createUserWithEmailAndPassword(secAuth, sEm, sPs);
                await setDoc(doc(db, "users", sell.user.uid), { email: sEm, role: 'seller', boutiqueId: ref.id, boutiqueName: nom });
                await signOut(secAuth);

                showToast("Créé !");
                form.reset();
                document.getElementById('admin-modal').classList.add('hidden');
                loadBoutiquesList();
                loadShopsForImport();
                setupAdminAccessPage();
            } catch(err) { showToast(err.message, "error"); }
        });
    }

    window.processLogoUpdate = async () => { 
        const id = document.getElementById('import-target-shop').value; 
        if(!id) return showToast("Choisir boutique", "error"); 
        const f = document.getElementById('file-logo-update').files[0]; 
        if(!f) return showToast("Image?", "error"); 
        if(f.size>100000) return showToast("Trop lourd", "error"); 
        try { 
            const s = await convertBase64(f); 
            await updateDoc(doc(db, "boutiques", id), { logo: s }); 
            showToast("Logo MAJ"); 
            if(currentBoutiqueId === id) { const img = document.getElementById('dash-shop-logo'); if(img) { img.src=s; img.classList.remove('hidden'); } } 
        } catch(e) { showToast("Erreur", "error"); } 
    };

    // Remplacez toute la fonction window.updateAccess par ceci :

    window.updateAccess = async (role) => {
        if (!currentAccessShopId) return;

        const em = document.getElementById(role === 'admin' ? 'new-admin-access-email' : 'new-seller-access-email').value;
        const ps = document.getElementById(role === 'admin' ? 'new-admin-access-pass' : 'new-seller-access-pass').value;

        if (!em || ps.length < 6) return showToast("Email invalide ou mot de passe trop court (6 min)", "error");

        // On utilise un nom unique pour éviter les conflits si on clique 2 fois
        const appName = "SecAccess_" + new Date().getTime();
        let secApp;

        try {
            showToast("Création en cours...", "warning");

            // 1. Initialiser une app secondaire pour créer l'utilisateur sans vous déconnecter
            secApp = initializeApp(firebaseConfig, appName);
            const secAuth = getAuth(secApp);

            // 2. Créer l'utilisateur dans Authentication
            const userCredential = await createUserWithEmailAndPassword(secAuth, em, ps);
            const newUid = userCredential.user.uid;

            // 3. Nettoyer l'ANCIENNE fiche dans Firestore
            // On cherche l'ancien utilisateur de cette boutique avec ce rôle
            const q = query(collection(db, "users"), where("boutiqueId", "==", currentAccessShopId), where("role", "==", role));
            const snap = await getDocs(q);
            
            const batch = writeBatch(db);
            
            // On supprime les anciennes fiches (car l'UID ne sert plus)
            snap.forEach(d => {
                batch.delete(d.ref);
            });

            // 4. Créer la NOUVELLE fiche dans Firestore avec le nouvel UID
            const shopDoc = await getDoc(doc(db, "boutiques", currentAccessShopId));
            const shopName = shopDoc.exists() ? shopDoc.data().nom : "Boutique";

            const newUserRef = doc(db, "users", newUid);
            batch.set(newUserRef, {
                email: em,
                role: role,
                boutiqueId: currentAccessShopId,
                boutiqueName: shopName,
                createdAt: serverTimestamp()
            });

            await batch.commit();

            // 5. Déconnexion de l'app secondaire
            await signOut(secAuth);
            
            showToast("Compte recréé et accès mis à jour !", "success");
            
            // Rafraîchir l'affichage
            openAccessManager(currentAccessShopId, shopName);

        } catch (e) {
            console.error("Erreur creation:", e);
            if (e.code === 'auth/email-already-in-use') {
                if(confirm("Cet email est déjà utilisé.\n\nImpossible de recréer le compte (Sécurité Firebase).\n\nVoulez-vous envoyer un email de réinitialisation de mot de passe à cette adresse ?")) {
                    try {
                        await sendPasswordResetEmail(auth, em);
                        showToast("Email de réinitialisation envoyé !", "success");
                    } catch(err) {
                        showToast("Erreur envoi email: " + err.message, "error");
                    }
                }
            } else {
                showToast("Erreur: " + e.message, "error");
            }
        } finally {
            // Nettoyage crucial pour éviter les erreurs de mémoire
            if (secApp) {
                await deleteApp(secApp); 
            }
        }
    };
}

async function setupAdminAccessPage() {
    const searchInput = document.getElementById('admin-users-search');
    const listContainer = document.getElementById('admin-users-list');
    if(!searchInput || !listContainer) return;

    // On récupère TOUS les utilisateurs
    const usersSnap = await getDocs(collection(db, "users"));
    let allUsers = [];
    usersSnap.forEach(d => allUsers.push({id: d.id, ...d.data()}));

    const render = (filter = '') => {
        listContainer.innerHTML = ''; 
        const term = filter.toLowerCase();
        
        const filtered = allUsers.filter(u => 
            (u.email && u.email.toLowerCase().includes(term)) || 
            (u.boutiqueName && u.boutiqueName.toLowerCase().includes(term)) ||
            (u.role && u.role.toLowerCase().includes(term))
        );

        if(filtered.length === 0) { listContainer.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Aucun utilisateur trouvé.</td></tr>'; return; }

        filtered.forEach(u => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-purple-50 transition";
            
            const roleBadge = u.role === 'admin' 
                ? '<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">Propriétaire</span>' 
                : '<span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Vendeur</span>';

            tr.innerHTML = `
                <td class="p-3 font-medium text-gray-800">${u.boutiqueName || 'Inconnu'}</td>
                <td class="p-3 font-mono text-gray-600 select-all">${u.email}</td>
                <td class="p-3">${roleBadge}</td>
                <td class="p-3 text-right">
                    <button onclick="sendResetMail('${u.email}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold border border-gray-300 mr-2" title="Envoyer un email pour changer le mot de passe">📧 Reset Pass</button>
                    <button onclick="openAccessManager('${u.boutiqueId}', '${(u.boutiqueName||'').replace(/'/g, "\\'")}')" class="bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1 rounded text-xs font-bold border border-purple-200">🛠️ Modifier</button>
                </td>
            `;
            listContainer.appendChild(tr);
        });
    };
    render(); 
    searchInput.addEventListener('input', (e) => render(e.target.value));
}

window.sendResetMail = async (email) => {
    if(!confirm(`Envoyer un email de réinitialisation de mot de passe à : ${email} ?\n\nL'utilisateur recevra un lien pour choisir un nouveau mot de passe.`)) return;
    try {
        await sendPasswordResetEmail(auth, email);
        showToast("Email envoyé avec succès !", "success");
    } catch(e) {
        showToast("Erreur: " + e.message, "error");
    }
};

window.openAccessManager = async (shopId, shopName) => {
    currentAccessShopId = shopId;
    document.getElementById('access-shop-name').textContent = shopName;
    document.getElementById('access-modal').classList.remove('hidden');
    document.getElementById('current-admin-email').textContent = "Chargement...";
    document.getElementById('current-seller-email').textContent = "Chargement...";
    
    const q = query(collection(db, "users"), where("boutiqueId", "==", shopId));
    const snap = await getDocs(q);
    let a = false, s = false;
    snap.forEach(d => { 
        const u = d.data(); 
        if (u.role === 'admin') { document.getElementById('current-admin-email').textContent = u.email; a = true; } 
        else if (u.role === 'seller') { document.getElementById('current-seller-email').textContent = u.email; s = true; } 
    });
    if(!a) document.getElementById('current-admin-email').textContent = "Aucun";
    if(!s) document.getElementById('current-seller-email').textContent = "Aucun";
};


window.processImport = async function(n) {
    // 1. Récupérer l'ID de la boutique sélectionnée
    const shopSelect = document.getElementById('import-target-shop');
    const id = shopSelect.value;
    
    // 2. VÉRIFICATION CRITIQUE
    if(!id || id === "") {
        return showToast("ERREUR : Aucune boutique sélectionnée ! Cliquez sur 🔄 et choisissez une boutique.", "error");
    }
    
    // 3. Vérifier le fichier
    const fileInput = document.getElementById(n==='products'?'csv-stock':n==='clients'?'csv-clients':n==='expenses'?'csv-expenses':'csv-sales');
    const f = fileInput.files[0];
    
    if(!f) return showToast("Veuillez sélectionner un fichier CSV.", "error");
    
    console.log(`Démarrage import vers boutique ID: ${id}`); // Pour le débogage

    Papa.parse(f, { 
        header: true, 
        skipEmptyLines: true, 
        complete: async (r) => { 
            if(confirm(`Confirmer l'import de ${r.data.length} lignes dans la boutique sélectionnée ?`)) {
                await uploadBatchData(id, n, r.data); 
            }
        } 
    });
};

async function uploadBatchData(id, n, d) {
    if (!id || typeof id !== 'string' || id.length < 5) {
        showToast("Erreur interne : ID de boutique invalide.", "error");
        return;
    }

    console.log(`Début import intelligent ${n} pour la boutique ${id}...`);

    // --- 1. PRÉPARATION MASSIVE (Chargement en une seule fois) ---
    // On charge tout ce dont on a besoin AVANT la boucle pour ne jamais faire de "await" DANS la boucle.
    
    let productMap = {};
    let existingIds = new Set(); // Pour stocker les IDs qui existent déjà

    try {
        // A. Charger les produits (pour le stock)
        if (n === 'ventes') {
            showToast("Analyse du stock...");
            const productsSnapshot = await getDocs(collection(db, "boutiques", id, "products"));
            productsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.nom) productMap[data.nom.toLowerCase().trim()] = doc.id;
            });
        }

        // B. Charger les IDs existants (pour éviter les doublons sans faire 1000 requêtes)
        if (n !== 'expenses') { // On suppose que 'expenses' n'a pas besoin de check doublon strict
            showToast("Vérification des doublons...");
            // Optimisation : On ne récupère que les IDs (select()) pour économiser la bande passante
            // Note : Si la collection est énorme (+10k items), cette stratégie devra être adaptée.
            const existingSnapshot = await getDocs(collection(db, "boutiques", id, n));
            existingSnapshot.forEach(doc => {
                existingIds.add(doc.id);
            });
        }

    } catch (e) {
        console.error(e);
        return showToast("Erreur lecture pré-import. Import annulé.", "error");
    }

    let batch = writeBatch(db);
    let batchSize = 0;
    let countNew = 0;
    let countSkipped = 0;
    let countStock = 0;

    // --- 2. TRAITEMENT RAPIDE (Tout se passe en mémoire locale) ---
    for (const [i, r] of d.entries()) {
        if (!r.Nom && !r.Produit && !r.Motif) continue;

        let docId = null;
        let o = {};

        try {
            // --- GÉNÉRATION ID ---
            if (n === 'ventes') {
                const q_id = parseInt(r.Quantite) || 1;
                const p_id = parseFloat(r.PrixUnitaire) || 0;
                const total_calc = q_id * p_id;
                // CORRECTION ICI : Ajout de _L${i} pour rendre l'ID unique même si la vente est identique
                const rawId = `${r.Date}_${r.Produit}_${total_calc}_L${i}`;
                docId = "imp_" + rawId.replace(/[^a-zA-Z0-9]/g, '_');
            } else if (n === 'products') {
                docId = "imp_prod_" + r.Nom.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_');
            } else if (n === 'clients') {
                docId = "imp_client_" + r.Nom.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_');
            } else {
                docId = doc(collection(db, "boutiques", id, n)).id;
            }

            // --- VÉRIFICATION ANTI-DOUBLON INSTANTANÉE ---
            // On vérifie dans le Set (mémoire) au lieu de faire un appel réseau
            if (n !== 'expenses' && existingIds.has(docId)) {
                countSkipped++;
                continue; // Doublon détecté localement, on passe
            }

            // --- PRÉPARATION DES DONNÉES ---
            if (n === 'products') {
                let pv = parseFloat(r.PrixVente?.replace(',', '.')) || 0;
                let pa = parseFloat(r.PrixAchat?.replace(',', '.')) || 0;
                o = { nom: r.Nom.toLowerCase().trim(), nomDisplay: r.Nom.trim(), prixVente: pv, prixAchat: pa, stock: parseInt(r.Quantite) || 0, quantiteVendue: 0, createdAt: serverTimestamp(), deleted: false };
            } else if (n === 'clients') {
                o = { nom: r.Nom, telephone: r.Telephone || '', dette: parseFloat(r.Dette) || 0, createdAt: serverTimestamp(), deleted: false };
            } else if (n === 'expenses') {
                o = { date: r.Date ? new Date(r.Date) : serverTimestamp(), motif: r.Motif || 'Imp', montant: parseFloat(r.Montant) || 0, user: userId, deleted: false };
            } else if (n === 'ventes') {
                const q = parseInt(r.Quantite) || 1;
                const p = parseFloat(r.PrixUnitaire || r.Total) || 0;
                const ft = q * p;
                const prof = parseFloat(r.Profit) || 0;

                const searchName = (r.Produit || '').trim().toLowerCase();
                const prodId = productMap[searchName];

                // Mise à jour Stock
                if (prodId) {
                    const prodRef = doc(db, "boutiques", id, "products", prodId);
                    batch.update(prodRef, {
                        stock: increment(-q),
                        quantiteVendue: increment(q)
                    });
                    countStock++;
                    batchSize++; // Compte comme une opération dans le batch
                }

                const fi = { id: prodId || 'imp_unknown', nom: searchName, nomDisplay: r.Produit, qty: q, prixVente: p, prixAchat: 0 };
                o = { date: r.Date ? new Date(r.Date) : serverTimestamp(), total: ft, profit: prof, items: [fi], type: 'cash_import', vendeurId: userId, deleted: false };
            }

            // --- AJOUT AU BATCH ---
            const ref = doc(db, "boutiques", id, n, docId);
            batch.set(ref, o);

            countNew++;
            batchSize++;

            // --- ENVOI PAR PAQUETS DE 400 ---
            // On laisse une marge de sécurité (400 au lieu de 500)
            if (batchSize >= 400) {
                console.log("Envoi intermédiaire...");
                await batch.commit();
                batch = writeBatch(db);
                batchSize = 0;
            }

        } catch (e) {
            console.error("Erreur ligne CSV:", e, r);
        }
    }

    // Envoi du reste
    if (batchSize > 0) await batch.commit();

    let msg = `Terminé : ${countNew} ajoutés. ${countSkipped} doublons ignorés.`;
    if (n === 'ventes') msg += ` (${countStock} stocks mis à jour)`;
    showToast(msg, countNew > 0 ? "success" : "warning");
}

// Fonctions UI
window.switchTab = function(n) { 
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden')); 
    document.getElementById(`page-${n}`).classList.remove('hidden'); 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
    document.querySelector(`.tab[onclick="switchTab('${n}')"]`).classList.add('active'); 
};
function hideTab(n) { const t = document.querySelector(`.tab[onclick="switchTab('${n}')"]`); if(t) t.style.display = 'none'; }
function showTab(n) { const t = document.querySelector(`.tab[onclick="switchTab('${n}')"]`); if(t) t.style.display = 'flex'; }
function showAllTabs() { document.querySelectorAll('.tab').forEach(t => t.style.display = 'flex'); }
function showToast(m, t="success") { 
    const c = document.getElementById("toast-container"); 
    const e = document.createElement("div"); 
    e.className = `toast ${t==='success'?'bg-green-600':'bg-red-600'}`; 
    e.textContent = m; 
    c.appendChild(e); 
    setTimeout(()=>e.remove(), 3000); 
}
function formatPrice(p) { return (parseFloat(p)||0).toLocaleString('fr-FR') + ' CFA'; }
function showConfirmModal(t, x, a) { 
    document.getElementById('confirm-modal-title').textContent = t; 
    document.getElementById('confirm-modal-text').textContent = x; 
    actionToConfirm = a; 
    document.getElementById('confirm-modal').classList.remove('hidden'); 
}
function setupModalListeners() { 
    document.getElementById('modal-cancel-btn').addEventListener('click', ()=>document.getElementById('confirm-modal').classList.add('hidden')); 
    document.getElementById('modal-confirm-btn').addEventListener('click', ()=>{ if(actionToConfirm) actionToConfirm(); document.getElementById('confirm-modal').classList.add('hidden'); }); 
    document.getElementById('admin-modal-close-btn').addEventListener('click', ()=>document.getElementById('admin-modal').classList.add('hidden')); 
}
async function loadBoutiquesList() { 
    try {
        const l = await getAvailableBoutiques(); 
        const d = document.getElementById('admin-boutiques-list'); 
        if(d) d.innerHTML = l.map(b => `<div class="p-2 border-b flex justify-between"><span>${b.nom}</span><span class="text-xs text-gray-400">${b.id}</span></div>`).join(''); 
    } catch(e) { console.error(e); }
}

async function loadShopsForImport() { 
    const s = document.getElementById('import-target-shop'); 
    if(!s) return; 
    try {
        const l = await getAvailableBoutiques(); 
        s.innerHTML = '<option value="">-- Choisir --</option>'; 
        l.forEach(b => { 
            const o = document.createElement('option'); 
            o.value = b.id; o.textContent = b.nom; 
            s.appendChild(o); 
        }); 
    } catch(e) { console.error(e); }
}
// ================= GESTION DES COMMANDES =================

window.saveCartAsOrder = () => {
    // 1. Vérifications
    if (saleCart.length === 0) return showToast("Le panier est vide !", "error");
    
    // Ouverture de la modale au lieu du prompt
    document.getElementById('order-client-name').value = "";
    document.getElementById('order-client-tel').value = "";
    document.getElementById('order-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('order-client-name').focus(), 100);
};

window.finalizeOrder = async () => {
    const clientName = document.getElementById('order-client-name').value;
    const tel = document.getElementById('order-client-tel').value;
    
    if (!clientName) return showToast("Le nom du client est obligatoire", "error");
    
    document.getElementById('order-modal').classList.add('hidden');
    
    try {
        const batch = writeBatch(db);
        const cmdRef = doc(collection(db, "boutiques", currentBoutiqueId, "commandes"));
        
        let total = 0;
        
        // 2. Traitement des articles
        for (const item of saleCart) {
            total += item.prixVente * item.qty;
            
            // IMPORTANT : On déduit le STOCK (physique)
            // MAIS on n'augmente PAS "quantiteVendue" (statistique financière)
            const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(pRef, { 
                stock: increment(-item.qty) 
            });
        }

        // 3. Enregistrement de la commande
        batch.set(cmdRef, {
            client: clientName,
            telephone: tel || "",
            items: saleCart,
            total: total,
            status: "en_attente", // Statut important
            date: serverTimestamp(),
            vendeurId: userId
        });

        await batch.commit();
        
        // 4. Nettoyage
        saleCart = [];
        renderCart();
        showToast("Commande enregistrée ! Stock réservé.");
        switchTab('commandes'); // On redirige vers la liste

    } catch (e) {
        console.error(e);
        showToast("Erreur lors de la commande", "error");
    }
    // ============================================================
    // LOGIQUE DE VENTE CORRIGÉE (Stock & Caisse)
    // ============================================================

    // Fonction Générale pour traiter une vente (Cash ou Crédit)
    async function processDirectSale(type, clientInfo = null) {
    // --- 1. SÉCURITÉ : VÉRIFICATIONS ---
    if (saleCart.length === 0) return showToast("Panier vide !", "error");
    if (!currentBoutiqueId) return showToast("Erreur : Aucune boutique sélectionnée", "error");

    // --- 2. ANTI-DOUBLON (Verrouillage des boutons) ---
    // On cible le bouton de confirmation du crédit (ajustez l'ID si nécessaire)
    const btnCredit = document.getElementById('btn-confirm-credit'); 
    const btnCash = document.getElementById('btn-valider-vente'); // Si vous avez un bouton cash principal
    
    // On désactive pour empêcher le double clic
    if (btnCredit) { btnCredit.disabled = true; btnCredit.innerText = "En cours..."; }
    if (btnCash) { btnCash.disabled = true; }

    try {
        const batch = writeBatch(db);
        
        // Préparer la fiche de Vente
        const saleRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
        
        let totalSale = 0;
        let totalProfit = 0;

        // BOUCLE SUR CHAQUE PRODUIT
        for (const item of saleCart) {
            const itemTotal = item.prixVente * item.qty;
            const itemProfit = (item.prixVente - (item.prixAchat || 0)) * item.qty;
            
            totalSale += itemTotal;
            totalProfit += itemProfit;

            // DÉDUCTION DU STOCK
            const productRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(productRef, {
                stock: increment(-item.qty), 
                quantiteVendue: increment(item.qty)
            });
        }

        // ENREGISTREMENT DE LA VENTE
        const saleData = {
            date: serverTimestamp(),
            items: saleCart,
            total: totalSale,
            profit: totalProfit,
            type: type, // 'cash' ou 'credit'
            vendeurId: userId,
            deleted: false
        };

        if (type === 'credit' && clientInfo) {
            saleData.clientId = clientInfo.id;
            saleData.clientName = clientInfo.nom;
            
            // Augmentation de la dette client
            const clientRef = doc(db, "boutiques", currentBoutiqueId, "clients", clientInfo.id);
            batch.update(clientRef, {
                dette: increment(totalSale)
            });
        }

        batch.set(saleRef, saleData);

        // --- 3. EXÉCUTION (COMMIT) ---
        await batch.commit();
        
        // --- 4. SUCCÈS & UI ---
        
        // CORRECTION DU BUG "shopName is not defined"
        // On essaie de récupérer le nom depuis une variable globale 'currentShop' ou on met une valeur par défaut
        const shopName = (typeof currentShop !== 'undefined' && currentShop?.nom) ? currentShop.nom : "Ma Boutique";

        document.getElementById('invoice-amount').textContent = formatPrice(totalSale);
        
        // Générer le résumé pour WhatsApp
        let recap = saleCart.map(i => `- ${i.qty}x ${i.nomDisplay} (${formatPrice(i.prixVente)})`).join('\n');
        document.getElementById('invoice-preview').innerText = recap;
        
        // Lien WhatsApp (Maintenant shopName est défini, ça ne plantera plus)
        const waMsg = encodeURIComponent(`*Facture ${shopName}*\n\n${recap}\n\n*Total: ${formatPrice(totalSale)}*\nMerci de votre visite !`);
        const btnWa = document.getElementById('btn-whatsapp-share');
        if(btnWa) btnWa.href = `https://wa.me/?text=${waMsg}`;

        // Ouvrir la modale de succès
        const modalInvoice = document.getElementById('invoice-modal');
        if(modalInvoice) modalInvoice.classList.remove('hidden');
        
        // Vider le panier
        saleCart = [];
        if (typeof renderCart === "function") renderCart(); // Sécurité si la fonction n'existe pas
        
        // Fermer les autres modales
        const modalCredit = document.getElementById('credit-sale-modal');
        if(modalCredit) modalCredit.classList.add('hidden');

        showToast("Vente enregistrée avec succès !", "success");

    } catch (error) {
        console.error("Erreur vente:", error);
        showToast("Erreur lors de la vente : " + error.message, "error");
    } finally {
        // --- 5. FINALLY : ON RÉACTIVE LES BOUTONS QUOI QU'IL ARRIVE ---
        if (btnCredit) { btnCredit.disabled = false; btnCredit.innerText = "Confirmer Crédit"; }
        if (btnCash) { btnCash.disabled = false; }
    }
}

    // --- RACCORDEMENT DES BOUTONS ---

    // 1. Bouton ESPÈCES
    document.getElementById('btn-validate-cash')?.addEventListener('click', () => {
        if(confirm("Confirmer la vente en ESPÈCES ?")) {
            processDirectSale('cash');
        }
    });

    // 2. Bouton VALIDATION CRÉDIT (Dans la modale crédit)
    document.getElementById('confirm-credit-sale-btn')?.addEventListener('click', () => {
        const select = document.getElementById('credit-client-select');
        const clientId = select.value;
        const clientName = select.options[select.selectedIndex]?.text;

        if (!clientId) return showToast("Veuillez choisir un client.", "error");

        if(confirm(`Confirmer la vente à CRÉDIT pour ${clientName} ?`)) {
            processDirectSale('credit', { id: clientId, nom: clientName });
        }
    });   
}
// ===============================================
// MODULE SCANNER (Inspiré de livreurscan.html)
// ===============================================

let codeReader = null;
let currentScannedCode = null;
let lastScanTimestamp = 0;

// --- NOUVEAU : Feedback visuel pendant le scan ---
function showScanFeedback(message, type = 'success') {
    const readerDiv = document.getElementById('reader');
    if (!readerDiv) return;

    // Supprimer les anciens feedbacks pour éviter l'accumulation
    const existingFeedback = readerDiv.querySelector('.scan-feedback');
    if (existingFeedback) existingFeedback.remove();

    const feedbackEl = document.createElement('div');
    feedbackEl.className = `scan-feedback`;
    feedbackEl.textContent = message;
    
    // Style du feedback
    const bgColor = type === 'success' ? 'rgba(22, 163, 74, 0.8)' : 'rgba(220, 38, 38, 0.8)';
    feedbackEl.style.backgroundColor = bgColor;
    
    readerDiv.appendChild(feedbackEl);

    // Faire disparaître et supprimer l'élément
    setTimeout(() => {
        feedbackEl.style.opacity = '0';
        setTimeout(() => feedbackEl.remove(), 500);
    }, 1500); // Le message reste visible 1.5s
}

// 1. Démarrer le scanner
window.startScanner = async function() {
    const modal = document.getElementById('scanner-modal');
    if(modal) modal.classList.remove('hidden');

    currentScannedCode = null;
    lastScanTimestamp = 0;
    
    if (typeof ZXing === 'undefined') {
        return showToast("Erreur: Librairie Scanner (ZXing) non chargée", "error");
    }

    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        const videoElement = document.getElementById('video-preview');
        
        // CORRECTION : On utilise decodeFromConstraints comme dans livreurscan
        // Cela force la caméra arrière (environment) et une bonne résolution pour les codes-barres
        codeReader.decodeFromConstraints(
            { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
            videoElement,
            (result, err) => {
                if (result) {
                    onScanSuccess(result.getText());
                }
                // On ignore les erreurs "NotFound" qui arrivent 30 fois par seconde quand il n'y a pas de code
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Erreur de scan non-gérée:', err);
                }
            }
        );

        console.log(`Scanner démarré. En attente d'un code...`);

    } catch (e) {
        console.error("Erreur init scanner:", e);
        if (e.name === 'NotAllowedError') {
            showToast("L'accès à la caméra a été refusé.", "error");
        } else {
            showToast("Impossible de démarrer la caméra.", "error");
        }
        stopScanner();
    }
};

// 2. Arrêter le scanner
window.stopScanner = function() {
    const modal = document.getElementById('scanner-modal');
    if(modal) modal.classList.add('hidden');
    
    if (codeReader) {
        codeReader.reset(); // Arrête la caméra et libère les ressources
        codeReader = null;
    }
};

// 3. Succès du scan (appelé en continu par le scanner)
async function onScanSuccess(decodedText) {
    // --- 1. EXTRACTION & NETTOYAGE (Inspiré de livreurscan.html) ---
    let rawCode = decodedText.trim();
    // Tentative d'extraction d'un code EAN-13 ou UPC-A (12-13 chiffres)
    const eanMatch = rawCode.match(/\b(\d{12,13})\b/);
    if (eanMatch) {
        decodedText = eanMatch[1];
    } else {
        // Pour les autres codes, on met en majuscules
        decodedText = rawCode.toUpperCase();
    }

    // --- 2. ANTI-DOUBLON (DEBOUNCE) ---
    const now = Date.now();
    if (decodedText === currentScannedCode && (now - lastScanTimestamp) < 2500) { // 2.5 secondes
        return; // Ignorer le même scan trop rapproché
    }
    lastScanTimestamp = now;
    currentScannedCode = decodedText;

    // --- 3. FEEDBACK UTILISATEUR ---
    if (navigator.vibrate) navigator.vibrate(100); // Vibration courte
    
    console.log(`Code traité : ${decodedText}`);

    // --- 4. LOGIQUE SPÉCIFIQUE À L'APPLICATION ---

    // CAS A : On est en train d'ajouter un nouveau produit
    if (isScanningForNewProduct) {
        window.stopScanner(); // On arrête le scan pour remplir la fiche
        
        const inputCode = document.getElementById('prod-code');
        if(inputCode) inputCode.value = decodedText;

        const existing = allProducts.find(p => p.codeBarre === decodedText && !p.deleted);
        if (existing) {
            showToast("Produit reconnu ! Combien en ajoutez-vous ?", "success");
            document.getElementById('prod-nom').value = existing.nomDisplay;
            document.getElementById('prod-achat').value = existing.prixAchat;
            document.getElementById('prod-prix').value = existing.prixVente;
            const qteInput = document.getElementById('prod-qte');
            if(qteInput) { qteInput.value = ""; qteInput.focus(); qteInput.select(); } 
        } else {
            showToast("Nouveau code ! Remplissez la fiche.", "success");
            document.getElementById('prod-nom').focus(); 
        }
        isScanningForNewProduct = false; 
        return;
    } 

    // CAS B : Scan normal (Vente ou recherche)
    const productFound = allProducts.find(p => p.codeBarre === decodedText && !p.deleted);
    
    if (productFound) {
        // Jouer le son uniquement si le produit est trouvé
        new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(e=>{});
        
        // Le scan est sur la page de vente
        const isVentePage = !document.getElementById('page-ventes').classList.contains('hidden');
        if (isVentePage) {
            addToCart(productFound);
            showScanFeedback(`✅ ${productFound.nomDisplay}`, 'success');
        } else {
            // Si on est sur une autre page (ex: stock), on arrête et on affiche un toast
            window.stopScanner();
            showToast(`Produit trouvé : ${productFound.nomDisplay}`, "success");
        }
    } else {
        // Produit inconnu, on arrête le scan pour proposer l'association
        window.stopScanner();
        openAssociationModal(decodedText);
    }
}
main();