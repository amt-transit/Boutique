import { 
    db, auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, 
    sendPasswordResetEmail, getDoc, doc, updateDoc
} from './firebase.js';
import { showToast, switchTab, showAllTabs, hideTab, showTab, showConfirmModal } from './ui.js'; 
import * as state from './state.js';

export function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error-msg');
    const errorText = document.getElementById('login-error-text');
    const forgotLink = document.getElementById('forgot-password-link');
    const logoutBtn = document.getElementById('bottom-logout-btn');
    const drawerLogoutBtn = document.getElementById('drawer-logout-btn');
    const togglePwdBtn = document.getElementById('toggle-password-visibility');
    const pwdInput = document.getElementById('login-password');

    if (togglePwdBtn && pwdInput) {
        togglePwdBtn.addEventListener('click', () => {
            const type = pwdInput.getAttribute('type') === 'password' ? 'text' : 'password';
            pwdInput.setAttribute('type', type);
            togglePwdBtn.innerHTML = type === 'password' ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';
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
                console.error("Erreur Auth:", error);
                
                let message = "Une erreur est survenue lors de la connexion.";
                const errorCode = error.code || ""; // Protection contre les erreurs sans code

                if (errorCode.includes('invalid-credential') || errorCode.includes('user-not-found') || errorCode.includes('wrong-password') || errorCode.includes('invalid-email')) {
                    message = "Email ou mot de passe incorrect.";
                } else if (errorCode.includes('too-many-requests')) {
                    message = "Trop de tentatives échouées. Compte temporairement bloqué.";
                } else if (errorCode.includes('network-request-failed')) {
                    message = "Erreur de connexion internet.";
                }
                
                if(errorText) errorText.textContent = message;
                if(errorBox) errorBox.classList.remove('hidden');
            }
        });
    }

    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            showConfirmModal(
                "Déconnexion",
                "Êtes-vous sûr de vouloir vous déconnecter ?",
                () => signOut(auth)
            );
        });
    }

    if(drawerLogoutBtn) {
        drawerLogoutBtn.addEventListener('click', () => {
            if(window.closeHamburgerMenu) window.closeHamburgerMenu();
            showConfirmModal(
                "Déconnexion",
                "Êtes-vous sûr de vouloir vous déconnecter ?",
                () => signOut(auth)
            );
        });
    }

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

