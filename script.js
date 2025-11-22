// ===============================================
// SCRIPT: VERSION FINALE
// ===============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setDoc, doc, collection, onSnapshot, updateDoc, writeBatch, serverTimestamp, increment, deleteDoc, getDocs, getDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        try { await signInWithEmailAndPassword(auth, email, pass); } 
        catch (error) { showToast("Erreur login", "error"); }
    });
    document.getElementById('bottom-logout-btn').addEventListener('click', () => signOut(auth));
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
                    
                    if (userRole === 'seller') {
                        ['dashboard','rapports','charges','admin'].forEach(hideTab);
                        switchTab('ventes');
                    } else {
                        showAllTabs();
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

// ================= DASHBOARD =================
function setupDashboard() {
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "ventes"), (snap) => {
        let totalCA = 0, totalProfit = 0;
        const productStats = {}; 
        const recentDiv = document.getElementById('dash-recent-sales');
        if(recentDiv) recentDiv.innerHTML = '';
        
        const sales = [];
        snap.forEach(d => sales.push(d.data()));
        sales.sort((a,b) => b.date?.seconds - a.date?.seconds);

        sales.forEach(s => {
            totalCA += s.total || 0;
            totalProfit += s.profit || 0;
            if(s.items && Array.isArray(s.items)) {
                s.items.forEach(item => {
                    if (!productStats[item.id]) productStats[item.id] = { name: item.nomDisplay || item.nom, qty: 0, profit: 0 };
                    productStats[item.id].qty += (item.qty || 0);
                    const itemProfit = (item.prixVente - (item.prixAchat || 0)) * item.qty;
                    productStats[item.id].profit += itemProfit;
                });
            }
        });

        if(document.getElementById('dash-total-sales')) document.getElementById('dash-total-sales').textContent = formatPrice(totalCA);
        if(document.getElementById('dash-total-profit')) document.getElementById('dash-total-profit').textContent = formatPrice(totalProfit);

        if(recentDiv) {
            sales.slice(0, 5).forEach(s => {
                const div = document.createElement('div');
                div.className = "flex justify-between border-b pb-2 last:border-0 items-center";
                div.innerHTML = `<div><div class="font-medium text-gray-700">${new Date(s.date?.seconds*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div><div class="font-bold text-blue-600">${formatPrice(s.total)}</div>`;
                recentDiv.appendChild(div);
            });
        }

        const statsArray = Object.values(productStats);
        const topProfit = [...statsArray].sort((a, b) => b.profit - a.profit).slice(0, 10);
        const profitBody = document.getElementById('dash-top-profit-body');
        if (profitBody) {
            profitBody.innerHTML = topProfit.map(p => `<tr class="border-b last:border-0"><td class="p-2 font-medium text-gray-700">${p.name}</td><td class="p-2 text-right font-bold text-green-600">${formatPrice(p.profit)}</td></tr>`).join('');
        }

        const topQty = [...statsArray].sort((a, b) => b.qty - a.qty).slice(0, 10);
        const qtyBody = document.getElementById('dash-top-qty-body');
        if (qtyBody) {
            qtyBody.innerHTML = topQty.map(p => `<tr class="border-b last:border-0"><td class="p-2 font-medium text-gray-700">${p.name}</td><td class="p-2 text-right font-bold text-blue-600">${p.qty}</td></tr>`).join('');
        }
    });

    setInterval(() => {
        const lowDiv = document.getElementById('dash-low-stock');
        if(!lowDiv) return;
        const low = allProducts.filter(p => p.stock < 5);
        if (low.length > 0) {
            lowDiv.innerHTML = low.map(p => `<div class="flex justify-between text-sm p-2 bg-orange-50 rounded text-orange-700 mb-1"><span>${p.nomDisplay}</span><span class="font-bold">${p.stock}</span></div>`).join('');
        } else {
            lowDiv.innerHTML = '<p class="text-gray-400 italic">Stock OK.</p>';
        }
    }, 3000);
}

