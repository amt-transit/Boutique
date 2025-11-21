// ===============================================
// SCRIPT: GESTION BOUTIQUE V2 (INTEGRALE)
// ===============================================

// Imports Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
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

// Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCluRVv-olQsTuZZBPjjJns1jHq0vkhjSw",
    authDomain: "maboutique-7891.firebaseapp.com",
    projectId: "maboutique-7891",
    storageBucket: "maboutique-7891.firebasestorage.app",
    messagingSenderId: "402820959115",
    appId: "1:402820959115:web:6fb6b2c78fc9c5fe203d8e"
};

// --- Variables Globales ---
let db, auth, userId;
let allProducts = [], saleCart = []; 
let currentBoutiqueId = null, userRole = null, isSuperAdmin = false, superAdminUserId = null;
let actionToConfirm = null; 

// --- Initialisation DOM & Events ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const topNavBar = document.getElementById('top-nav-bar');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('bottom-logout-btn');
const adminModal = document.getElementById('admin-modal');
const adminModalCloseBtn = document.getElementById('admin-modal-close-btn');
const createBoutiqueForm = document.getElementById('create-boutique-form');
const openAdminModalBtn = document.getElementById('open-admin-modal');
const adminTabBtn = document.getElementById('admin-tab-btn');
const adminBadge = document.getElementById('admin-badge');

// --- Navigation Onglets ---
window.switchTab = function(tabName) {
    document.querySelectorAll('.page-content').forEach(page => page.classList.add('hidden'));
    const targetPage = document.getElementById(`page-${tabName}`);
    if (targetPage) targetPage.classList.remove('hidden');
    
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if (activeTab) activeTab.classList.add('active');
}

// --- Utils ---
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function formatPrice(price) {
    return (parseFloat(price) || 0).toLocaleString('fr-FR') + ' CFA';
}

// --- Main Launch ---
async function main() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('error');

        setupLoginForm();
        setupAuthListener(); // C'est ici que la magie opère (Check User Database)
        setupAdminFeatures(); 
        setupModalListeners(); 
        
        await updateBoutiqueSelector(); 
        
    } catch (error) {
        console.error("Firebase Error:", error);
        showToast("Erreur critique Firebase", "error");
    }
}

// --- 1. AUTHENTIFICATION ---

async function getAvailableBoutiques() {
    const s = await getDocs(collection(db, "boutiques"));
    const b = [];
    s.forEach(d => b.push({id: d.id, ...d.data()}));
    return b;
}

async function updateBoutiqueSelector() {
    const select = document.getElementById('login-boutique');
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
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showToast("Email ou mot de passe incorrect.", "error");
        }
    });
    
    logoutBtn.addEventListener('click', () => signOut(auth));
}

