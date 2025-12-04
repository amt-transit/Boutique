// ===============================================
// SCRIPT: GESTION BOUTIQUE V4 (TRÉSORERIE STRICTE)
// ===============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, setDoc, doc, collection, onSnapshot, updateDoc, writeBatch, serverTimestamp, increment, deleteDoc, getDocs, getDoc, setLogLevel 
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
        try { await signInWithEmailAndPassword(auth, email, pass); } 
        catch (error) {
            console.error("Erreur Auth:", error.code);
            let message = "Erreur de connexion.";
            if(error.code.includes('invalid') || error.code.includes('user-not-found') || error.code.includes('wrong-password')) message = "Email ou mot de passe incorrect.";
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
                try { await sendPasswordResetEmail(auth, email); showToast("Email envoyé !", "success"); } 
                catch (err) { showToast(err.message, "error"); }
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
                    currentBoutiqueId = data.boutiqueId;
                    userRole = data.role;
                    document.getElementById('dashboard-user-name').textContent = `${data.boutiqueName}`;
                    document.getElementById('admin-tab-btn').classList.add('hidden'); 
                    document.getElementById('auth-container').classList.add('hidden');
                    document.getElementById('app-container').classList.remove('hidden');
                    document.getElementById('top-nav-bar').classList.remove('hidden');
                    showAllTabs(); 
                    if (userRole === 'seller') {
                        hideTab('dashboard'); hideTab('admin'); switchTab('ventes');
                    } else {
                        hideTab('admin'); switchTab('dashboard');
                    }
                    initializeApplication();
                } else { showToast("Compte inconnu", "error"); await signOut(auth); }
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

// ================= DASHBOARD (TRÉSORERIE & RENTABILITÉ) =================