// ================= VENTES =================
function setupSalesPage() {
    const searchInput = document.getElementById('sale-search');
    const resultsDiv = document.getElementById('sale-search-results');
    const btnCash = document.getElementById('btn-validate-cash');
    const btnCredit = document.getElementById('btn-open-credit-modal');
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

    btnCredit.addEventListener('click', async () => {
        if (saleCart.length === 0) return showToast("Panier vide", "error");
        const select = document.getElementById('credit-client-select');
        select.innerHTML = '<option value="">Chargement...</option>';
        const clientsSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "clients"));
        if (clientsSnap.empty) { showToast("Aucun client enregistré.", "error"); return; }
        select.innerHTML = '<option value="">-- Choisir un client --</option>';
        clientsSnap.forEach(doc => {
            const c = doc.data();
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.textContent = c.nom;
            select.appendChild(opt);
        });
        document.getElementById('credit-sale-modal').classList.remove('hidden');
    });

    document.getElementById('confirm-credit-sale-btn').addEventListener('click', async () => {
        const select = document.getElementById('credit-client-select');
        const clientId = select.value;
        const clientName = select.options[select.selectedIndex]?.text;
        if (!clientId) return showToast("Veuillez sélectionner un client", "error");
        document.getElementById('credit-sale-modal').classList.add('hidden');
        await processSale('credit', clientId, clientName);
    });
}

// REMPLACEZ LA FONCTION processSale EXISTANTE PAR CELLE-CI :

async function processSale(type, clientId, clientName) {
    try {
        const batch = writeBatch(db);
        const saleRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
        
        let total = 0, profit = 0;
        // On garde une copie des items pour la facture avant de vider le panier
        const itemsForInvoice = JSON.parse(JSON.stringify(saleCart)); 

        // 1. Calculs et Stock
        for (const item of saleCart) {
            const lineTotal = item.prixVente * item.qty;
            const lineProfit = (item.prixVente - (item.prixAchat || 0)) * item.qty;
            total += lineTotal;
            profit += lineProfit;

            const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(-item.qty) });
        }

        // 2. Crédit
        if (type === 'credit' && clientId) {
            const clientRef = doc(db, "boutiques", currentBoutiqueId, "clients", clientId);
            batch.update(clientRef, { dette: increment(total) });
        }

        // 3. Enregistrement
        const saleData = {
            items: saleCart,
            total: total,
            profit: profit,
            date: serverTimestamp(),
            vendeurId: userId,
            type: type,
            clientId: clientId || null,
            clientName: clientName || null
        };

        batch.set(saleRef, saleData);
        await batch.commit();
        
        // 4. SUCCÈS : On lance la facture WhatsApp AVANT de vider le panier visuellement
        showInvoiceModal(itemsForInvoice, total, type, clientName);

        // On vide le panier logique
        saleCart = [];
        renderCart();
        // showToast supprimé car la modale confirme déjà

    } catch (err) {
        console.error(err);
        showToast("Erreur lors de la vente", "error");
    }
}

// AJOUTEZ CETTE NOUVELLE FONCTION JUSTE APRÈS processSale :

function showInvoiceModal(items, total, type, clientName) {
    const modal = document.getElementById('invoice-modal');
    const amountEl = document.getElementById('invoice-amount');
    const previewEl = document.getElementById('invoice-preview');
    const whatsappBtn = document.getElementById('btn-whatsapp-share');
    
    // 1. Affichage Montant
    amountEl.textContent = formatPrice(total);
    
    // 2. Génération du texte pour WhatsApp
    // On récupère le nom de la boutique depuis le dashboard
    const shopName = document.getElementById('dashboard-user-name').textContent.trim();
    const dateStr = new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    
    let receiptText = `🧾 *REÇU DE PAIEMENT*\n`;
    receiptText += `🏪 ${shopName}\n`;
    receiptText += `📅 ${dateStr}\n`;
    if(clientName) receiptText += `👤 Client: ${clientName}\n`;
    receiptText += `------------------------\n`;
    
    let previewHtml = "";

    items.forEach(item => {
        const lineTotal = item.prixVente * item.qty;
        // Texte WhatsApp
        receiptText += `${item.qty}x ${item.nomDisplay} : ${formatPrice(lineTotal)}\n`;
        // Aperçu HTML
        previewHtml += `<div class="flex justify-between"><span>${item.qty}x ${item.nomDisplay}</span><span>${formatPrice(lineTotal)}</span></div>`;
    });

    receiptText += `------------------------\n`;
    receiptText += `💰 *TOTAL: ${formatPrice(total)}*\n`;
    
    if(type === 'credit') {
        receiptText += `📝 *VENTE À CRÉDIT - NON PAYÉ*\n`;
    } else {
        receiptText += `✅ *PAYÉ EN ESPÈCES*\n`;
    }
    
    receiptText += `\nMerci de votre visite ! 🙏`;

    // 3. Mise à jour UI
    previewEl.innerHTML = previewHtml;
    
    // 4. Création du lien WhatsApp (encodage URL)
    const encodedText = encodeURIComponent(receiptText);
    whatsappBtn.href = `https://wa.me/?text=${encodedText}`;
    
    // 5. Afficher la modale
    modal.classList.remove('hidden');
    
    // Recréer les icônes Lucide dans la modale
    if (window.lucide) window.lucide.createIcons();
}

