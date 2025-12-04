// ===============================================
// SCRIPT: GESTION BOUTIQUE (SÉCURITÉ VENDEUR & ARCHIVAGE)
// ===============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    createUserWithEmailAndPassword,
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    setDoc, 
    doc, 
    collection, 
    onSnapshot, 
    updateDoc, 
    writeBatch, 
    serverTimestamp, 
    increment, 
    deleteDoc, 
    getDocs, 
    getDoc, 
    setLogLevel 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCluRVv-olQsTuZZBPjjJns1jHq0vkhjSw",
    authDomain: "maboutique-7891.firebaseapp.com",
    projectId: "maboutique-7891",
    storageBucket: "maboutique-7891.firebasestorage.app",
    messagingSenderId: "402820959115",
    appId: "1:402820959115:web:6fb6b2c78fc9c5fe203d8e"
};

let db, auth, userId;
let allProducts = [], saleCart = []; 
let currentBoutiqueId = null, userRole = null;
let actionToConfirm = null;
let isQuickAddMode = false;

// ================= INIT & AUTH =================

async function main() {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setLogLevel('error');

    setupLoginForm();
    setupAuthListener();
    setupAdminFeatures();
    setupModalListeners();
    await updateBoutiqueSelector();
}

async function getAvailableBoutiques() {
    const s = await getDocs(collection(db, "boutiques"));
    const b = [];
    s.forEach(d => b.push({id: d.id, ...d.data()}));
    return b;
}

async function updateBoutiqueSelector() {
    const select = document.getElementById('login-boutique');
    if(!select) return;
    const boutiques = await getAvailableBoutiques();
    select.innerHTML = '<option value="">Sélectionnez une boutique</option>';
    boutiques.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.nom;
        select.appendChild(opt);
    });
}

function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error-msg');
    const errorText = document.getElementById('login-error-text');
    const forgotLink = document.getElementById('forgot-password-link');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.classList.add('hidden');
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            console.error("Erreur Auth:", error.code);
            let message = "Erreur de connexion.";
            if(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') message = "Email ou mot de passe incorrect.";
            errorText.textContent = message;
            errorBox.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        }
    });

    document.getElementById('bottom-logout-btn').addEventListener('click', () => signOut(auth));

    if(forgotLink) {
        forgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            let email = document.getElementById('login-email').value;
            if (!email) email = prompt("Entrez votre email :");
            if (email) {
                try {
                    await sendPasswordResetEmail(auth, email);
                    showToast("Email de réinitialisation envoyé !", "success");
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
                if (superAdminDoc.exists()) {
                    showSuperAdminInterface();
                    return;
                }
                const userDoc = await getDoc(doc(db, "users", userId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    currentBoutiqueId = data.boutiqueId;
                    userRole = data.role; // 'admin' (Proprio) ou 'seller' (Vendeur)
                    
                    document.getElementById('dashboard-user-name').textContent = `${data.boutiqueName}`;
                    document.getElementById('admin-tab-btn').classList.add('hidden'); 

                    document.getElementById('auth-container').classList.add('hidden');
                    document.getElementById('app-container').classList.remove('hidden');
                    document.getElementById('top-nav-bar').classList.remove('hidden');
                    
                    showAllTabs(); 
                    
                    if (userRole === 'seller') {
                        // LE VENDEUR NE VOIT PAS : Dashboard, Admin
                        // IL VOIT : Ventes, Stock, Crédits, Charges, Rapports (Lecture seule pour suppressions)
                        hideTab('dashboard');
                        hideTab('admin');
                        switchTab('ventes');
                    } else {
                        // Le Propriétaire voit tout sauf Admin
                        hideTab('admin');
                        switchTab('dashboard');
                    }
                    initializeApplication();
                } else {
                    showToast("Compte inconnu", "error");
                    await signOut(auth);
                }
            } catch (err) { console.error(err); }
        } else {
            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
            document.getElementById('top-nav-bar').classList.add('hidden');
            currentBoutiqueId = null;
        }
    });
}

function showSuperAdminInterface() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('top-nav-bar').classList.remove('hidden');
    document.getElementById('dashboard-user-name').textContent = "SUPER ADMIN";
    document.getElementById('admin-tab-btn').classList.remove('hidden');
    ['dashboard','ventes','stock','caisse','credits','rapports','charges'].forEach(hideTab);
    showTab('admin');
    switchTab('admin');
    loadBoutiquesList();
    loadShopsForImport(); 
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
    if (window.lucide) window.lucide.createIcons();
}

// ================= LOGIQUE IMPORT CSV =================

// 1. Charger la liste pour le select
async function loadShopsForImport() {
    const select = document.getElementById('import-target-shop');
    if(!select) return;
    
    const boutiques = await getAvailableBoutiques();
    select.innerHTML = '<option value="">-- Choisir la boutique cible --</option>';
    boutiques.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.nom;
        select.appendChild(opt);
    });
}

