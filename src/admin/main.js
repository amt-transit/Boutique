// src/admin/main.js
import { db, collection, getDocs, doc, setDoc, serverTimestamp, updateDoc, addDoc, query, where, getAuth, deleteApp, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, initializeApp, deleteDoc, orderBy } from '../firebase.js';
import { showToast, showTab, hideTab, switchTab, showConfirmModal, formatPrice } from '../ui.js';
import * as state from '../state.js';
import { firebaseConfig } from '../firebase.js'; // Need the config for secondary app


async function getAvailableBoutiques() {
    try {
        const s = await getDocs(collection(db, "boutiques"));
        const b = [];
        s.forEach(d => b.push({id: d.id, ...d.data()}));
        state.setAllShopsList(b);
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

async function logAdminAction(actionType, details) {
    try {
        await addDoc(collection(db, "admin_logs"), {
            action: actionType,
            details: details,
            date: serverTimestamp(),
            adminId: state.userId
        });
    } catch (e) {
        console.error("Erreur enregistrement log:", e);
    }
}

export async function loadBoutiquesList() { 
    try {
        if (!state.allShopsList || state.allShopsList.length === 0) {
            await getAvailableBoutiques();
        }

        const searchInput = document.getElementById('admin-shops-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        let boutiquesToRender = state.allShopsList;

        if (searchTerm) {
            boutiquesToRender = state.allShopsList.filter(b => 
                b.nom.toLowerCase().includes(searchTerm)
            );
        }

        const d = document.getElementById('admin-boutiques-list'); 
        if(d) {
            if (boutiquesToRender.length === 0) {
                d.innerHTML = `<div class="p-4 text-center text-gray-500">Aucune boutique trouvée.</div>`;
                return;
            }

            d.innerHTML = boutiquesToRender.map(b => {
                let expStr = "À vie";
                let isExpired = false;
                let rawDate = "";
                
                if(b.expireAt) {
                    const dateObj = b.expireAt.toDate ? b.expireAt.toDate() : new Date(b.expireAt);
                    expStr = dateObj.toLocaleDateString('fr-FR');
                    rawDate = dateObj.toISOString().split('T')[0];
                    isExpired = new Date() > dateObj;
                }
                
                let badge = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Actif</span>';
                if (b.statut === 'suspendu' || isExpired) {
                    badge = '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">Bloqué</span>';
                } else if (b.statut === 'essai') {
                    badge = '<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold">Essai</span>';
                }

                return `
                <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition shop-item" data-id="${b.id}">
                    <div>
                        <div class="font-bold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">${b.nom} ${badge}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Exp: <strong>${expStr}</strong></div>
                    </div>
                    <div class="flex gap-2">
                        <button class="js-immersion-btn bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-200 transition" title="Voir comme le client">
                            👁️ Immersion
                        </button>
                        <button class="js-access-btn bg-purple-50 hover:bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-purple-200 transition">
                            🛠️ Accès
                        </button>
                    </div>
                </div>`;
            }).join('');
            
            // Gestionnaires d'événements (remplace onclick)
            d.querySelectorAll('.js-quick-toggle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const shopId = e.target.closest('.shop-item').dataset.id;
                    const shop = state.allShopsList.find(s => s.id === shopId);
                    if (shop) {
                        const newStatus = shop.statut === 'suspendu' ? 'actif' : 'suspendu';
                        const actionName = newStatus === 'actif' ? 'Réactiver' : 'Suspendre';
                        showConfirmModal(`${actionName} la boutique`, `Voulez-vous vraiment ${actionName.toLowerCase()} la boutique "${shop.nom}" ?`, async () => {
                            await updateDoc(doc(db, "boutiques", shop.id), { statut: newStatus });
                            await logAdminAction("QUICK_TOGGLE", `Boutique ${shop.nom} passée en statut: ${newStatus}`);
                            showToast(`Boutique ${newStatus} avec succès !`, "success");
                            loadBoutiquesList(); // Recharger la liste
                        });
                    }
                });
            });

            d.querySelectorAll('.js-immersion-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const shopId = e.target.closest('.shop-item').dataset.id;
                    const shop = state.allShopsList.find(s => s.id === shopId);
                    if (shop) enterImmersionMode(shop.id, shop.nom);
                });
            });

            d.querySelectorAll('.js-access-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const shopId = e.target.closest('.shop-item').dataset.id;
                    const shop = state.allShopsList.find(s => s.id === shopId);
                    if (shop) {
                        let rDate = "";
                        if(shop.expireAt) {
                            const dObj = shop.expireAt.toDate ? shop.expireAt.toDate() : new Date(shop.expireAt);
                            rDate = dObj.toISOString().split('T')[0];
                        }
                        openSubscriptionManager(shop.id, shop.nom, shop.statut || 'actif', rDate);
                    }
                });
            });
        }
        if (window.lucide) window.lucide.createIcons();
    } catch(e) { console.error(e); }
}