// --- LOGIQUE DE CONNEXION CORRIGÉE (Pas de déconnexion au F5) ---
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            console.log("Connecté:", userId);

            try {
                // A. VERIFIER SI C'EST UN SUPER ADMIN
                const superAdminRef = doc(db, "super_admins", userId);
                const superAdminSnap = await getDoc(superAdminRef);

                if (superAdminSnap.exists()) {
                    isSuperAdmin = true;
                    superAdminUserId = userId;
                    showSuperAdminInterface();
                    return;
                }

                // B. SINON, C'EST UN UTILISATEUR BOUTIQUE (On regarde dans la base, pas dans le menu)
                const userDocRef = doc(db, "users", userId);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    
                    // On récupère les infos depuis la Base de données (Database)
                    userRole = userData.role; 
                    currentBoutiqueId = userData.boutiqueId;
                    
                    document.getElementById('dashboard-user-name').textContent = 
                        `${userData.boutiqueName} (${userRole === 'admin' ? 'Propriétaire' : 'Vendeur'})`;

                    // On cache le badge Super Admin pour les utilisateurs normaux
                    adminBadge.classList.add('hidden');
                    adminTabBtn.classList.add('hidden'); 

                    // Afficher l'application normale
                    authContainer.classList.add('hidden');
                    appContainer.classList.remove('hidden');
                    topNavBar.classList.remove('hidden');
                    
                    // Redirection et Permissions selon le rôle
                    if (userRole === 'seller') {
                        // Vendeur : Ne voit pas Dashboard, Rapports, Charges, Admin
                        hideTab('dashboard');
                        hideTab('rapports');
                        hideTab('charges');
                        hideTab('admin');
                        
                        showTab('stock'); // Peut voir le stock
                        showTab('ventes');
                        showTab('caisse');
                        
                        switchTab('ventes');
                    } else {
                        // Admin Boutique (Propriétaire) : Voit tout sauf Admin Plateforme
                        showAllTabs();
                        hideTab('admin'); 
                        switchTab('dashboard');
                    }
                    
                    initializeApplication();

                } else {
                    showToast("Compte utilisateur inconnu.", "error");
                    await signOut(auth);
                }

            } catch (err) {
                console.error("Auth error:", err);
                // On ne déconnecte pas forcément ici pour éviter les soucis de réseau temporaires
            }
        } else {
            // Déconnexion
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
            topNavBar.classList.add('hidden');
            document.getElementById('login-form').reset();
            currentBoutiqueId = null;
            allProducts = [];
            saleCart = [];
        }
    });
}

// Petites fonctions pour gérer les onglets
function hideTab(name) {
    const t = document.querySelector(`.tab[onclick="switchTab('${name}')"]`);
    if(t) t.style.display = 'none';
}
function showTab(name) {
    const t = document.querySelector(`.tab[onclick="switchTab('${name}')"]`);
    if(t) t.style.display = 'flex';
}
function showAllTabs() {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'flex');
}

function showSuperAdminInterface() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    topNavBar.classList.remove('hidden');
    
    document.getElementById('dashboard-user-name').textContent = "";
    adminBadge.classList.remove('hidden');
    adminTabBtn.classList.remove('hidden');
    
    ['dashboard','ventes','stock','caisse','credits','rapports','charges'].forEach(t => hideTab(t));
    showTab('admin');

    switchTab('admin');
    loadBoutiquesList();
    if (window.lucide) window.lucide.createIcons();
}

// --- 2. INITIALISATION APP ---

function initializeApplication() {
    if(!currentBoutiqueId) return; // Sécurité
    console.log("App Init: " + currentBoutiqueId);
    setupDashboard();
    setupStockManagement();
    setupSalesPage();
    setupCredits();
    setupExpenses();
    if (window.lucide) window.lucide.createIcons();
}

// --- A. DASHBOARD ---
function setupDashboard() {
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "ventes"), (snap) => {
        let totalCA = 0, totalProfit = 0;
        const recentDiv = document.getElementById('dash-recent-sales');
        if(recentDiv) recentDiv.innerHTML = '';
        
        const sales = [];
        snap.forEach(d => sales.push(d.data()));
        sales.sort((a,b) => b.date?.seconds - a.date?.seconds);

        sales.forEach(s => {
            totalCA += s.total || 0;
            totalProfit += s.profit || 0;
        });

        const elCA = document.getElementById('dash-total-sales');
        if(elCA) elCA.textContent = formatPrice(totalCA);
        const elProf = document.getElementById('dash-total-profit');
        if(elProf) elProf.textContent = formatPrice(totalProfit);

        if(recentDiv) {
            sales.slice(0, 5).forEach(s => {
                const div = document.createElement('div');
                div.className = "flex justify-between border-b pb-2 last:border-0 items-center";
                div.innerHTML = `
                    <div>
                        <div class="font-medium text-gray-700">${new Date(s.date?.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                        <div class="text-xs text-gray-500">${s.items.length} art.</div>
                    </div>
                    <div class="font-bold text-blue-600">${formatPrice(s.total)}</div>
                `;
                recentDiv.appendChild(div);
            });
        }
    });

    // Stock Alert Loop
    setInterval(() => {
        const lowDiv = document.getElementById('dash-low-stock');
        if(!lowDiv) return;
        const low = allProducts.filter(p => p.stock < 5);
        
        if (low.length > 0) {
            lowDiv.innerHTML = low.map(p => `
                <div class="flex justify-between items-center text-sm p-2 bg-red-50 rounded text-red-700 mb-1">
                    <span>${p.nomDisplay}</span>
                    <span class="font-bold">${p.stock}</span>
                </div>
            `).join('');
        } else {
            lowDiv.innerHTML = '<p class="text-sm text-gray-400">Stock OK.</p>';
        }
    }, 3000);
}