// 2. Fonction globale attachée au bouton (window scope)
window.processImport = async function(collectionName) {
    const shopId = document.getElementById('import-target-shop').value;
    if (!shopId) return showToast("Veuillez sélectionner une boutique cible !", "error");

    let inputId = "";
    if (collectionName === 'products') inputId = 'csv-stock';
    else if (collectionName === 'clients') inputId = 'csv-clients';
    else if (collectionName === 'expenses') inputId = 'csv-expenses';
    else if (collectionName === 'ventes') inputId = 'csv-sales';

    const fileInput = document.getElementById(inputId);
    const file = fileInput.files[0];

    if (!file) return showToast("Veuillez choisir un fichier CSV.", "error");

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function(results) {
            if (results.errors.length > 0) {
                return showToast("Erreur de lecture CSV. Vérifiez le format.", "error");
            }
            const data = results.data;
            if (confirm(`Importer ${data.length} éléments dans "${collectionName}" ?`)) {
                await uploadBatchData(shopId, collectionName, data);
            }
        }
    });
};

async function uploadBatchData(shopId, collectionName, data) {
    const batchSize = 450; 
    let batches = [];
    let currentBatch = writeBatch(db);
    let count = 0;

    showToast("Import en cours...", "warning");

    for (const row of data) {
        const docRef = doc(collection(db, "boutiques", shopId, collectionName));
        let cleanData = {};

        try {
            if (collectionName === 'products') {
                // LOGIQUE SOUPLE POUR LES PRIX
                // Si la case est vide dans Excel, on met 0 au lieu de créer une erreur.
                
                let pVente = 0;
                if (row.PrixVente && row.PrixVente.trim() !== "") {
                    // On remplace la virgule par un point si l'utilisateur a utilisé le format français (ex: 500,50)
                    pVente = parseFloat(row.PrixVente.replace(',', '.')) || 0;
                }

                let pAchat = 0;
                if (row.PrixAchat && row.PrixAchat.trim() !== "") {
                    pAchat = parseFloat(row.PrixAchat.replace(',', '.')) || 0;
                }

                cleanData = {
                    nom: row.Nom ? row.Nom.toString().toLowerCase() : 'produit sans nom',
                    nomDisplay: row.Nom || 'Produit Sans Nom',
                    prixVente: pVente, // Sera 0 si vide
                    prixAchat: pAchat, // Sera 0 si vide (Facultatif)
                    stock: parseInt(row.Quantite) || 0,
                    createdAt: serverTimestamp()
                };
            } 
            else if (collectionName === 'clients') {
                cleanData = {
                    nom: row.Nom || 'Client Inconnu',
                    telephone: row.Telephone || '',
                    dette: parseFloat(row.Dette) || 0,
                    createdAt: serverTimestamp()
                };
            }
            else if (collectionName === 'expenses') {
                cleanData = {
                    date: row.Date ? new Date(row.Date) : serverTimestamp(),
                    motif: row.Motif || 'Charge importée',
                    montant: parseFloat(row.Montant) || 0,
                    user: userId 
                };
            }
            else if (collectionName === 'ventes') {
                // LOGIQUE DE CALCUL AUTOMATIQUE
                
                // 1. On récupère la quantité (1 par défaut)
                const qty = parseInt(row.Quantite) || 1;
                
                // 2. On récupère le Prix Unitaire
                // (Le code accepte "PrixUnitaire", "PU", ou "Total" si vous n'avez pas changé votre CSV)
                const unitPrice = parseFloat(row.PrixUnitaire || row.PU || row.Total) || 0;
                
                // 3. LE SYSTÈME CALCULE LE VRAI TOTAL ICI
                const finalTotal = qty * unitPrice;

                // 4. Gestion du Profit
                // Si la colonne Profit est remplie, on l'utilise.
                // Sinon, on estime le profit à 20% du total par défaut (facultatif)
                const profit = parseFloat(row.Profit) || 0;

                // Création de l'article pour l'affichage
                const fakeItem = {
                    id: 'imp_' + Math.random().toString(36).substr(2, 5),
                    nom: row.Produit ? row.Produit.toLowerCase() : 'art. import',
                    nomDisplay: row.Produit || 'Article Importé',
                    qty: qty,
                    prixVente: unitPrice, // On stocke le prix unitaire ici
                    prixAchat: 0
                };

                cleanData = {
                    date: row.Date ? new Date(row.Date) : serverTimestamp(),
                    total: finalTotal, // <--- C'est ici que le total multiplié est enregistré
                    profit: profit,
                    items: [fakeItem],
                    type: 'cash_import',
                    vendeurId: 'import'
                };
            }

            currentBatch.set(docRef, cleanData);
            count++;

            if (count % batchSize === 0) {
                batches.push(currentBatch.commit());
                currentBatch = writeBatch(db);
            }

        } catch (e) { console.warn("Ligne ignorée:", row); }
    }

    if (count % batchSize !== 0) batches.push(currentBatch.commit());

    try {
        await Promise.all(batches);
        showToast(`Import terminé ! ${count} éléments.`, "success");
        document.querySelectorAll('input[type="file"]').forEach(i => i.value = '');
    } catch (error) {
        console.error(error);
        showToast("Erreur écriture base.", "error");
    }
}

// ================= DASHBOARD & RAPPORTS (SÉCURISÉ) =================