export function setupAdminFeatures() {
    const form = document.getElementById('create-boutique-form');
    document.getElementById('open-admin-modal')?.addEventListener('click', () => document.getElementById('admin-modal').classList.remove('hidden'));
    document.getElementById('admin-modal-close-btn')?.addEventListener('click', () => document.getElementById('admin-modal').classList.add('hidden'));

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
    setupPassToggle('toggle-create-admin-pass', 'admin-password');
    setupPassToggle('toggle-create-seller-pass', 'seller-password');

    // Add search listener for shops
    const shopSearchInput = document.getElementById('admin-shops-search');
    if (shopSearchInput) {
        shopSearchInput.addEventListener('input', loadBoutiquesList);
    }

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nom = document.getElementById('new-boutique-name').value;
            let aEm = document.getElementById('admin-email').value.trim();
            let aPs = document.getElementById('admin-password').value;
            let sEm = document.getElementById('seller-email').value.trim();
            let sPs = document.getElementById('seller-password').value;
            const logoFile = document.getElementById('new-boutique-logo').files[0];
            
            const formatCreds = (em, ps) => {
                let fEm = em.includes('@') ? em : em.replace(/\s+/g, '').toLowerCase() + "@maboutique.app";
                let fPs = (ps.length >= 4 && ps.length < 6) ? ps.padEnd(6, '0') : ps;
                return { email: fEm, pass: fPs };
            };
    
            const adminCreds = formatCreds(aEm, aPs);
            const sellerCreds = formatCreds(sEm, sPs);

            if(adminCreds.pass.length < 4 || sellerCreds.pass.length < 4) return showToast("Pass ou PIN trop court (min 4)", "error");
            showToast("Création...", "warning");

            try {
                let logoStr = null;
                if(logoFile) {
                    if(logoFile.size > 100000) return showToast("Logo > 100ko", "error");
                    logoStr = await convertBase64(logoFile);
                }

                const ref = doc(collection(db, "boutiques"));
                const dateFin = new Date();
                dateFin.setDate(dateFin.getDate() + 14);

                await setDoc(ref, { nom: nom, logo: logoStr, createdAt: serverTimestamp(), createdBy: state.userId, statut: 'essai', expireAt: dateFin });
                await logAdminAction("NOUVELLE_BOUTIQUE", `Création de la boutique : ${nom}`);

                const assignOrUpdateUser = async (email, pass, role, shopId, shopName) => {
                    const q = query(collection(db, "users"), where("email", "==", email));
                    const snap = await getDocs(q);
                    
                    if (!snap.empty) {
                        const userDocRef = snap.docs[0].ref;
                        const userData = snap.docs[0].data();
                        let shops = userData.allowedShops || [{id: userData.boutiqueId, name: userData.boutiqueName, role: userData.role}];
                        let sIds = userData.shopIds || [userData.boutiqueId];
                        
                        if (!shops.find(s => s.id === shopId)) {
                            shops.push({id: shopId, name: shopName, role: role});
                            sIds.push(shopId);
                            await updateDoc(userDocRef, { allowedShops: shops, shopIds: sIds });
                        }
                    } else {
                        const secApp = initializeApp(firebaseConfig, "SecApp_" + Date.now() + Math.random());
                        const secAuth = getAuth(secApp);
                        try {
                            const cred = await createUserWithEmailAndPassword(secAuth, email, pass);
                            await setDoc(doc(db, "users", cred.user.uid), { email: email, role: role, password: pass, allowedShops: [{id: shopId, name: shopName, role: role}], shopIds: [shopId] });
                        } finally {
                            await signOut(secAuth);
                            await deleteApp(secApp);
                        }
                    }
                };

                await assignOrUpdateUser(adminCreds.email, adminCreds.pass, 'admin', ref.id, nom);
                await assignOrUpdateUser(sellerCreds.email, sellerCreds.pass, 'seller', ref.id, nom);

                showToast("Boutique créée et accès configurés !");

                loadBoutiquesList();
                // Actualiser la liste d'importation si la fonction est disponible
                if (typeof window.loadShopsForImport === 'function') window.loadShopsForImport();
                setupAdminAccessPage();
            } catch(err) { 
                showToast(err.message, "error"); 
                console.error("Création erreur :", err);
            }
        });
    }
}