// --- B. STOCK ---
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
                const tr = document.createElement('tr');
                tr.className = "border-b border-gray-100 hover:bg-gray-50 transition";
                tr.innerHTML = `
                    <td class="p-4 font-medium text-gray-800">${p.nomDisplay || p.nom}</td>
                    <td class="p-4 text-blue-600 font-bold">${formatPrice(p.prixVente)}</td>
                    <td class="p-4 text-gray-500 text-sm">${formatPrice(p.prixAchat || 0)}</td>
                    <td class="p-4">
                        <span class="${p.stock < 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} px-2 py-1 rounded-full text-xs font-bold">
                            ${p.stock}
                        </span>
                    </td>
                    <td class="p-4 text-right">
                        <button class="delete-prod-btn text-red-400 hover:text-red-600 p-2" data-id="${p.id}">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });
        
        if (window.lucide) window.lucide.createIcons();

        document.querySelectorAll('.delete-prod-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                showConfirmModal("Supprimer ?", "Action irréversible.", async () => {
                    await deleteDoc(doc(db, "boutiques", currentBoutiqueId, "products", id));
                    showToast("Produit supprimé");
                });
            });
        });
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
                    nom: nom.toLowerCase(),
                    nomDisplay: nom,
                    prixVente: prix,
                    prixAchat: achat,
                    stock: qte,
                    createdAt: serverTimestamp()
                });
                stockForm.reset();
                document.getElementById('add-product-form').classList.add('hidden');
                showToast("Produit ajouté !", "success");
            } catch (err) {
                showToast("Erreur ajout", "error");
            }
        });
    }
}

// --- C. VENTES ---
function setupSalesPage() {
    const searchInput = document.getElementById('sale-search');
    const resultsDiv = document.getElementById('sale-search-results');
    const validateBtn = document.getElementById('btn-validate-sale');

    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            if (term.length < 1) {
                resultsDiv.classList.add('hidden');
                return;
            }

            const matches = allProducts.filter(p => p.nom.includes(term));
            resultsDiv.innerHTML = '';
            
            if (matches.length > 0) {
                resultsDiv.classList.remove('hidden');
                matches.forEach(p => {
                    const div = document.createElement('div');
                    div.className = "p-3 hover:bg-blue-50 cursor-pointer border-b flex justify-between";
                    div.innerHTML = `
                        <span>${p.nomDisplay}</span>
                        <span class="text-xs font-bold ${p.stock>0?'text-green-600':'text-red-600'}">Stock: ${p.stock}</span>
                    `;
                    div.onclick = () => addToCart(p);
                    resultsDiv.appendChild(div);
                });
            } else {
                resultsDiv.classList.add('hidden');
            }
        });

        // Close search on click outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
                resultsDiv.classList.add('hidden');
            }
        });
    }

    if(validateBtn) {
        validateBtn.addEventListener('click', async () => {
            if (saleCart.length === 0) return showToast("Panier vide", "error");

            showConfirmModal("Valider la vente ?", `Total: ${document.getElementById('cart-total-display').textContent}`, async () => {
                try {
                    const batch = writeBatch(db);
                    const saleRef = doc(collection(db, "boutiques", currentBoutiqueId, "ventes"));
                    
                    let total = 0, profit = 0;

                    for (const item of saleCart) {
                        const lineTotal = item.prixVente * item.qty;
                        const lineProfit = (item.prixVente - (item.prixAchat || 0)) * item.qty;
                        total += lineTotal;
                        profit += lineProfit;

                        const pRef = doc(db, "boutiques", currentBoutiqueId, "products", item.id);
                        batch.update(pRef, { stock: increment(-item.qty) });
                    }

                    batch.set(saleRef, {
                        items: saleCart,
                        total: total,
                        profit: profit,
                        date: serverTimestamp(),
                        vendeurId: userId,
                        type: 'cash'
                    });

                    await batch.commit();
                    
                    saleCart = [];
                    renderCart();
                    showToast(`Vente validée !`, "success");

                } catch (err) {
                    console.error(err);
                    showToast("Erreur vente", "error");
                }
            });
        });
    }
}

// Helpers Sales (Window Scope)
window.addToCart = (p) => {
    if (p.stock <= 0) return showToast("Stock épuisé !", "error");
    const exist = saleCart.find(i => i.id === p.id);
    if (exist) {
        if (exist.qty >= p.stock) return showToast("Stock max atteint", "error");
        exist.qty++;
    } else {
        saleCart.push({ ...p, qty: 1 });
    }
    document.getElementById('sale-search').value = '';
    document.getElementById('sale-search-results').classList.add('hidden');
    renderCart();
};

window.renderCart = () => {
    const tbody = document.getElementById('cart-table-body');
    const totalEl = document.getElementById('cart-total-display');
    if(!tbody) return;
    tbody.innerHTML = '';
    let total = 0;
    
    saleCart.forEach((item, idx) => {
        const linePrice = item.prixVente * item.qty;
        total += linePrice;
        tbody.innerHTML += `
            <tr class="border-b last:border-0 border-gray-100">
                <td class="p-3 font-medium">${item.nomDisplay}</td>
                <td class="p-3 text-center flex justify-center gap-1">
                    <button onclick="updateQty(${idx}, -1)" class="w-6 bg-gray-200 rounded">-</button>
                    <span class="w-6 text-center font-bold">${item.qty}</span>
                    <button onclick="updateQty(${idx}, 1)" class="w-6 bg-gray-200 rounded">+</button>
                </td>
                <td class="p-3 text-right font-bold">${formatPrice(linePrice)}</td>
                <td class="p-3 text-right">
                    <button onclick="removeFromCart(${idx})" class="text-red-400"><i data-lucide="x" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `;
    });
    
    if (saleCart.length === 0) tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Vide</td></tr>';
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

window.removeFromCart = (idx) => { saleCart.splice(idx, 1); renderCart(); };

// --- D. CRÉDITS ---
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
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-4 font-medium">${c.nom}</td>
                        <td class="p-4 text-gray-500">${c.telephone || '-'}</td>
                        <td class="p-4 font-bold text-orange-600">${formatPrice(c.dette || 0)}</td>
                        <td class="p-4 text-right flex justify-end gap-2">
                            <button onclick="rembourserClient('${c.id}', ${c.dette})" class="bg-green-100 text-green-700 px-3 py-1 rounded text-xs hover:bg-green-200">Rembourser</button>
                            <button onclick="deleteClient('${c.id}')" class="text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </td>
                    </tr>
                `;
            }
        });
        const credEl = document.getElementById('dash-total-credits');
        if(credEl) credEl.textContent = formatPrice(totalDette);
        if (window.lucide) window.lucide.createIcons();
    });

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('client-nom').value;
            const tel = document.getElementById('client-tel').value;
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "clients")), {
                    nom, telephone: tel, dette: 0, createdAt: serverTimestamp()
                });
                form.reset();
                document.getElementById('add-client-modal').classList.add('hidden');
                showToast("Client ajouté", "success");
            } catch(e) { showToast("Erreur", "error"); }
        });
    }

    window.rembourserClient = (id, dette) => {
        if(dette <= 0) return showToast("Pas de dette", "warning");
        const m = prompt(`Montant du remboursement (Max: ${dette})`);
        if(m && !isNaN(m)) {
            updateDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id), {
                dette: increment(-parseFloat(m))
            }).then(() => showToast("Remboursement OK"));
        }
    };

    window.deleteClient = (id) => {
        if(confirm("Supprimer client ?")) deleteDoc(doc(db, "boutiques", currentBoutiqueId, "clients", id));
    };
}