function setupDashboard() {
    let totalVentes = 0;
    let totalDepenses = 0;
    let caisseInitiale = 0;

    const updateDashboardTotals = () => {
        const beneficeReel = (caisseInitiale + totalVentes) - totalDepenses;

        if(document.getElementById('dash-caisse-initiale')) document.getElementById('dash-caisse-initiale').textContent = formatPrice(caisseInitiale);
        if(document.getElementById('dash-total-sales')) document.getElementById('dash-total-sales').textContent = formatPrice(totalVentes);
        if(document.getElementById('dash-total-expenses')) document.getElementById('dash-total-expenses').textContent = formatPrice(totalDepenses);
        
        if(document.getElementById('dash-total-profit')) {
            const elProfit = document.getElementById('dash-total-profit');
            elProfit.textContent = formatPrice(beneficeReel);
            elProfit.className = `text-2xl font-bold ${beneficeReel < 0 ? 'text-red-600' : 'text-green-600'}`;
        }
    };

    onSnapshot(doc(db, "boutiques", currentBoutiqueId), (doc) => {
        caisseInitiale = doc.data()?.caisseInitiale || 0;
        updateDashboardTotals();
    });

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => {
        totalDepenses = 0;
        snap.forEach(d => {
            const data = d.data();
            if (!data.deleted) totalDepenses += (data.montant || 0); // Ignore archivés
        });
        updateDashboardTotals();
    });

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "ventes"), (snap) => {
        totalVentes = 0;
        const productStats = {}; 
        const recentDiv = document.getElementById('dash-recent-sales');
        if(recentDiv) recentDiv.innerHTML = '';
        
        const sales = [];
        snap.forEach(d => {
            const data = d.data();
            if(!data.deleted) sales.push(data); // Ignore archivés
        });
        sales.sort((a,b) => b.date?.seconds - a.date?.seconds);

        sales.forEach(s => {
            totalVentes += s.total || 0;

            if(s.items && Array.isArray(s.items)) {
                s.items.forEach(item => {
                    // TOP 10 CORRIGÉ : AGRÉGATION PAR NOM
                    const rawName = item.nomDisplay || item.nom || "Inconnu";
                    const keyName = rawName.trim().toUpperCase();

                    if (!productStats[keyName]) productStats[keyName] = { name: rawName, qty: 0, revenue: 0 };
                    
                    const qty = item.qty || 0;
                    const price = item.prixVente || 0;
                    
                    productStats[keyName].qty += qty;
                    if(s.type === 'cash_import') productStats[keyName].revenue += s.total;
                    else productStats[keyName].revenue += (price * qty);
                });
            }
        });

        updateDashboardTotals();

        if(recentDiv) {
            sales.slice(0, 5).forEach(s => {
                const div = document.createElement('div');
                const dateStr = new Date(s.date?.seconds * 1000).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});
                const timeStr = new Date(s.date?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                let productList = s.items ? s.items.map(i => `${i.nomDisplay || i.nom}`).join(', ') : "Divers";
                div.className = "flex justify-between items-center border-b pb-2 last:border-0";
                div.innerHTML = `
                    <div class="flex flex-col min-w-[60px]"><span class="text-xs font-bold text-gray-700">${dateStr}</span><span class="text-[10px] text-gray-400">${timeStr}</span></div>
                    <div class="flex-1 mx-3 overflow-hidden"><div class="text-sm font-medium text-gray-800 truncate" title="${productList}">${productList}</div></div>
                    <div class="font-bold text-blue-600 text-sm whitespace-nowrap">${formatPrice(s.total)}</div>
                `;
                recentDiv.appendChild(div);
            });
        }

        const statsArray = Object.values(productStats);
        const topRevenue = [...statsArray].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        const profitBody = document.getElementById('dash-top-profit-body');
        if (profitBody) {
            profitBody.innerHTML = topRevenue.map(p => `<tr class="border-b last:border-0"><td class="p-2 font-medium text-gray-700 truncate max-w-[150px]" title="${p.name}">${p.name}</td><td class="p-2 text-right font-bold text-green-600">${formatPrice(p.revenue)}</td></tr>`).join('');
        }
        const topQty = [...statsArray].sort((a, b) => b.qty - a.qty).slice(0, 10);
        const qtyBody = document.getElementById('dash-top-qty-body');
        if (qtyBody) {
            qtyBody.innerHTML = topQty.map(p => `<tr class="border-b last:border-0"><td class="p-2 font-medium text-gray-700 truncate max-w-[150px]" title="${p.name}">${p.name}</td><td class="p-2 text-right font-bold text-blue-600">${p.qty}</td></tr>`).join('');
        }
    });
}

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

    const now = new Date();
    dateStart.valueAsDate = new Date(now.getFullYear(), now.getMonth(), 1);
    dateEnd.valueAsDate = now;

    const shopRef = doc(db, "boutiques", currentBoutiqueId);
    getDoc(shopRef).then(snap => { if(snap.exists()) { caisseInput.value = snap.data().caisseInitiale || 0; loadData(); } });

    btnSaveCaisse.addEventListener('click', async () => {
        await updateDoc(shopRef, { caisseInitiale: parseFloat(caisseInput.value)||0 });
        showToast("Sauvegardé"); loadData();
    });

    let loadedTransactions = [];

    const renderReportsTable = () => {
        const tbody = document.getElementById('reports-table-body');
        tbody.innerHTML = '';
        let filtered = loadedTransactions;

        if(searchInput && searchInput.value) {
            const term = searchInput.value.toLowerCase();
            filtered = loadedTransactions.filter(t => t.desc.toLowerCase().includes(term) || t.type.toLowerCase().includes(term));
        }
        if(sortSelect) {
            const sort = sortSelect.value;
            filtered.sort((a, b) => {
                if(sort === 'date_desc') return b.date - a.date;
                if(sort === 'date_asc') return a.date - b.date;
                if(sort === 'amount_desc') return b.amount - a.amount;
                return 0;
            });
        }

        let globalVentes = 0, globalDepenses = 0;
        // On recalcule les totaux sur les transactions CHARGÉES (pas seulement filtrées)
        loadedTransactions.forEach(t => { if(t.isExpense) globalDepenses += t.amount; else if (!t.credit) globalVentes += t.amount; });

        filtered.forEach(t => {
            const row = document.createElement('tr');
            const classVente = t.isExpense ? 'text-gray-300' : 'text-green-600 font-bold';
            const classDepense = t.isExpense ? 'text-red-600 font-bold' : 'text-gray-300';
            row.className = "border-b hover:bg-gray-50 transition";
            row.innerHTML = `<td class="p-3 text-xs">${t.date.toLocaleString()}</td><td class="p-3 text-sm ${t.isExpense?'text-red-500':''}">${t.desc} ${t.credit?'(Crédit)':''}</td><td class="p-3 text-center text-xs">${t.type}</td><td class="p-3 text-right ${classVente}">${!t.isExpense?formatPrice(t.amount):'-'}</td><td class="p-3 text-right ${classDepense}">${t.isExpense?formatPrice(t.amount):'-'}</td>`;
            tbody.appendChild(row);
        });

        const caisseInitiale = parseFloat(caisseInput.value) || 0;
        document.getElementById('report-total-dispo').textContent = formatPrice(caisseInitiale + globalVentes);
        document.getElementById('report-only-sales').textContent = formatPrice(globalVentes);
        document.getElementById('report-total-expenses').textContent = formatPrice(globalDepenses);
        document.getElementById('report-balance').textContent = formatPrice((caisseInitiale + globalVentes) - globalDepenses);
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
                if(s.deleted) return; // IGNORE ARCHIVÉS
                const desc = s.items ? s.items.map(i => `${i.nomDisplay||i.nom} (${i.qty}x${formatPrice(i.prixVente)})`).join(', ') : 'Vente';
                loadedTransactions.push({ date: s.date?.toDate(), desc, type: 'VENTE', credit: s.type==='credit', amount: s.total||0, isExpense: false });
            });

            expSnap.forEach(doc => {
                const e = doc.data();
                if(e.deleted) return; // IGNORE ARCHIVÉS
                loadedTransactions.push({ date: e.date?.toDate(), desc: e.motif, type: 'SORTIE', amount: e.montant||0, isExpense: true });
            });

            const start = new Date(dateStart.value); start.setHours(0,0,0,0);
            const end = new Date(dateEnd.value); end.setHours(23,59,59,999);
            loadedTransactions = loadedTransactions.filter(t => t.date >= start && t.date <= end).sort((a,b)=>a.date-b.date);
            renderReportsTable();

        } catch (error) { console.error(error); }
    };
    btnFilter.addEventListener('click', loadData);
    const observer = new MutationObserver((mutations) => { mutations.forEach((mutation) => { if (!mutation.target.classList.contains('hidden')) { setTimeout(() => { getDoc(shopRef).then(snap => { if(snap.exists()) caisseInput.value = snap.data().caisseInitiale || 0; loadData(); }); }, 100); } }); });
    observer.observe(document.getElementById('page-rapports'), { attributes: true, attributeFilter: ['class'] });
}