export async function setupSuperAdminDashboard() {
    const boutiquesSnap = await getDocs(collection(db, "boutiques"));
    const usersSnap = await getDocs(collection(db, "users"));
    
    document.getElementById('admin-stat-boutiques').textContent = boutiquesSnap.size;
    document.getElementById('admin-stat-users').textContent = usersSnap.size;

    let blockedCount = 0;
    const now = new Date();
    
    const latestShops = [];
    
    boutiquesSnap.forEach(doc => {
        const b = {id: doc.id, ...doc.data()};
        latestShops.push(b);
        
        let isExpired = false;
        if(b.expireAt) {
            const expDate = b.expireAt.toDate ? b.expireAt.toDate() : new Date(b.expireAt);
            if(now > expDate) isExpired = true;
        }
        if(b.statut === 'suspendu' || isExpired) {
            blockedCount++;
        }
    });
    state.setAllShopsList(latestShops);

    // --- Calcul du Chiffre d'Affaires Global (Asynchrone) ---
    const revenueEl = document.getElementById('admin-stat-revenue');
    if (revenueEl) {
        revenueEl.innerHTML = '<i data-lucide="loader-2" class="w-6 h-6 animate-spin inline-block"></i> Calcul...';
        if (window.lucide) window.lucide.createIcons();
        
        setTimeout(async () => {
            let globalTotal = 0;
            for (const b of latestShops) {
                try {
                    const ventesSnap = await getDocs(collection(db, "boutiques", b.id, "ventes"));
                    ventesSnap.forEach(v => {
                        const s = v.data();
                        if (!s.deleted) {
                            if (['cash', 'cash_import', 'remboursement', 'mobile_money', 'credit'].includes(s.type)) globalTotal += (s.total || 0);
                            if (['retour', 'retour_credit'].includes(s.type)) globalTotal -= (s.total || 0);
                        }
                    });
                } catch (e) { console.error("Erreur CA boutique", b.id, e); }
            }
            if (revenueEl) revenueEl.textContent = formatPrice(globalTotal);
        }, 500); // Léger délai pour laisser l'interface principale s'afficher en premier
    }

    const alertStatBox = document.getElementById('admin-stat-alerts');
    if (alertStatBox) alertStatBox.textContent = blockedCount;

    try {
        const logsSnap = await getDocs(collection(db, "admin_logs"));
        const logsStatBox = document.getElementById('admin-stat-logs');
        if (logsStatBox) logsStatBox.textContent = logsSnap.size;
    } catch(e) {
        console.log("Aucun log trouvé.");
    }

    const listWidget = document.getElementById('admin-latest-shops-list');
    if(listWidget) {
        latestShops.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        listWidget.innerHTML = latestShops.slice(0, 5).map(b => `
            <div class="flex items-center gap-3 p-3 border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700">
                <div class="w-10 h-10 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">${b.nom ? b.nom.charAt(0).toUpperCase() : '?'}</div>
                <div>
                    <h4 class="font-bold text-gray-800 dark:text-gray-200 text-sm">${b.nom}</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Ajouté le ${b.createdAt ? new Date(b.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : 'N/A'}</p>
                </div>
            </div>
        `).join('') || '<div class="p-4 text-center text-gray-400">Aucune boutique</div>';
    }

    const ctx = document.getElementById('admin-chart-shops');
    if (ctx && typeof Chart !== 'undefined') {
        const months = {};
        latestShops.forEach(b => {
            const d = b.createdAt ? new Date(b.createdAt.seconds * 1000) : new Date();
            const key = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            months[key] = (months[key] || 0) + 1;
        });

        if(window.adminChartInstance) window.adminChartInstance.destroy();
        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();

        const labels = Object.keys(months).reverse();
        const data = Object.values(months).reverse();

        window.adminChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Nouvelles Boutiques', data, backgroundColor: '#3b82f6', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    }
}

export async function setupAdminAccessPage() {
    const searchInput = document.getElementById('admin-users-search');
    const listContainer = document.getElementById('admin-users-list');
    if(!searchInput || !listContainer) return;

    const usersSnap = await getDocs(collection(db, "users"));
    let allUsers = [];
    usersSnap.forEach(d => allUsers.push({id: d.id, ...d.data()}));

    const deleteUserAccount = (userId) => {
        showConfirmModal("Supprimer l'utilisateur", "Voulez-vous vraiment supprimer cet utilisateur ? Son accès à l'application sera révoqué.", async () => {
            try {
                await deleteDoc(doc(db, "users", userId));
                showToast("Utilisateur supprimé !", "success");
                setupAdminAccessPage(); // Rafraîchit la liste
            } catch (e) {
                showToast("Erreur: " + e.message, "error");
            }
        });
    };

    const render = (filter = '') => {
        listContainer.innerHTML = ''; 
        const term = filter.toLowerCase();
        
        const filtered = allUsers.filter(u => {
            const emailMatch = u.email && u.email.toLowerCase().includes(term);
            const roleMatch = u.role && u.role.toLowerCase().includes(term);
            const shopName = u.boutiqueName || (u.allowedShops && u.allowedShops.length > 0 ? u.allowedShops[0].name : '');
            const shopMatch = shopName && shopName.toLowerCase().includes(term);
            return emailMatch || roleMatch || shopMatch;
        });

        if(filtered.length === 0) { listContainer.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Aucun utilisateur trouvé.</td></tr>'; return; }

        filtered.forEach(u => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-purple-50 dark:hover:bg-gray-700 transition";
            
            const roleBadge = u.role === 'admin' ? '<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">Propriétaire</span>' : '<span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Vendeur</span>';

            tr.innerHTML = `
                <td class="p-3 font-medium text-gray-800 dark:text-gray-200">${u.boutiqueName || u.allowedShops?.[0]?.name || 'Inconnu'}</td>
                <td class="p-3 font-mono text-gray-600 dark:text-gray-400 select-all">${u.email}</td>
                <td class="p-3">${roleBadge}</td>
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <input type="password" value="${u.password || ''}" readonly class="bg-transparent border-none w-24 text-xs font-mono focus:ring-0 text-gray-500" placeholder="Non enregistré">
                        <button type="button" class="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 px-2 py-1 rounded text-[10px] font-bold transition js-toggle-table-pass">
                            <i data-lucide="eye" class="w-3 h-3"></i>
                        </button>
                    </div>
                </td>
                <td class="p-3 text-right">
                    <button data-email="${u.email}" class="js-reset-btn bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-bold border border-gray-300 mr-2" title="Envoyer un email pour changer le mot de passe">📧 Reset Pass</button>
                    <button data-id="${u.id}" class="js-delete-user-btn bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded text-xs font-bold border border-red-200" title="Supprimer l'utilisateur"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            `;
            listContainer.appendChild(tr);
        });
        
        listContainer.querySelectorAll('.js-reset-btn').forEach(btn => {
            btn.addEventListener('click', () => sendResetMail(btn.dataset.email));
        });

        listContainer.querySelectorAll('.js-delete-user-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUserAccount(btn.dataset.id));
        });

        // Gestionnaire pour afficher/masquer le mot de passe dans le tableau
        listContainer.querySelectorAll('.js-toggle-table-pass').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const input = e.currentTarget.previousElementSibling;
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                if (type === 'password') {
                    e.currentTarget.innerHTML = '<i data-lucide="eye" class="w-3 h-3"></i>';
                } else {
                    e.currentTarget.innerHTML = '<i data-lucide="eye-off" class="w-3 h-3"></i>';
                }
                if(window.lucide) window.lucide.createIcons();
            });
        });
    };
    render(); 

    // Éviter d'ajouter plusieurs fois l'écouteur d'événement (ex: après retour immersion)
    // On clone le noeud pour supprimer les anciens écouteurs
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.value = searchInput.value; // Préserver la valeur
    newSearchInput.addEventListener('input', (e) => render(e.target.value));
}