window.addToCart = (p) => {
    if (p.stock <= 0) return showToast("Stock épuisé", "error");
    const exist = saleCart.find(i => i.id === p.id);
    if (exist) { 
        if(exist.qty >= p.stock) return showToast("Stock max atteint", "error");
        exist.qty++; 
    } else { 
        // AJOUT DE LA DATE ICI
        saleCart.push({ ...p, qty: 1, addedAt: new Date() }); 
    }
    document.getElementById('sale-search').value = '';
    document.getElementById('sale-search-results').classList.add('hidden');
    renderCart();
};

window.renderCart = () => {
    const tbody = document.getElementById('cart-table-body');
    const totalEl = document.getElementById('cart-total-display');
    tbody.innerHTML = '';
    let total = 0;
    
    if (saleCart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400 italic">Panier vide</td></tr>';
        totalEl.textContent = "0 CFA";
        return;
    }

    saleCart.forEach((item, idx) => {
        total += item.prixVente * item.qty;
        
        // FORMATAGE DE LA DATE (HEURE SEULEMENT)
        const timeStr = item.addedAt ? new Date(item.addedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';

        tbody.innerHTML += `
            <tr class="border-b last:border-0 border-gray-50">
                <td class="p-3 text-gray-400 text-xs">${timeStr}</td>
                <td class="p-3 font-medium text-gray-700">${item.nomDisplay}</td>
                <td class="p-3 text-center flex justify-center gap-1 items-center">
                    <button onclick="updateQty(${idx}, -1)" class="w-6 h-6 bg-gray-100 rounded hover:bg-gray-200">-</button>
                    <span class="w-6 text-center font-bold text-sm">${item.qty}</span>
                    <button onclick="updateQty(${idx}, 1)" class="w-6 h-6 bg-gray-100 rounded hover:bg-gray-200">+</button>
                </td>
                <td class="p-3 text-right font-bold text-gray-800">${formatPrice(item.prixVente * item.qty)}</td>
                <td class="p-3 text-right"><button onclick="saleCart.splice(${idx},1);renderCart()" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            </tr>
        `;
    });
    totalEl.textContent = formatPrice(total);
    if (window.lucide) window.lucide.createIcons();
};

window.updateQty = (idx, delta) => {
    const item = saleCart[idx];
    const stockReel = allProducts.find(p => p.id === item.id)?.stock || 0;
    if (delta > 0 && item.qty >= stockReel) return showToast("Stock insuffisant", "error");
    item.qty += delta;
    if (item.qty <= 0) saleCart.splice(idx, 1);
    renderCart();
};

// ================= AUTRES (STOCK, CREDITS, ADMIN...) =================

function setupStockManagement() {
    const stockForm = document.getElementById('form-stock');
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "products"), (snap) => {
        allProducts = [];
        const tbody = document.getElementById('stock-table-body');
        if(tbody) tbody.innerHTML = '';
        snap.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            allProducts.push(p);
            if(tbody) {
                tbody.innerHTML += `<tr class="border-b"><td class="p-4 font-medium">${p.nomDisplay}</td><td class="p-4">${formatPrice(p.prixVente)}</td><td class="p-4 font-bold ${p.stock<5?'text-red-600':'text-green-600'}">${p.stock}</td><td class="p-4"><button class="text-red-500" onclick="deleteProduct('${p.id}')"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`;
            }
        });
        if (window.lucide) window.lucide.createIcons();
    });
    if(stockForm) {
        stockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('prod-nom').value;
            const prix = parseFloat(document.getElementById('prod-prix').value);
            const achat = parseFloat(document.getElementById('prod-achat').value) || 0;
            const qte = parseInt(document.getElementById('prod-qte').value);
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "products")), {
                    nom: nom.toLowerCase(), nomDisplay: nom, prixVente: prix, prixAchat: achat, stock: qte, createdAt: serverTimestamp()
                });
                stockForm.reset(); document.getElementById('add-product-form').classList.add('hidden'); showToast("Produit ajouté");
            } catch (err) { showToast("Erreur ajout", "error"); }
        });
    }
    window.deleteProduct = (id) => { if(confirm("Supprimer ?")) deleteDoc(doc(db, "boutiques", currentBoutiqueId, "products", id)); };
}