// ================= VENTES =================
// Fonction séparée pour charger les clients (réutilisable)
async function loadClientsIntoSelect() {
    const select = document.getElementById('credit-client-select');
    select.innerHTML = '<option value="">Chargement...</option>';
    
    const clientsSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "clients"));
    
    if (clientsSnap.empty) { 
        select.innerHTML = '<option value="">Aucun client trouvé</option>';
        return; 
    }
    
    select.innerHTML = '<option value="">-- Choisir un client --</option>';
    clientsSnap.forEach(doc => {
        const c = doc.data();
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = c.nom;
        select.appendChild(opt);
    });
}

function setupSalesPage() {
    const searchInput = document.getElementById('sale-search');
    const resultsDiv = document.getElementById('sale-search-results');
    const btnCash = document.getElementById('btn-validate-cash');
    const btnCredit = document.getElementById('btn-open-credit-modal');
    const btnQuickAdd = document.getElementById('btn-quick-add-client'); // Nouveau bouton
    const dateDisplay = document.getElementById('current-date-display');

    if(dateDisplay) {
        const now = new Date();
        dateDisplay.textContent = now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
    }

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (term.length < 1) { resultsDiv.classList.add('hidden'); return; }
        const matches = allProducts.filter(p => p.nom.includes(term));
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

    btnCash.addEventListener('click', () => {
        if (saleCart.length === 0) return showToast("Panier vide", "error");
        showConfirmModal("Encaisser en Espèces ?", `Total: ${document.getElementById('cart-total-display').textContent}`, async () => {
            await processSale('cash', null, null);
        });
    });

    // Ouverture Modale Crédit
    btnCredit.addEventListener('click', async () => {
        if (saleCart.length === 0) return showToast("Panier vide", "error");
        await loadClientsIntoSelect();
        document.getElementById('credit-sale-modal').classList.remove('hidden');
    });

    // NOUVEAU : Clic sur "+" pour ajouter un client rapidement
    if(btnQuickAdd) {
        btnQuickAdd.addEventListener('click', () => {
            // On ferme la modale de vente crédit temporairement
            document.getElementById('credit-sale-modal').classList.add('hidden');
            // On ouvre la modale de création client
            document.getElementById('add-client-modal').classList.remove('hidden');
            // On active le mode "retour rapide"
            isQuickAddMode = true;
        });
    }

    document.getElementById('confirm-credit-sale-btn').addEventListener('click', async () => {
        const select = document.getElementById('credit-client-select');
        const clientId = select.value;
        const clientName = select.options[select.selectedIndex]?.text;
        if (!clientId) return showToast("Veuillez sélectionner un client", "error");
        document.getElementById('credit-sale-modal').classList.add('hidden');
        await processSale('credit', clientId, clientName);
    });
}