const sendResetMail = (email) => {
    if (email && email.includes('@maboutique.app')) {
        return showToast("Impossible d'envoyer un email à un Pseudo. Cliquez sur l'icône 👁️ pour voir son mot de passe en clair !", "warning");
    }

    showConfirmModal("Réinitialisation Mot de passe", `Envoyer un email de réinitialisation de mot de passe à : ${email} ?`, async () => {
        try {
            const auth = getAuth();
            await sendPasswordResetEmail(auth, email);
            showToast("Email envoyé avec succès !", "success");
        } catch(e) {
            showToast("Erreur: " + e.message, "error");
        }
    });
};

const openSubscriptionManager = function(id, nom, statut, dateString) {
    document.getElementById('sub-shop-name').textContent = nom;
    document.getElementById('sub-status-select').value = statut;
    document.getElementById('sub-date-input').value = dateString;
    document.getElementById('subscription-modal').classList.remove('hidden');

    const btn = document.getElementById('btn-save-subscription');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async () => {
        const newStatus = document.getElementById('sub-status-select').value;
        const newDateStr = document.getElementById('sub-date-input').value;
        
        try {
            let updateData = { statut: newStatus };
            if(newDateStr) updateData.expireAt = new Date(newDateStr);
            
            await updateDoc(doc(db, "boutiques", id), updateData);
            showToast("Abonnement mis à jour !");
            await logAdminAction("MAJ_ABONNEMENT", `Boutique ${nom} | Statut: ${newStatus}`);
            document.getElementById('subscription-modal').classList.add('hidden');
            loadBoutiquesList();
        } catch(e) {
            showToast("Erreur", "error");
            console.error(e);
        }
    });
};