export function setupAuthListener(initializeApplication, showSuperAdminInterface) {
    onAuthStateChanged(auth, async (user) => {
        const splash = document.getElementById('splash-screen');
        
        // Fonction pour retirer le splash screen en douceur
        const hideSplash = () => {
            if (splash) {
                // Ajout de scale-95 et blur-sm pour un effet de "départ" plus élégant
                splash.classList.add('opacity-0', 'pointer-events-none', 'scale-95', 'blur-sm');
                setTimeout(() => splash.remove(), 700); // Attend la fin de l'animation CSS
            }
        };

        if (user) {
            state.setUserId(user.uid);
            try {
                const superAdminDoc = await getDoc(doc(db, "super_admins", state.userId));
                if (superAdminDoc.exists()) {
                    // INITIALISATION UI SUPER ADMIN
                    document.getElementById('auth-container').classList.add('hidden');
                    document.getElementById('app-container').classList.remove('hidden');
                    document.getElementById('top-nav-bar').classList.remove('hidden');
                    document.getElementById('global-shop-header').classList.add('hidden');
                    document.getElementById('global-search-container').classList.add('hidden');

                    // MASQUER les onglets de la boutique
                    ['dashboard', 'ventes', 'commandes', 'stock', 'fournisseurs', 'credits', 'charges', 'rapports', 'audit'].forEach(t => hideTab(t));
                    
                    // AFFICHER les onglets Admin
                    document.getElementById('admin-tab-btn').classList.remove('hidden');
                    document.getElementById('admin-access-tab-btn').classList.remove('hidden');

                    switchTab('admin');
                    showSuperAdminInterface();
                    hideSplash();
                    return;
                }
                
                const userDoc = await getDoc(doc(db, "users", state.userId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    
                    let allowedShops = data.allowedShops;
                    let shopIds = data.shopIds;
                    let needsUpdate = false;

                    if (!allowedShops) {
                        // Correction: Gestion des valeurs undefined pour éviter l'erreur Firestore
                        const bId = data.boutiqueId || null;
                        if (bId) {
                            allowedShops = [{ 
                                id: bId, 
                                name: data.boutiqueName || 'Boutique', 
                                role: data.role || 'seller' 
                            }];
                        } else {
                            allowedShops = [];
                        }
                        needsUpdate = true;
                    }
                    if (!shopIds || shopIds.length !== allowedShops.length) {
                        shopIds = allowedShops.map(s => s.id);
                        needsUpdate = true;
                    }

                    if (needsUpdate) {
                        updateDoc(userDoc.ref, { allowedShops: allowedShops, shopIds: shopIds });
                    }

                    // NEW: Check if user has any shop assigned. If not, logout.
                    if (!allowedShops || allowedShops.length === 0) {
                        showToast("Aucune boutique n'est associée à ce compte.", "error");
                        await signOut(auth);
                        // onAuthStateChanged will re-trigger with user=null and handle the UI
                        return; 
                    }

                    let savedShopId = localStorage.getItem('activeShopId');
                    let activeShop = allowedShops.find(s => s.id === savedShopId);
                    
                    if (!activeShop) {
                        activeShop = allowedShops[0];
                        localStorage.setItem('activeShopId', activeShop.id);
                    }

                    state.setCurrentBoutiqueId(activeShop.id);
                    state.setUserRole(activeShop.role);

                    const shopHeader = document.getElementById('global-shop-header');
                    const shopSelect = document.getElementById('global-shop-select');
                    const roleBadge = document.getElementById('global-user-role');
                    
                    if (allowedShops.length > 1) {
                        shopHeader.classList.remove('hidden');
                        shopSelect.innerHTML = allowedShops.map(s => 
                            `<option value="${s.id}" ${s.id === state.currentBoutiqueId ? 'selected' : ''}>${s.name}</option>`
                        ).join('');
                        
                        const newShopSelect = shopSelect.cloneNode(true);
                        shopSelect.parentNode.replaceChild(newShopSelect, shopSelect);
                        
                        newShopSelect.addEventListener('change', (e) => {
                            localStorage.setItem('activeShopId', e.target.value);
                            window.location.reload(); 
                        });
                    } else {
                        shopHeader.classList.add('hidden');
                    }

                    if(roleBadge) roleBadge.textContent = state.userRole === 'admin' ? 'Gérant' : 'Vendeur';

                    const shopDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId));
                    
                    // Mise à jour de l'email dans le hamburger
                    const drawerEmail = document.getElementById('drawer-user-email');
                    if(drawerEmail) drawerEmail.textContent = user.email;
                    const desktopEmail = document.getElementById('desktop-user-email');
                    if(desktopEmail) desktopEmail.textContent = user.email;

                    if (shopDoc.exists()) {
                        const shopData = shopDoc.data();
                        const status = shopData.statut || 'actif';
                        
                        let isExpired = false;
                        let daysLeft = 0;
                        if (shopData.expireAt) {
                            const expireDate = shopData.expireAt.toDate ? shopData.expireAt.toDate() : new Date(shopData.expireAt);
                            const now = new Date();
                            if (now > expireDate) isExpired = true;
                            
                            // Calcul des jours restants pour le bandeau
                            const diffTime = Math.abs(expireDate - now);
                            daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        }

                        if (status === 'suspendu' || isExpired) {
                            document.getElementById('auth-container').classList.add('hidden');
                            document.getElementById('app-container').classList.add('hidden');
                            document.getElementById('subscription-blocked-screen').classList.remove('hidden');
                            
                            document.getElementById('btn-logout-blocked').onclick = () => {
                                document.getElementById('subscription-blocked-screen').classList.add('hidden');
                                signOut(auth);
                            };
                            if (window.lucide) window.lucide.createIcons();
                            return; 
                        } else {
                            document.getElementById('subscription-blocked-screen').classList.add('hidden');
                            
                            // Gestion du bandeau d'essai
                            const trialBanner = document.getElementById('dashboard-trial-banner');
                            if (trialBanner) {
                                if (status === 'essai' && !isExpired) {
                                    document.getElementById('trial-days-left').textContent = daysLeft;
                                    trialBanner.classList.remove('hidden');
                                } else {
                                    trialBanner.classList.add('hidden');
                                }
                            }
                        }
                    }

                    const dashName = document.getElementById('dashboard-user-name');
                    if(dashName) dashName.textContent = activeShop.name;
                    
                    const adminTab = document.getElementById('admin-tab-btn');
                    if(adminTab) adminTab.classList.add('hidden'); 
                    const accessTab = document.getElementById('admin-access-tab-btn');
                    if(accessTab) accessTab.classList.add('hidden'); 

                    document.getElementById('auth-container').classList.add('hidden');
                    document.getElementById('app-container').classList.remove('hidden');
                    document.getElementById('top-nav-bar').classList.remove('hidden');
                    document.getElementById('global-search-container').classList.remove('hidden');
                    
                    // AFFICHER les onglets standards de la boutique
                    ['dashboard', 'ventes', 'commandes', 'stock', 'fournisseurs', 'credits', 'charges', 'rapports', 'audit'].forEach(t => showTab(t));
                    
                    // MASQUER explicitement les onglets Admin
                    document.getElementById('admin-tab-btn').classList.add('hidden');
                    document.getElementById('admin-access-tab-btn').classList.add('hidden');

                    // Gestion du bouton équipe dans le hamburger (Admin boutique seulement)
                    const teamBtn = document.getElementById('drawer-team-btn');
                    const desktopTeamBtn = document.getElementById('desktop-team-btn');
                    
                    const isAdmin = state.userRole === 'admin';
                    
                    if(teamBtn) teamBtn.classList.toggle('hidden', !isAdmin);
                    if(desktopTeamBtn) desktopTeamBtn.classList.toggle('hidden', !isAdmin);

                    if (state.userRole === 'seller') { 
                        switchTab('dashboard'); // Les vendeurs arrivent maintenant sur leur dashboard simplifié
                    } else { 
                        switchTab('dashboard'); 
                    }
                    initializeApplication();
                    hideSplash();
                } else {
                    showToast("Compte introuvable", "error");
                    await signOut(auth);
                    hideSplash();
                }
            } catch (err) { 
                console.error(err);
                hideSplash();
            }
        } else {
            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
            document.getElementById('top-nav-bar').classList.add('hidden');
            state.setCurrentBoutiqueId(null);
            if (window.lucide) window.lucide.createIcons();
            hideSplash();
        }
    });
}