async function processSale(type, clientId, clientName) {
    try {
        const batch = writeBatch(db);
        const saleRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
        
        let total = 0, profit = 0;
        const itemsForInvoice = JSON.parse(JSON.stringify(saleCart)); 

        for (const item of saleCart) {
            const lineTotal = item.prixVente * item.qty;
            const lineProfit = (item.prixVente - (item.prixAchat || 0)) * item.qty;
            total += lineTotal;
            profit += lineProfit;
            const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(-item.qty) });
        }

        if (type === 'credit' && clientId) {
            const clientRef = doc(db, "boutiques", currentBoutiqueId, "clients", clientId);
            batch.update(clientRef, { dette: increment(total) });
        }

        batch.set(saleRef, { items: saleCart, total, profit, date: serverTimestamp(), vendeurId: userId, type, clientId: clientId || null, clientName: clientName || null });
        await batch.commit();
        
        showInvoiceModal(itemsForInvoice, total, type, clientName);
        saleCart = []; renderCart();

    } catch (err) { console.error(err); showToast("Erreur lors de la vente", "error"); }
}

function showInvoiceModal(items, total, type, clientName) {
    const modal = document.getElementById('invoice-modal');
    const amountEl = document.getElementById('invoice-amount');
    const previewEl = document.getElementById('invoice-preview');
    const whatsappBtn = document.getElementById('btn-whatsapp-share');
    
    amountEl.textContent = formatPrice(total);
    
    const shopName = document.getElementById('dashboard-user-name').textContent.trim();
    const dateStr = new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    
    let receiptText = `🧾 *REÇU DE PAIEMENT*\n🏪 ${shopName}\n📅 ${dateStr}\n`;
    if(clientName) receiptText += `👤 Client: ${clientName}\n`;
    receiptText += `------------------------\n`;
    
    let previewHtml = "";
    items.forEach(item => {
        const lineTotal = item.prixVente * item.qty;
        receiptText += `${item.qty}x ${item.nomDisplay} : ${formatPrice(lineTotal)}\n`;
        previewHtml += `<div class="flex justify-between"><span>${item.qty}x ${item.nomDisplay}</span><span>${formatPrice(lineTotal)}</span></div>`;
    });

    receiptText += `------------------------\n💰 *TOTAL: ${formatPrice(total)}*\n`;
    receiptText += type === 'credit' ? `📝 *VENTE À CRÉDIT*\n` : `✅ *PAYÉ EN ESPÈCES*\n`;
    receiptText += `\nMerci de votre visite ! 🙏`;

    previewEl.innerHTML = previewHtml;
    whatsappBtn.href = `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

window.addToCart = (p) => {
    if (p.stock <= 0) return showToast("Stock épuisé", "error");
    const exist = saleCart.find(i => i.id === p.id);
    if (exist) { 
        if(exist.qty >= p.stock) return showToast("Stock max atteint", "error");
        exist.qty++; 
    } else { 
        saleCart.push({ ...p, qty: 1, addedAt: new Date() }); 
    }
    document.getElementById('sale-search').value = '';
    document.getElementById('sale-search-results').classList.add('hidden');
    renderCart();
};

// ================= GESTION PANIER MODIFIÉE =================

// 1. Fonction d'affichage du panier (Avec Prix Modifiable)
window.renderCart = () => {
    const tbody = document.getElementById('cart-table-body');
    const totalEl = document.getElementById('cart-total-display');
    tbody.innerHTML = '';
    let total = 0;
    
    if (saleCart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400 italic">Panier vide - Ajoutez des produits</td></tr>';
        totalEl.textContent = "0 CFA";
        return;
    }

    saleCart.forEach((item, idx) => {
        // Calcul de la ligne
        const lineTotal = item.prixVente * item.qty;
        total += lineTotal;
        
        // Affichage de l'heure d'ajout (optionnel, mis en petit sous le nom)
        const timeStr = item.addedAt ? new Date(item.addedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

        tbody.innerHTML += `
            <tr class="border-b last:border-0 border-gray-50 hover:bg-gray-50">
                
                <td class="p-3">
                    <div class="font-medium text-gray-700">${item.nomDisplay}</div>
                    <div class="text-xs text-gray-400">${timeStr}</div>
                </td>

                <td class="p-3 text-center">
                    <input type="number" 
                           value="${item.prixVente}" 
                           onchange="updateItemPrice(${idx}, this.value)" 
                           class="w-24 p-1 text-center border border-blue-300 rounded font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                </td>

                <td class="p-3 text-center">
                    <div class="flex justify-center items-center gap-1">
                        <button onclick="updateQty(${idx}, -1)" class="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300 font-bold">-</button>
                        <span class="w-8 text-center font-bold text-sm">${item.qty}</span>
                        <button onclick="updateQty(${idx}, 1)" class="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300 font-bold">+</button>
                    </div>
                </td>

                <td class="p-3 text-right font-bold text-gray-800">
                    ${formatPrice(lineTotal)}
                </td>

                <td class="p-3 text-right">
                    <button onclick="saleCart.splice(${idx},1);renderCart()" class="text-red-400 hover:text-red-600 p-1">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    totalEl.textContent = formatPrice(total);
    if (window.lucide) window.lucide.createIcons();
};