// --- E. CHARGES ---
function setupExpenses() {
    const form = document.getElementById('form-expense');
    
    onSnapshot(collection(db, "boutiques", currentBoutiqueId, "expenses"), (snap) => {
        const tbody = document.getElementById('expenses-table-body');
        let total = 0;
        if(tbody) tbody.innerHTML = '';
        
        snap.forEach(d => {
            const ex = { id: d.id, ...d.data() };
            total += (ex.montant || 0);
            if(tbody) {
                tbody.innerHTML += `
                    <tr class="border-b">
                        <td class="p-4 text-gray-500 text-sm">${new Date(ex.date?.seconds*1000).toLocaleDateString()}</td>
                        <td class="p-4 font-medium">${ex.motif}</td>
                        <td class="p-4 text-right font-bold text-red-600">-${formatPrice(ex.montant)}</td>
                        <td class="p-4 text-right"><button onclick="deleteExp('${ex.id}')" class="text-gray-400 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button></td>
                    </tr>
                `;
            }
        });
        const expEl = document.getElementById('dash-total-expenses');
        if(expEl) expEl.textContent = formatPrice(total);
        if (window.lucide) window.lucide.createIcons();
    });

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const motif = document.getElementById('exp-motif').value;
            const montant = parseFloat(document.getElementById('exp-montant').value);
            try {
                await setDoc(doc(collection(db, "boutiques", currentBoutiqueId, "expenses")), {
                    motif, montant, date: serverTimestamp(), user: userId
                });
                form.reset();
                showToast("Dépense ajoutée");
            } catch(e) { showToast("Erreur", "error"); }
        });
    }

    window.deleteExp = (id) => {
        if(confirm("Supprimer dépense ?")) deleteDoc(doc(db, "boutiques", currentBoutiqueId, "expenses", id));
    };
}