function setupCredits() {
    const form = document.getElementById('form-client');
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "clients"), (snap) => {
        const tbody = document.getElementById('credits-table-body');
        let totalDette = 0;
        if(tbody) tbody.innerHTML = '';
        snap.forEach(d => {
            const c = { id: d.id, ...d.data() };
            totalDette += (c.dette || 0);
            if(tbody) {
                tbody.innerHTML += `<tr class="border-b"><td class="p-4 font-medium">${c.nom}</td><td class="p-4">${c.telephone||'-'}</td><td class="p-4 font-bold text-orange-600">${formatPrice(c.dette||0)}</td><td class="p-4 text-right flex gap-2 justify-end"><button onclick="rembourserClient('${c.id}', ${c.dette})" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">Payer</button><button onclick="deleteClient('${c.id}')" class="text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`;
            }
        });
        if(document.getElementById('dash-total-credits')) document.getElementById('dash-total-credits').textContent = formatPrice(totalDette);
        if (window.lucide) window.lucide.createIcons();
    });
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('client-nom').value;
            const tel = document.getElementById('client-tel').value;
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "clients")), { nom, telephone: tel, dette: 0, createdAt: serverTimestamp() });
                form.reset(); document.getElementById('add-client-modal').classList.add('hidden'); showToast("Client ajouté");
            } catch(e) { showToast("Erreur", "error"); }
        });
    }
    window.rembourserClient = (id, dette) => {
        const m = prompt(`Montant (Max: ${dette})`);
        if(m && !isNaN(m)) updateDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id), { dette: increment(-parseFloat(m)) });
    };
    window.deleteClient = (id) => { if(confirm("Supprimer ?")) deleteDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id)); };
}

function setupExpenses() {
    const form = document.getElementById('form-expense');
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => {
        const tbody = document.getElementById('expenses-table-body');
        let total = 0;
        if(tbody) tbody.innerHTML = '';
        snap.forEach(d => {
            const ex = { id: d.id, ...d.data() };
            total += (ex.montant || 0);
            if(tbody) tbody.innerHTML += `<tr class="border-b"><td class="p-4 text-sm">${new Date(ex.date?.seconds*1000).toLocaleDateString()}</td><td class="p-4">${ex.motif}</td><td class="p-4 text-right font-bold text-red-600">-${formatPrice(ex.montant)}</td><td class="p-4"><button onclick="deleteExp('${ex.id}')" class="text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`;
        });
        if(document.getElementById('dash-total-expenses')) document.getElementById('dash-total-expenses').textContent = formatPrice(total);
        if (window.lucide) window.lucide.createIcons();
    });
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "expenses")), {
                    motif: document.getElementById('exp-motif').value, 
                    montant: parseFloat(document.getElementById('exp-montant').value), 
                    date: serverTimestamp(), user: userId
                });
                form.reset(); showToast("Dépense ajoutée");
            } catch(e) { showToast("Erreur", "error"); }
        });
    }
    window.deleteExp = (id) => { if(confirm("Supprimer ?")) deleteDoc(doc(db, "boutiques", currentBoutiqueId, "expenses", id)); };
}

// ================= HISTORIQUE / RAPPORTS =================