// ================= AJOUT POUR LE BOUTON VIDER PANIER =================

window.clearCart = () => {
    // Si le panier est déjà vide, on ne fait rien
    if (saleCart.length === 0) {
        showToast("Le panier est déjà vide", "warning");
        return;
    }

    // Petite sécurité pour éviter les effacements accidentels
    if (confirm("Voulez-vous vraiment tout supprimer du panier ?")) {
        saleCart = []; // On vide la variable
        renderCart();  // On met à jour l'affichage
        showToast("Panier vidé avec succès", "success");
    }
};

// 2. Nouvelle fonction pour mettre à jour le prix
window.updateItemPrice = (index, newPrice) => {
    const price = parseFloat(newPrice);
    
    if (price < 0 || isNaN(price)) {
        showToast("Le prix ne peut pas être négatif", "error");
        renderCart(); // Remet l'ancien prix
        return;
    }

    // Mise à jour du prix dans le panier
    saleCart[index].prixVente = price;
    
    // On rafraîchit le tableau pour recalculer les totaux
    renderCart();
};

window.updateQty = (idx, delta) => {
    const item = saleCart[idx];
    const stockReel = allProducts.find(p => p.id === item.id)?.stock || 0;
    if (delta > 0 && item.qty >= stockReel) return showToast("Stock insuffisant", "error");
    item.qty += delta;
    if (item.qty <= 0) saleCart.splice(idx, 1);
    renderCart();
};

// ================= STOCK (AVEC RECHERCHE ET TRI) =================

function setupStockManagement() {
    const stockForm = document.getElementById('form-stock');
    const searchInput = document.getElementById('stock-search-input');
    const sortSelect = document.getElementById('stock-sort-select');

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
                return 0;
            });
        }

        filteredData.forEach(p => {
            const tr = document.createElement('tr');
            // Si archivé -> classe 'deleted-row' (gris et rayé)
            const rowClass = p.deleted ? "deleted-row" : "border-b border-gray-100 hover:bg-gray-50 transition";
            
            // Le bouton supprimer n'apparaît QUE si c'est un ADMIN et que le produit n'est pas déjà supprimé
            const deleteBtn = (userRole === 'admin' && !p.deleted) 
                ? `<button class="text-red-500 hover:bg-red-50 p-2 rounded" onclick="deleteProduct('${p.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` 
                : '';

            tr.className = rowClass;
            tr.innerHTML = `
                <td class="p-4 font-medium text-gray-800">${p.nomDisplay || p.nom} ${p.deleted ? '(Archivé)' : ''}</td>
                <td class="p-4 font-bold text-blue-600">${formatPrice(p.prixAchat || 0)}</td>
                <td class="p-4 text-gray-500 text-sm">${formatPrice(p.prixVente || 0)}</td>
                <td class="p-4"><span class="${p.stock < 5 && !p.deleted ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} px-2 py-1 rounded-full text-xs font-bold">${p.stock}</span></td>
                <td class="p-4 text-right">${deleteBtn}</td>`;
            tbody.appendChild(tr);
        });
        if (window.lucide) window.lucide.createIcons();
    };

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "products"), (snap) => {
        allProducts = [];
        snap.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            // RÈGLE D'OR : Le Vendeur ne voit PAS les éléments supprimés
            if (p.deleted && userRole === 'seller') return;
            allProducts.push(p);
        });
        renderStockTable();
    });

    if(searchInput) searchInput.addEventListener('input', renderStockTable);
    if(sortSelect) sortSelect.addEventListener('change', renderStockTable);

    if(stockForm) {
        stockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "products")), {
                    nom: document.getElementById('prod-nom').value.toLowerCase(),
                    nomDisplay: document.getElementById('prod-nom').value,
                    prixVente: parseFloat(document.getElementById('prod-prix').value)||0,
                    prixAchat: parseFloat(document.getElementById('prod-achat').value)||0,
                    stock: parseInt(document.getElementById('prod-qte').value),
                    createdAt: serverTimestamp(), deleted: false
                });
                stockForm.reset(); document.getElementById('add-product-form').classList.add('hidden'); showToast("Produit ajouté");
            } catch (err) { showToast("Erreur ajout", "error"); }
        });
    }
    
    // Soft Delete (Archivage)
    window.deleteProduct = (id) => { 
        if(confirm("Archiver ce produit ? Il ne sera plus visible pour les vendeurs.")) {
            updateDoc(doc(db, "boutiques", currentBoutiqueId, "products", id), { deleted: true });
        } 
    };
}