function setupDashboard() {
    let totalVentesCash = 0;
    let totalDepenses = 0;
    let caisseInitiale = 0;

    const updateDashboardTotals = () => {
        // FORMULE TRÉSORERIE : (Caisse Init + Ventes Cash + Remboursements) - Dépenses
        const beneficeReel = (caisseInitiale + totalVentesCash) - totalDepenses;

        if(document.getElementById('dash-caisse-initiale')) document.getElementById('dash-caisse-initiale').textContent = formatPrice(caisseInitiale);
        if(document.getElementById('dash-total-sales')) document.getElementById('dash-total-sales').textContent = formatPrice(totalVentesCash);
        if(document.getElementById('dash-total-expenses')) document.getElementById('dash-total-expenses').textContent = formatPrice(totalDepenses);
        
        if(document.getElementById('dash-total-profit')) {
            const elProfit = document.getElementById('dash-total-profit');
            elProfit.textContent = formatPrice(beneficeReel);
            elProfit.className = `text-2xl font-bold ${beneficeReel < 0 ? 'text-red-600' : 'text-green-600'}`;
        }
    };

    // Ecouteurs
    onSnapshot(doc(db, "boutiques", currentBoutiqueId), (doc) => {
        caisseInitiale = doc.data()?.caisseInitiale || 0;
        updateDashboardTotals();
    });

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => {
        totalDepenses = 0;
        snap.forEach(d => { if (!d.data().deleted) totalDepenses += (d.data().montant || 0); });
        updateDashboardTotals();
    });

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "ventes"), (snap) => {
        totalVentesCash = 0;
        const productStats = {}; 
        const recentDiv = document.getElementById('dash-recent-sales');
        if(recentDiv) recentDiv.innerHTML = '';
        
        const sales = [];
        snap.forEach(d => { if(!d.data().deleted) sales.push(d.data()); });
        sales.sort((a,b) => b.date?.seconds - a.date?.seconds);

        sales.forEach(s => {
            // 1. CALCUL TRÉSORERIE
            // On ajoute UNIQUEMENT si c'est du Cash, un Import, ou un REMBOURSEMENT
            if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement') {
                totalVentesCash += s.total || 0;
            }
            // Si c'est un crédit (type 'credit'), on n'ajoute rien (0 CFA encaissé)

            // 2. STATS PRODUITS
            if(s.items && Array.isArray(s.items) && s.type !== 'remboursement') {
                s.items.forEach(item => {
                    const keyName = (item.nomDisplay || item.nom || "Inconnu").trim().toUpperCase();
                    if (!productStats[keyName]) productStats[keyName] = { name: keyName, qty: 0, revenue: 0 };
                    
                    productStats[keyName].qty += (item.qty || 0);
                    
                    // Pour le top 10, on compte la valeur vendue, même si c'est à crédit (car le produit est parti)
                    if(s.type === 'cash_import') productStats[keyName].revenue += s.total;
                    else productStats[keyName].revenue += ((item.prixVente || 0) * (item.qty || 0));
                });
            }
        });

        updateDashboardTotals();

        // Récents
        if(recentDiv) {
            sales.slice(0, 5).forEach(s => {
                const div = document.createElement('div');
                const dateObj = new Date(s.date?.seconds * 1000);
                const dateStr = dateObj.toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});
                
                let desc = "";
                let colorClass = "text-blue-600";

                if(s.type === 'remboursement') {
                    desc = `💰 Remboursement : ${s.clientName || 'Client'}`;
                    colorClass = "text-green-600";
                } else {
                    let pList = s.items ? s.items.map(i => i.nomDisplay).join(', ') : "Divers";
                    if(s.clientName) desc = `👤 ${s.clientName} : ${pList}`; else desc = pList;
                    if(s.type === 'credit') colorClass = "text-orange-600";
                }

                div.className = "flex justify-between items-center border-b pb-2 last:border-0";
                div.innerHTML = `
                    <div class="flex flex-col min-w-[50px]"><span class="text-xs font-bold text-gray-700">${dateStr}</span></div>
                    <div class="flex-1 mx-3 overflow-hidden"><div class="text-sm font-medium text-gray-800 truncate" title="${desc}">${desc}</div></div>
                    <div class="font-bold ${colorClass} text-sm whitespace-nowrap">${formatPrice(s.total)}</div>
                `;
                recentDiv.appendChild(div);
            });
        }

        // Top 10
        const statsArray = Object.values(productStats);
        const topRevenue = [...statsArray].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        const profitBody = document.getElementById('dash-top-profit-body');
        if (profitBody) {
            profitBody.innerHTML = topRevenue.map(p => `<tr class="border-b last:border-0"><td class="p-2 font-medium text-gray-700 truncate max-w-[150px]">${p.name}</td><td class="p-2 text-right font-bold text-green-600">${formatPrice(p.revenue)}</td></tr>`).join('');
        }
        const topQty = [...statsArray].sort((a, b) => b.qty - a.qty).slice(0, 10);
        const qtyBody = document.getElementById('dash-top-qty-body');
        if (qtyBody) {
            qtyBody.innerHTML = topQty.map(p => `<tr class="border-b last:border-0"><td class="p-2 font-medium text-gray-700 truncate max-w-[150px]">${p.name}</td><td class="p-2 text-right font-bold text-blue-600">${p.qty}</td></tr>`).join('');
        }
    });

    // Stock
    setInterval(() => {
        const lowDiv = document.getElementById('dash-low-stock');
        if(!lowDiv) return;
        const low = allProducts.filter(p => p.stock < 5);
        if (low.length > 0) lowDiv.innerHTML = low.map(p => `<div class="flex justify-between text-sm p-2 bg-orange-50 rounded text-orange-700 mb-1"><span>${p.nomDisplay}</span><span class="font-bold">${p.stock}</span></div>`).join('');
        else lowDiv.innerHTML = '<p class="text-gray-400 italic">Stock OK.</p>';
    }, 3000);
}

// ================= CREDITS (AVEC ENREGISTREMENT REMBOURSEMENT) =================