window.openAdminLogsModal = async () => {
    const modal = document.getElementById('admin-logs-modal');
    const tbody = document.getElementById('admin-logs-body');
    if (!modal || !tbody) return;
    
    modal.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></td></tr>';
    if (window.lucide) window.lucide.createIcons();

    try {
        const q = query(collection(db, "admin_logs"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500 italic">Aucun log enregistré pour le moment.</td></tr>';
            return;
        }
        
        tbody.innerHTML = snap.docs.map(d => {
            const log = d.data();
            const dateStr = log.date ? new Date(log.date.seconds * 1000).toLocaleString('fr-FR') : '-';
            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition border-b dark:border-slate-700">
                    <td class="p-3 text-xs text-gray-500 font-mono">${dateStr}</td>
                    <td class="p-3 font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">${log.action}</td>
                    <td class="p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-normal">${log.details || ''}</td>
                </tr>`;
        }).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-500">Erreur de chargement des logs. Note: Vérifiez qu\'un index composite n\'est pas requis.</td></tr>';
    }
};

// --- IMMERSION MODE ---
let originalBoutiqueId = null;

const enterImmersionMode = function(shopId, shopName) {
    showConfirmModal("Mode Immersion", `Entrer dans la boutique "${shopName}" pour voir ce que voit le client ?`, () => {
        originalBoutiqueId = state.currentBoutiqueId; 
        state.setCurrentBoutiqueId(shopId);
        state.setUserRole('admin');

        document.getElementById('immersion-banner').classList.remove('hidden');
        document.getElementById('immersion-shop-name').textContent = shopName;
        document.getElementById('admin-tab-btn').classList.add('hidden');
        document.getElementById('admin-access-tab-btn').classList.add('hidden');
        document.getElementById('global-search-container').classList.remove('hidden');

        // Afficher les onglets de la boutique pour l'immersion
        ['dashboard', 'ventes', 'commandes', 'stock', 'fournisseurs', 'credits', 'charges', 'rapports', 'audit'].forEach(t => showTab(t));

        // Correction: Vérifier si la fonction existe avant de l'appeler
        if (typeof window.initializeApplication === 'function') {
            window.initializeApplication();
        } else {
            console.warn("window.initializeApplication introuvable. Assurez-vous que le script principal est chargé.");
        }
        
        switchTab('dashboard');
        showToast(`Immersion dans ${shopName}`);
    });
};

// Gardé sur window car probablement appelé depuis le HTML de la bannière statique
window.exitImmersionMode = function() {
    state.setCurrentBoutiqueId(null); 
    state.setUserRole(null);

    document.getElementById('immersion-banner').classList.add('hidden');
    document.getElementById('global-shop-header').classList.add('hidden');
    
    // Correction: Appeler directement les fonctions d'initialisation Admin
    document.getElementById('admin-tab-btn').classList.remove('hidden');
    document.getElementById('admin-access-tab-btn').classList.remove('hidden');
    document.getElementById('global-search-container').classList.add('hidden');
    
    // Masquer les onglets de la boutique
    ['dashboard', 'ventes', 'commandes', 'stock', 'fournisseurs', 'credits', 'charges', 'rapports', 'audit'].forEach(t => hideTab(t));

    switchTab('admin');
    setupSuperAdminDashboard();
    loadBoutiquesList();
    setupAdminAccessPage();
    
    showToast("Retour à l'interface Super Admin");
};