// ================= CREDITS (SÉCURISÉ) =================

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
        if(searchInput && searchInput.value) {
            const term = searchInput.value.toLowerCase();
            filtered = allClients.filter(c => c.nom.toLowerCase().includes(term));
        }
        if(sortSelect) {
            const sort = sortSelect.value;
            filtered.sort((a, b) => {
                if(sort === 'name_asc') return a.nom.localeCompare(b.nom);
                if(sort === 'dette_desc') return b.dette - a.dette;
                if(sort === 'dette_asc') return a.dette - b.dette;
                return 0;
            });
        }

        filtered.forEach(c => {
            const rowClass = c.deleted ? "deleted-row" : "border-b hover:bg-gray-50 transition";
            // Bouton supprimer seulement pour Admin
            const actions = (userRole === 'admin' && !c.deleted) 
                ? `<button onclick="deleteClient('${c.id}')" class="text-red-400 hover:text-red-600 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
            const payBtn = !c.deleted ? `<button onclick="rembourserClient('${c.id}', ${c.dette})" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs mr-2 font-bold">Payer</button>` : '';

            tbody.innerHTML += `
                <tr class="${rowClass}">
                    <td class="p-4 font-medium text-gray-800">${c.nom} ${c.deleted ? '(Archivé)' : ''}</td>
                    <td class="p-4 text-gray-500">${c.telephone||'-'}</td>
                    <td class="p-4 font-bold text-orange-600">${formatPrice(c.dette||0)}</td>
                    <td class="p-4 text-right flex gap-2 justify-end">${payBtn} ${actions}</td>
                </tr>`;
        });
        
        const totalDette = allClients.reduce((sum, c) => sum + (c.deleted ? 0 : (c.dette||0)), 0);
        if(document.getElementById('dash-total-credits')) document.getElementById('dash-total-credits').textContent = formatPrice(totalDette);
        if (window.lucide) window.lucide.createIcons();
    };

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "clients"), (snap) => {
        allClients = [];
        snap.forEach(d => {
            const c = { id: d.id, ...d.data() };
            if (c.deleted && userRole === 'seller') return; // Vendeur ne voit pas archivés
            allClients.push(c);
        });
        renderTable();
    });

    if(searchInput) searchInput.addEventListener('input', renderTable);
    if(sortSelect) sortSelect.addEventListener('change', renderTable);

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "clients")), { 
                    nom: document.getElementById('client-nom').value, telephone: document.getElementById('client-tel').value, dette: 0, createdAt: serverTimestamp(), deleted: false 
                });
                form.reset(); document.getElementById('add-client-modal').classList.add('hidden'); showToast("Client ajouté");
                if (isQuickAddMode) { await loadClientsIntoSelect(); document.getElementById('credit-sale-modal').classList.remove('hidden'); isQuickAddMode = false; }
            } catch(e) { showToast("Erreur", "error"); }
        });
    }
    window.rembourserClient = (id, dette) => { const m = prompt(`Montant (Max: ${dette})`); if(m && !isNaN(m)) updateDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id), { dette: increment(-parseFloat(m)) }); };
    window.deleteClient = (id) => { if(confirm("Archiver ce client ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id), { deleted: true }); };
}

// ================= EXPENSES (SÉCURISÉ) =================

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
            const deleteBtn = (userRole === 'admin' && !ex.deleted) 
                ? `<button onclick="deleteExp('${ex.id}')" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';

            tbody.innerHTML += `
                <tr class="${rowClass}">
                    <td class="p-4 text-sm text-gray-500">${new Date(ex.date?.seconds*1000).toLocaleDateString()}</td>
                    <td class="p-4 font-medium text-gray-800">${ex.motif}</td>
                    <td class="p-4 text-right font-bold text-red-600">-${formatPrice(ex.montant)}</td>
                    <td class="p-4 text-right">${deleteBtn}</td>
                </tr>`;
        });
        if (window.lucide) window.lucide.createIcons();
    };

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => {
        allExpenses = [];
        snap.forEach(d => {
            const ex = { id: d.id, ...d.data() };
            if (ex.deleted && userRole === 'seller') return; // Vendeur ne voit pas archivés
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
                    motif: document.getElementById('exp-motif').value, montant: parseFloat(document.getElementById('exp-montant').value), date: serverTimestamp(), user: userId, deleted: false
                });
                form.reset(); showToast("Dépense ajoutée");
            } catch(e) { showToast("Erreur", "error"); }
        });
    }
    window.deleteExp = (id) => { if(confirm("Archiver cette dépense ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "expenses", id), { deleted: true }); };
}

// ================= GESTION CREATION COMPTES (SUPER ADMIN) =================

function setupAdminFeatures() {
    const form = document.getElementById('create-boutique-form');
    // Gestion ouverture/fermeture modale
    document.getElementById('open-admin-modal')?.addEventListener('click', () => document.getElementById('admin-modal').classList.remove('hidden'));
    document.getElementById('admin-modal-close-btn')?.addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Récupération des valeurs
            const nomBoutique = document.getElementById('new-boutique-name').value;
            const adminEmail = document.getElementById('admin-email').value;
            const adminPass = document.getElementById('admin-password').value;
            const sellerEmail = document.getElementById('seller-email').value;
            const sellerPass = document.getElementById('seller-password').value;

            // Validation simple
            if(adminPass.length < 6 || sellerPass.length < 6) {
                return showToast("Les mots de passe doivent faire 6 caractères min.", "error");
            }

            showToast("Création en cours... Patientez...", "warning");

            try {
                // 1. CRÉER UNE INSTANCE SECONDAIRE DE FIREBASE
                // Cela permet de créer des users sans déconnecter le Super Admin
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);

                // 2. Créer la boutique dans Firestore
                const boutiqueRef = doc(collection(db, "boutiques"));
                const boutiqueId = boutiqueRef.id;
                
                await setDoc(boutiqueRef, { 
                    nom: nomBoutique, 
                    createdAt: serverTimestamp(), 
                    createdBy: userId 
                });

                // 3. Créer le compte PROPRIÉTAIRE (Auth + Firestore)
                try {
                    // Création Auth (sur l'instance secondaire)
                    const ownerCred = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, adminPass);
                    const ownerUid = ownerCred.user.uid;
                    
                    // Création fiche User (sur la base principale 'db')
                    await setDoc(doc(db, "users", ownerUid), {
                        email: adminEmail,
                        role: 'admin',
                        boutiqueId: boutiqueId,
                        boutiqueName: nomBoutique,
                        createdAt: serverTimestamp()
                    });
                    
                    // On déconnecte l'instance secondaire pour passer au suivant
                    await signOut(secondaryAuth);
                    
                } catch (err) {
                    throw new Error("Erreur création Propriétaire: " + err.message);
                }

                // 4. Créer le compte VENDEUR (Auth + Firestore)
                try {
                    const sellerCred = await createUserWithEmailAndPassword(secondaryAuth, sellerEmail, sellerPass);
                    const sellerUid = sellerCred.user.uid;
                    
                    await setDoc(doc(db, "users", sellerUid), {
                        email: sellerEmail,
                        role: 'seller',
                        boutiqueId: boutiqueId,
                        boutiqueName: nomBoutique,
                        createdAt: serverTimestamp()
                    });
                    
                    await signOut(secondaryAuth);

                } catch (err) {
                    throw new Error("Erreur création Vendeur: " + err.message);
                }

                // 5. Succès total
                showToast(`Boutique "${nomBoutique}" et comptes créés avec succès !`, "success");
                form.reset();
                document.getElementById('admin-modal').classList.add('hidden');
                loadBoutiquesList();
                loadShopsForImport();

            } catch (err) {
                console.error(err);
                let msg = err.message;
                if(msg.includes("email-already-in-use")) msg = "Cet email est déjà utilisé !";
                showToast(msg, "error");
            }
        });
    }
}

async function loadBoutiquesList() {
    const list = await getAvailableBoutiques();
    const div = document.getElementById('admin-boutiques-list');
    if (!div) return;
    div.innerHTML = list.map(b => `<div class="flex justify-between p-2 border-b"><span>${b.nom}</span></div>`).join('');
}

window.switchTab = function(tabName) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    const t = document.getElementById(`page-${tabName}`);
    if(t) t.classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if(btn) btn.classList.add('active');
}

function hideTab(n) { const t = document.querySelector(`.tab[onclick="switchTab('${n}')"]`); if(t) t.style.display = 'none'; }
function showTab(n) { const t = document.querySelector(`.tab[onclick="switchTab('${n}')"]`); if(t) t.style.display = 'flex'; }
function showAllTabs() { document.querySelectorAll('.tab').forEach(t => t.style.display = 'flex'); }
function showToast(msg, type="success") {
    const c = document.getElementById("toast-container");
    const t = document.createElement("div");
    t.className = `toast ${type==='success'?'bg-green-600':'bg-red-600'}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
function formatPrice(p) { return (parseFloat(p)||0).toLocaleString('fr-FR') + ' CFA'; }
function showConfirmModal(title, text, action) {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-text').textContent = text;
    actionToConfirm = action;
    document.getElementById('confirm-modal').classList.remove('hidden');
}
function setupModalListeners() {
    document.getElementById('modal-cancel-btn').addEventListener('click', () => document.getElementById('confirm-modal').classList.add('hidden'));
    document.getElementById('modal-confirm-btn').addEventListener('click', () => { if(actionToConfirm) actionToConfirm(); document.getElementById('confirm-modal').classList.add('hidden'); });
    document.getElementById('admin-modal-close-btn').addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));
}

main();