function setupCredits() {
    const form = document.getElementById('form-client');
    
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "clients"), (snap) => {
        const tbody = document.getElementById('credits-table-body');
        let totalDette = 0;
        if(tbody) tbody.innerHTML = '';
        
        snap.forEach(d => {
            const c = { id: d.id, ...d.data() };
            if (!c.deleted) totalDette += (c.dette || 0);
            if (c.deleted && userRole === 'seller') return;

            if(tbody) {
                const rowClass = c.deleted ? "deleted-row" : "border-b hover:bg-gray-50";
                const actions = (userRole === 'admin' && !c.deleted) ? `<button onclick="deleteClient('${c.id}')" class="text-red-400 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
                
                // On échappe les apostrophes dans le nom pour la fonction onclick
                const safeName = c.nom.replace(/'/g, "\\'");
                const payBtn = (!c.deleted && c.dette > 0) ? `<button onclick="rembourserClient('${c.id}', ${c.dette}, '${safeName}')" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs mr-2 font-bold">Payer</button>` : '';

                tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 font-medium">${c.nom} ${c.deleted?'(Archivé)':''}</td><td class="p-4">${c.telephone||'-'}</td><td class="p-4 font-bold text-orange-600">${formatPrice(c.dette||0)}</td><td class="p-4 text-right flex gap-2 justify-end">${payBtn} ${actions}</td></tr>`;
            }
        });
        if(document.getElementById('dash-total-credits')) document.getElementById('dash-total-credits').textContent = formatPrice(totalDette);
        if (window.lucide) window.lucide.createIcons();
    });

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "clients")), { nom: document.getElementById('client-nom').value, telephone: document.getElementById('client-tel').value, dette: 0, createdAt: serverTimestamp(), deleted: false });
                form.reset(); document.getElementById('add-client-modal').classList.add('hidden'); showToast("Client ajouté");
                if (isQuickAddMode) { await loadClientsIntoSelect(); document.getElementById('credit-sale-modal').classList.remove('hidden'); isQuickAddMode = false; }
            } catch(e) { showToast("Erreur", "error"); }
        });
    }

    // --- FONCTION CRITIQUE : Remboursement = Nouvelle Vente (Entrée d'argent) ---
    window.rembourserClient = async (id, dette, nomClient) => {
        const m = prompt(`Dette: ${formatPrice(dette)}\nMontant versé :`);
        if(!m) return;
        const montant = parseFloat(m);
        if(isNaN(montant) || montant <= 0) return showToast("Montant invalide", "error");
        
        try {
            const batch = writeBatch(db);
            
            // 1. Baisser la dette
            const clientRef = doc(db, "boutiques", currentBoutiqueId, "clients", id);
            batch.update(clientRef, { dette: increment(-montant) });
            
            // 2. Créer une "Vente" de type REMBOURSEMENT pour la caisse
            const moveRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
            batch.set(moveRef, {
                date: serverTimestamp(),
                total: montant,
                profit: 0,
                type: 'remboursement', // Marqueur spécial
                clientName: nomClient,
                clientId: id,
                items: [],
                vendeurId: userId,
                deleted: false
            });
            
            await batch.commit();
            showToast("Remboursement encaissé !", "success");
            
        } catch(e) { console.error(e); showToast("Erreur", "error"); }
    };
    
    window.deleteClient = (id) => { if(confirm("Archiver ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id), { deleted: true }); };
}

// ================= RAPPORTS (AFFICHER REMBOURSEMENTS) =================

function setupReports() {
    if (!currentBoutiqueId) return;
    const btnFilter = document.getElementById('btn-filter-reports');
    if(!btnFilter) return;
    
    const dateStart = document.getElementById('report-date-start');
    const dateEnd = document.getElementById('report-date-end');
    const caisseInput = document.getElementById('caisse-initiale-input');
    const btnSaveCaisse = document.getElementById('btn-save-caisse');
    
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
        
        // Calcul Totaux sur tout ce qui est chargé
        let totalEncaisse = 0; 
        let totalSorties = 0;

        loadedTransactions.forEach(t => {
            if(t.isExpense) totalSorties += t.amount;
            else if (t.isEffectiveEntry) totalEncaisse += t.amount; // Cash + Import + Remboursement
        });

        const searchInput = document.getElementById('reports-search');
        const sortSelect = document.getElementById('reports-sort');
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

        filtered.forEach(t => {
            const row = document.createElement('tr');
            let classMontant = '';
            let classType = 'text-gray-500';

            if (t.isExpense) { classMontant = 'text-red-600 font-bold'; classType = 'text-red-400'; } 
            else if (t.isCreditSale) { classMontant = 'text-orange-400 italic'; classType = 'text-orange-400'; } 
            else { classMontant = 'text-green-600 font-bold'; classType = 'text-green-600'; } // Cash ou Remb.

            row.className = "border-b hover:bg-gray-50 transition";
            row.innerHTML = `<td class="p-3 text-xs">${t.date.toLocaleString()}</td><td class="p-3 text-sm text-gray-700">${t.desc}</td><td class="p-3 text-center text-xs font-bold ${classType}">${t.type}</td><td class="p-3 text-right ${!t.isExpense?classMontant:'text-gray-300'}">${!t.isExpense?formatPrice(t.amount):'-'}</td><td class="p-3 text-right ${t.isExpense?classMontant:'text-gray-300'}">${t.isExpense?formatPrice(t.amount):'-'}</td>`;
            tbody.appendChild(row);
        });

        const caisseInitiale = parseFloat(caisseInput.value) || 0;
        const totalDispo = caisseInitiale + totalEncaisse;
        
        document.getElementById('report-total-dispo').textContent = formatPrice(totalDispo);
        document.getElementById('report-only-sales').textContent = formatPrice(totalEncaisse);
        document.getElementById('report-total-expenses').textContent = formatPrice(totalSorties);
        document.getElementById('report-balance').textContent = formatPrice(totalDispo - totalSorties);
    };

    // Listeners UI
    const searchInput = document.getElementById('reports-search');
    const sortSelect = document.getElementById('reports-sort');
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
                
                let desc = "";
                let typeLabel = "VENTE";
                let isEffectiveEntry = false; 
                let isCreditSale = false;

                if (s.type === 'remboursement') {
                    desc = `💰 <strong>Remboursement</strong> (${s.clientName || 'Client'})`;
                    typeLabel = "REMB.";
                    isEffectiveEntry = true; 
                } else {
                    let pList = s.items ? s.items.map(i => `${i.nomDisplay||i.nom} (${i.qty})`).join(', ') : 'Vente';
                    if (s.clientName) desc = `👤 <strong>${s.clientName}</strong> : ` + pList; else desc = pList;
                    
                    if (s.type === 'credit') {
                        desc += ' <span class="text-xs bg-orange-100 text-orange-600 px-1 rounded">Non Payé</span>';
                        typeLabel = "CRÉDIT";
                        isCreditSale = true;
                    } else {
                        typeLabel = "VENTE";
                        isEffectiveEntry = true;
                    }
                }

                loadedTransactions.push({ date: s.date?.toDate(), desc, type: typeLabel, amount: s.total||0, isExpense: false, isEffectiveEntry, isCreditSale });
            });

            expSnap.forEach(doc => {
                const e = doc.data();
                if(e.deleted) return;
                loadedTransactions.push({ date: e.date?.toDate(), desc: e.motif, type: 'SORTIE', amount: e.montant||0, isExpense: true, isEffectiveEntry: false });
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

// ================= VENTES (LOGIQUE) =================
// (Reste identique à la version précédente, je recolle pour être complet)

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
            batch.update(doc(db, "boutiques", currentBoutiqueId, "products", item.id), { stock: increment(-item.qty) });
        }
        if (type === 'credit' && clientId) batch.update(doc(db, "boutiques", currentBoutiqueId, "clients", clientId), { dette: increment(total) });
        batch.set(saleRef, { items: saleCart, total, profit, date: serverTimestamp(), vendeurId: userId, type, clientId: clientId || null, clientName: clientName || null, deleted: false });
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
window.renderCart = () => { const tb = document.getElementById('cart-table-body'); document.getElementById('cart-total-display').textContent = formatPrice(saleCart.reduce((a,b)=>a+(b.prixVente*b.qty),0)); tb.innerHTML = saleCart.length===0 ? '<tr><td colspan="5" class="p-8 text-center text-gray-400">Vide</td></tr>' : ''; saleCart.forEach((i,x) => { tb.innerHTML += `<tr class="border-b last:border-0"><td class="p-3">${i.nomDisplay}</td><td class="p-3 text-center"><input type="number" value="${i.prixVente}" onchange="updateItemPrice(${x},this.value)" class="w-24 p-1 border rounded text-center"></td><td class="p-3 text-center flex justify-center gap-1"><button onclick="updateQty(${x},-1)" class="w-6 bg-gray-200 rounded">-</button><span class="w-6 font-bold text-sm">${i.qty}</span><button onclick="updateQty(${x},1)" class="w-6 bg-gray-200 rounded">+</button></td><td class="p-3 text-right font-bold">${formatPrice(i.prixVente*i.qty)}</td><td class="p-3 text-right"><button onclick="saleCart.splice(${x},1);renderCart()" class="text-red-500">X</button></td></tr>`; }); };
window.updateItemPrice = (i,v) => { let p = parseFloat(v); if(p<0||isNaN(p)) return renderCart(); saleCart[i].prixVente = p; renderCart(); };
window.updateQty = (i,d) => { const it = saleCart[i]; const st = allProducts.find(p => p.id===it.id)?.stock||0; if(d>0 && it.qty>=st) return showToast("Stock max", "error"); it.qty+=d; if(it.qty<=0) saleCart.splice(i,1); renderCart(); };
window.clearCart = () => { if(saleCart.length>0 && confirm("Vider ?")) { saleCart=[]; renderCart(); } };

// ================= ADMIN & STOCK & EXPENSES (Déjà corrects dans versions précédentes) =================
// ================= STOCK (AVEC MODIFICATION & TRAÇABILITÉ) =================

// ================= STOCK (LIGNE CLIQUABLE + TRAÇABILITÉ) =================

function setupStockManagement() {
    const stockForm = document.getElementById('form-stock');
    const editForm = document.getElementById('form-edit-product');
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
            
            // 1. Gestion du style (Grisé si archivé)
            let rowClass = p.deleted ? "deleted-row" : "border-b border-gray-100 transition";
            
            // 2. Gestion du Clic sur la ligne (Seulement pour Admin et si non supprimé)
            let rowAction = "";
            if (userRole === 'admin' && !p.deleted) {
                // On encode les données pour les passer à la fonction
                const productData = encodeURIComponent(JSON.stringify(p));
                rowAction = `onclick="openEditProduct('${productData}')"`;
                rowClass += " cursor-pointer hover:bg-blue-50"; // Curseur main + survol bleu
            }

            // 3. Bouton Supprimer (Avec stopPropagation pour ne pas ouvrir la modale en supprimant)
            const deleteBtn = (userRole === 'admin' && !p.deleted) 
                ? `<button class="text-red-500 hover:bg-red-100 p-2 rounded-full transition" 
                           onclick="event.stopPropagation(); deleteProduct('${p.id}')" 
                           title="Archiver">
                       <i data-lucide="trash-2" class="w-4 h-4"></i>
                   </button>` 
                : '';

            tr.className = rowClass;
            
            // On injecte l'action onclick directement dans la balise <tr>
            // Note: On n'ajoute l'action que si c'est l'admin (géré par rowAction plus haut)
            tr.innerHTML = `
                <td ${rowAction} class="p-4 font-medium text-gray-800">
                    ${p.nomDisplay || p.nom} 
                    ${p.deleted ? '<span class="text-xs italic text-gray-400">(Archivé)</span>' : ''}
                </td>
                <td ${rowAction} class="p-4 font-bold text-blue-600">${formatPrice(p.prixAchat || 0)}</td>
                <td ${rowAction} class="p-4 text-gray-500 text-sm">${formatPrice(p.prixVente || 0)}</td>
                <td ${rowAction} class="p-4">
                    <span class="${p.stock < 5 && !p.deleted ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} px-2 py-1 rounded-full text-xs font-bold">
                        ${p.stock}
                    </span>
                </td>
                <td class="p-4 text-right">
                    ${deleteBtn}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        if (window.lucide) window.lucide.createIcons();
    };

    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "products"), (snap) => {
        allProducts = [];
        snap.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
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

    // --- LOGIQUE DE MODIFICATION (GLOBALISÉE) ---
    window.openEditProduct = (encodedProduct) => {
        const p = JSON.parse(decodeURIComponent(encodedProduct));
        
        document.getElementById('edit-prod-id').value = p.id;
        document.getElementById('edit-prod-nom').value = p.nomDisplay;
        document.getElementById('edit-prod-achat').value = p.prixAchat;
        document.getElementById('edit-prod-vente').value = p.prixVente;
        document.getElementById('edit-prod-stock').value = p.stock;
        
        const form = document.getElementById('form-edit-product');
        form.dataset.oldAchat = p.prixAchat;
        form.dataset.oldVente = p.prixVente;
        form.dataset.oldStock = p.stock;

        document.getElementById('edit-product-modal').classList.remove('hidden');
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

            try {
                const batch = writeBatch(db);
                const prodRef = doc(db, "boutiques", currentBoutiqueId, "products", id);
                
                batch.update(prodRef, {
                    prixAchat: newAchat,
                    prixVente: newVente,
                    stock: newStock,
                    lastModified: serverTimestamp()
                });

                if (newAchat !== oldAchat || newVente !== oldVente) {
                    const traceRef = doc(collection(db, "boutiques", currentBoutiqueId, "historique_prix"));
                    batch.set(traceRef, {
                        productId: id,
                        productName: nom,
                        oldAchat: oldAchat, newAchat: newAchat,
                        oldVente: oldVente, newVente: newVente,
                        user: userId, date: serverTimestamp()
                    });
                }

                await batch.commit();
                showToast("Modifié avec succès", "success");
                document.getElementById('edit-product-modal').classList.add('hidden');
            } catch (err) { console.error(err); showToast("Erreur modification", "error"); }
        });
    }
    
    window.deleteProduct = (id) => { 
        if(confirm("Archiver ce produit ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "products", id), { deleted: true }); 
    };
}
function setupExpenses() { const form = document.getElementById('form-expense'); onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => { const tbody = document.getElementById('expenses-table-body'); if(tbody) tbody.innerHTML = ''; snap.forEach(d => { const ex = { id: d.id, ...d.data() }; if (ex.deleted && userRole === 'seller') return; if(tbody) { const rowClass = ex.deleted ? "deleted-row" : "border-b"; const deleteBtn = (userRole === 'admin' && !ex.deleted) ? `<button onclick="deleteExp('${ex.id}')" class="text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''; tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 text-sm">${new Date(ex.date?.seconds*1000).toLocaleDateString()}</td><td class="p-4 font-medium">${ex.motif}</td><td class="p-4 text-right font-bold text-red-600">-${formatPrice(ex.montant)}</td><td class="p-4 text-right">${deleteBtn}</td></tr>`; } }); if (window.lucide) window.lucide.createIcons(); }); if(form) { form.addEventListener('submit', async (e) => { e.preventDefault(); try { await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "expenses")), { motif: document.getElementById('exp-motif').value, montant: parseFloat(document.getElementById('exp-montant').value), date: serverTimestamp(), user: userId, deleted: false }); form.reset(); showToast("Dépense ajoutée"); } catch(e) { showToast("Erreur", "error"); } }); } window.deleteExp = (id) => { if(confirm("Annuler dépense ?")) updateDoc(doc(db, "boutiques", currentBoutiqueId, "expenses", id), { deleted: true }); }; }
function setupAdminFeatures() { const f = document.getElementById('create-boutique-form'); document.getElementById('open-admin-modal')?.addEventListener('click', () => document.getElementById('admin-modal').classList.remove('hidden')); document.getElementById('admin-modal-close-btn')?.addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden')); if(f) f.addEventListener('submit', async (e) => { e.preventDefault(); try { const secApp = initializeApp(firebaseConfig, "Sec"); const secAuth = getAuth(secApp); const ref = doc(collection(db, "boutiques")); await setDoc(ref, { nom: document.getElementById('new-boutique-name').value, createdAt: serverTimestamp(), createdBy: userId }); const adm = await createUserWithEmailAndPassword(secAuth, document.getElementById('admin-email').value, document.getElementById('admin-password').value); await setDoc(doc(db, "users", adm.user.uid), { email: document.getElementById('admin-email').value, role: 'admin', boutiqueId: ref.id, boutiqueName: document.getElementById('new-boutique-name').value }); await signOut(secAuth); const sell = await createUserWithEmailAndPassword(secAuth, document.getElementById('seller-email').value, document.getElementById('seller-password').value); await setDoc(doc(db, "users", sell.user.uid), { email: document.getElementById('seller-email').value, role: 'seller', boutiqueId: ref.id, boutiqueName: document.getElementById('new-boutique-name').value }); await signOut(secAuth); showToast("Créé !"); f.reset(); document.getElementById('admin-modal').classList.add('hidden'); loadBoutiquesList(); loadShopsForImport(); } catch(err) { showToast(err.message, "error"); } }); }
async function loadBoutiquesList() { const l = await getAvailableBoutiques(); const d = document.getElementById('admin-boutiques-list'); if(d) d.innerHTML = l.map(b => `<div class="p-2 border-b">${b.nom}</div>`).join(''); }
async function loadShopsForImport() { const s = document.getElementById('import-target-shop'); if(!s) return; const l = await getAvailableBoutiques(); s.innerHTML = '<option value="">-- Choisir --</option>'; l.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.nom; s.appendChild(o); }); }
window.processImport = async function(n) { const id = document.getElementById('import-target-shop').value; if(!id) return showToast("Boutique?", "error"); const f = document.getElementById(n==='products'?'csv-stock':n==='clients'?'csv-clients':n==='expenses'?'csv-expenses':'csv-sales').files[0]; if(!f) return showToast("Fichier?", "error"); Papa.parse(f, { header: true, skipEmptyLines: true, complete: async (r) => { if(confirm(`Importer ${r.data.length}?`)) await uploadBatchData(id, n, r.data); } }); };
async function uploadBatchData(id, n, d) { const b = writeBatch(db); let c = 0; for(const r of d) { const ref = doc(collection(db, "boutiques", id, n)); let o = {}; try { if(n==='products') { let pv = parseFloat(r.PrixVente?.replace(',', '.'))||0; let pa = parseFloat(r.PrixAchat?.replace(',', '.'))||0; o = { nom: r.Nom?.toLowerCase()||'inc', nomDisplay: r.Nom||'Inc', prixVente: pv, prixAchat: pa, stock: parseInt(r.Quantite)||0, createdAt: serverTimestamp(), deleted: false }; } else if(n==='clients') o = { nom: r.Nom||'Inc', telephone: r.Telephone||'', dette: parseFloat(r.Dette)||0, createdAt: serverTimestamp(), deleted: false }; else if(n==='expenses') o = { date: r.Date?new Date(r.Date):serverTimestamp(), motif: r.Motif||'Imp', montant: parseFloat(r.Montant)||0, user: userId, deleted: false }; else if(n==='ventes') { const q = parseInt(r.Quantite)||1; const p = parseFloat(r.PrixUnitaire||r.Total)||0; o = { date: r.Date?new Date(r.Date):serverTimestamp(), total: q*p, profit: parseFloat(r.Profit)||0, items:[{ id:'imp', nom: r.Produit?.toLowerCase()||'imp', nomDisplay: r.Produit||'Imp', qty: q, prixVente: p, prixAchat: 0 }], type:'cash_import', vendeurId:'imp', deleted: false }; } b.set(ref, o); c++; if(c%450===0){ await b.commit(); b = writeBatch(db); } } catch(e){} } if(c%450!==0) await b.commit(); showToast(`Importé ${c}`); }

// Fonctions UI
window.switchTab = function(n) { document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden')); document.getElementById(`page-${n}`).classList.remove('hidden'); document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.querySelector(`.tab[onclick="switchTab('${n}')"]`).classList.add('active'); };
function hideTab(n) { const t = document.querySelector(`.tab[onclick="switchTab('${n}')"]`); if(t) t.style.display = 'none'; }
function showTab(n) { const t = document.querySelector(`.tab[onclick="switchTab('${n}')"]`); if(t) t.style.display = 'flex'; }
function showAllTabs() { document.querySelectorAll('.tab').forEach(t => t.style.display = 'flex'); }
function showToast(m, t="success") { const c = document.getElementById("toast-container"); const e = document.createElement("div"); e.className = `toast ${t==='success'?'bg-green-600':'bg-red-600'}`; e.textContent = m; c.appendChild(e); setTimeout(()=>e.remove(), 3000); }
function formatPrice(p) { return (parseFloat(p)||0).toLocaleString('fr-FR') + ' CFA'; }
function showConfirmModal(t, x, a) { document.getElementById('confirm-modal-title').textContent = t; document.getElementById('confirm-modal-text').textContent = x; actionToConfirm = a; document.getElementById('confirm-modal').classList.remove('hidden'); }
function setupModalListeners() { document.getElementById('modal-cancel-btn').addEventListener('click', ()=>document.getElementById('confirm-modal').classList.add('hidden')); document.getElementById('modal-confirm-btn').addEventListener('click', ()=>{ if(actionToConfirm) actionToConfirm(); document.getElementById('confirm-modal').classList.add('hidden'); }); document.getElementById('admin-modal-close-btn').addEventListener('click', ()=>document.getElementById('admin-modal').classList.add('hidden')); }

main();