function setupReports() {
    const btnFilter = document.getElementById('btn-filter-reports');
    const dateStart = document.getElementById('report-date-start');
    const dateEnd = document.getElementById('report-date-end');

    // Initialiser les dates (ce mois-ci par défaut)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    dateStart.valueAsDate = firstDay;
    dateEnd.valueAsDate = now;

    // Fonction principale de chargement
    const loadData = async () => {
        const tbody = document.getElementById('reports-table-body');
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Chargement...</td></tr>';

        try {
            // 1. Récupérer Ventes et Dépenses
            const salesSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "ventes"));
            const expSnap = await getDocs(collection(db, "boutiques", currentBoutiqueId, "expenses"));

            let transactions = [];

            // 2. Traiter les Ventes
            salesSnap.forEach(doc => {
                const s = doc.data();
                // Créer une description des articles (ex: "Savon x1, Parfum x2")
                const desc = s.items ? s.items.map(i => `${i.nomDisplay || i.nom} (x${i.qty})`).join(', ') : 'Vente divers';
                
                transactions.push({
                    date: s.date?.toDate ? s.date.toDate() : new Date(),
                    desc: desc,
                    type: 'VENTE',
                    credit: s.type === 'credit', // Si c'est une vente à crédit
                    amount: s.total || 0,
                    isExpense: false
                });
            });

            // 3. Traiter les Dépenses
            expSnap.forEach(doc => {
                const e = doc.data();
                transactions.push({
                    date: e.date?.toDate ? e.date.toDate() : new Date(),
                    desc: e.motif || 'Dépense',
                    type: 'SORTIE',
                    credit: false,
                    amount: e.montant || 0,
                    isExpense: true
                });
            });

            // 4. Filtrer par Date
            const start = new Date(dateStart.value); start.setHours(0,0,0,0);
            const end = new Date(dateEnd.value); end.setHours(23,59,59,999);

            transactions = transactions.filter(t => t.date >= start && t.date <= end);

            // 5. Trier (Du plus récent au plus ancien)
            transactions.sort((a, b) => b.date - a.date);

            // 6. Afficher et Calculer Totaux
            tbody.innerHTML = '';
            let totalVente = 0;
            let totalDepense = 0;

            if (transactions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Aucun mouvement sur cette période.</td></tr>';
            }

            transactions.forEach(t => {
                const row = document.createElement('tr');
                
                // Styles conditionnels
                const classVente = t.isExpense ? 'text-gray-300' : 'text-green-600 font-bold';
                const classDepense = t.isExpense ? 'text-red-600 font-bold' : 'text-gray-300';
                
                // Colonne Articles : Si c'est une dépense en rouge (comme l'image), sinon noir
                const descClass = t.isExpense ? 'text-red-500 font-medium' : 'text-gray-700';
                
                // Calculs
                if(t.isExpense) totalDepense += t.amount;
                else totalVente += t.amount;

                row.className = "border-b hover:bg-gray-50 transition";
                row.innerHTML = `
                    <td class="p-3 text-gray-500 text-xs whitespace-nowrap">
                        ${t.date.toLocaleDateString()} <br> 
                        <span class="text-gray-300">${t.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </td>
                    <td class="p-3 text-sm ${descClass}">
                        ${t.desc}
                        ${t.credit ? '<span class="ml-2 bg-orange-100 text-orange-600 px-2 py-0.5 rounded text-xs">Crédit</span>' : ''}
                    </td>
                    <td class="p-3 text-center text-xs font-bold text-gray-400">
                        ${t.isExpense ? 'DÉPENSE' : 'VENTE'}
                    </td>
                    <td class="p-3 text-right text-sm ${classVente}">
                        ${!t.isExpense ? formatPrice(t.amount) : '-'}
                    </td>
                    <td class="p-3 text-right text-sm ${classDepense}">
                        ${t.isExpense ? formatPrice(t.amount) : '-'}
                    </td>
                `;
                tbody.appendChild(row);
            });

            // Mise à jour des cartes du haut
            document.getElementById('report-total-sales').textContent = formatPrice(totalVente);
            document.getElementById('report-total-expenses').textContent = formatPrice(totalDepense);
            document.getElementById('report-balance').textContent = formatPrice(totalVente - totalDepense);

        } catch (error) {
            console.error(error);
            showToast("Erreur chargement historique", "error");
        }
    };

    // Ecouteurs
    btnFilter.addEventListener('click', loadData);
    
    // Chargement initial automatique quand on clique sur l'onglet
    // On ajoute un petit hack pour recharger quand l'onglet devient visible
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (!mutation.target.classList.contains('hidden')) {
                loadData();
            }
        });
    });
    observer.observe(document.getElementById('page-rapports'), { attributes: true, attributeFilter: ['class'] });
}

function setupAdminFeatures() {
    const form = document.getElementById('create-boutique-form');
    document.getElementById('open-admin-modal')?.addEventListener('click', () => document.getElementById('admin-modal').classList.remove('hidden'));
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('new-boutique-name').value;
            try {
                const ref = doc(collection(db, "boutiques"));
                await setDoc(ref, { nom, createdAt: serverTimestamp(), createdBy: userId });
                showToast(`Boutique ${nom} créée ! Créez les utilisateurs manuellement.`, "success");
                form.reset();
                document.getElementById('admin-modal').classList.add('hidden');
                loadBoutiquesList();
            } catch (err) { console.error(err); showToast("Erreur", "error"); }
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