// --- 3. ADMIN FEATURES ---

function setupAdminFeatures() {
    if(adminModalCloseBtn) adminModalCloseBtn.addEventListener('click', () => adminModal.classList.add('hidden'));
    if(openAdminModalBtn) openAdminModalBtn.addEventListener('click', () => {
        adminModal.classList.remove('hidden');
        loadBoutiquesList();
    });

    if(createBoutiqueForm) {
        createBoutiqueForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Création dans Firestore uniquement (proto)
            const nom = document.getElementById('new-boutique-name').value;
            const adminEmail = document.getElementById('admin-email').value;
            const sellerEmail = document.getElementById('seller-email').value;

            try {
                const bRef = doc(collection(db, "boutiques"));
                await setDoc(bRef, { nom: nom, createdAt: serverTimestamp(), createdBy: userId });
                
                showToast("Boutique créée ! Créez les utilisateurs manuellement dans Firebase Auth.", "success");
                createBoutiqueForm.reset();
                adminModal.classList.add('hidden');
                loadBoutiquesList();
                updateBoutiqueSelector();
            } catch (err) {
                console.error(err);
                showToast("Erreur création", "error");
            }
        });
    }
}

async function loadBoutiquesList() {
    const list = await getAvailableBoutiques();
    const div = document.getElementById('admin-boutiques-list');
    if (!div) return;
    document.getElementById('total-boutiques').textContent = list.length;
    div.innerHTML = list.map(b => `<div class="flex justify-between p-2 border-b"><span>${b.nom}</span></div>`).join('');
}

function setupModalListeners() {
    const modal = document.getElementById('confirm-modal');
    if(modal) {
        document.getElementById('modal-cancel-btn').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('modal-confirm-btn').addEventListener('click', () => { if(actionToConfirm) actionToConfirm(); modal.classList.add('hidden'); });
    }
}

main();