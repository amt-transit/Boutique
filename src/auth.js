import { 
    db, auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, 
    sendPasswordResetEmail, getDoc, doc, updateDoc, storage, ref, uploadString, getDownloadURL
} from './firebase.js';
import { showToast, switchTab, showAllTabs, hideTab, showTab, showConfirmModal, showPromptModal } from './ui.js'; 
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

    // --- GESTION DU CLAVIER PIN ---
    let currentPin = "";
    let isPinMode = true; // Par défaut on est sur le PIN

    const updatePinDisplay = () => {
        const container = document.getElementById('pin-dots');
        if (!container) return;
        container.innerHTML = '';
        const totalDots = Math.max(4, currentPin.length);
        for (let i = 0; i < totalDots; i++) {
            const dot = document.createElement('div');
            dot.className = `w-4 h-4 rounded-full transition-colors ${i < currentPin.length ? 'bg-blue-600 dark:bg-blue-500 shadow-inner' : 'bg-gray-200 dark:bg-slate-700'}`;
            container.appendChild(dot);
        }
    };

    const clearPin = () => { currentPin = ""; updatePinDisplay(); };

    document.querySelectorAll('.pin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentPin.length < 10) { // Limitons à 10 chiffres max
                currentPin += btn.textContent.trim();
                updatePinDisplay();
            }
        });
    });

    const pinDelBtn = document.querySelector('.pin-del');
    if (pinDelBtn) {
        pinDelBtn.addEventListener('click', () => {
            if (currentPin.length > 0) { currentPin = currentPin.slice(0, -1); updatePinDisplay(); }
        });
    }

    const pinSubmitBtn = document.querySelector('.pin-submit');
    if (pinSubmitBtn) {
        pinSubmitBtn.addEventListener('click', () => {
            if(loginForm) loginForm.dispatchEvent(new Event('submit'));
        });
    }

    const toggleModeBtn = document.getElementById('toggle-login-mode');
    if (toggleModeBtn) {
        toggleModeBtn.addEventListener('click', () => {
            isPinMode = !isPinMode;
            document.getElementById('login-pin-mode').classList.toggle('hidden', !isPinMode);
            document.getElementById('login-keyboard-mode').classList.toggle('hidden', isPinMode);
            document.getElementById('btn-login-submit').classList.toggle('hidden', isPinMode); // Cacher bouton en mode PIN
            toggleModeBtn.textContent = isPinMode ? "Utiliser un mot de passe classique" : "Utiliser le code PIN (4 chiffres)";
            if (isPinMode) clearPin();
        });
    }

    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(errorBox) errorBox.classList.add('hidden');
            let rawEmail = document.getElementById('login-email').value.trim();
            if (!rawEmail) return showToast("Veuillez saisir un identifiant", "error");

            // Transformation du Pseudo en Email
            let email = rawEmail;
            if (!email.includes('@')) {
                email = email.replace(/\s+/g, '').toLowerCase() + "@maboutique.app";
            }

            let pass = "";
            if (isPinMode) {
                if (currentPin.length < 4) return showToast("Entrez au moins 4 chiffres", "warning");
                pass = currentPin;
                if (pass.length < 6) pass = pass.padEnd(6, '0'); // S'assure d'avoir au moins 6 caractères pour Firebase
            } else {
                pass = document.getElementById('login-password').value;
            }

            if (!pass || pass.length < 6) {
                showToast("Mot de passe/PIN invalide", "error");
                if(isPinMode) clearPin();
                return;
            }

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
                if(isPinMode) clearPin();
            }
        });

        // Initialisation de l'affichage des points du PIN
        updatePinDisplay();
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
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            let email = document.getElementById('login-email').value;
            if (!email) {
                showPromptModal("Mot de passe oublié", "Veuillez entrer l'adresse email associée à votre compte :", "email", async (val) => {
                    if (val) {
                        try { 
                            await sendPasswordResetEmail(auth, val); 
                            showToast("Email envoyé !", "success"); 
                        } catch (err) { showToast(err.message, "error"); } 
                    }
                });
            } else {
                try { 
                    sendPasswordResetEmail(auth, email).then(() => showToast("Email envoyé !", "success")).catch(err => showToast(err.message, "error")); 
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
                    
                    const desktopEmail = document.getElementById('desktop-user-email');
                    if(desktopEmail) desktopEmail.textContent = user.email;
                    const desktopRoleBadge = document.getElementById('desktop-user-role-badge');
                    if(desktopRoleBadge) {
                        desktopRoleBadge.textContent = "Super Admin";
                        desktopRoleBadge.className = 'text-[9px] font-extrabold uppercase tracking-widest mt-1.5 inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400';
                    }

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
                    
                    const desktopRoleBadge = document.getElementById('desktop-user-role-badge');
                    if (desktopRoleBadge) {
                        desktopRoleBadge.textContent = state.userRole === 'admin' ? 'Gérant' : 'Vendeur';
                        desktopRoleBadge.className = state.userRole === 'admin' ? 'text-[9px] font-extrabold uppercase tracking-widest mt-1.5 inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400' : 'text-[9px] font-extrabold uppercase tracking-widest mt-1.5 inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400';
                    }

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
                        ['dashboard', 'commandes', 'stock', 'fournisseurs', 'credits', 'charges', 'audit'].forEach(t => hideTab(t));
                        ['ventes', 'rapports'].forEach(t => showTab(t));
                        
                        // On renomme le tab rapports pour le vendeur
                        const rapportTab = document.querySelector(`.tab[onclick="switchTab('rapports')"]`);
                        if(rapportTab) {
                            const div = rapportTab.querySelector('div');
                            if(div) div.textContent = "Mes Ventes";
                            // On s'assure qu'il n'est pas caché sur mobile
                            rapportTab.classList.remove('secondary-tab');
                        }

                        switchTab('ventes'); // Le vendeur atterrit directement sur la caisse
                    } else { 
                        ['dashboard', 'ventes', 'commandes', 'stock', 'fournisseurs', 'credits', 'charges', 'rapports', 'audit'].forEach(t => showTab(t));
                        const rapportTabDiv = document.querySelector(`.tab[onclick="switchTab('rapports')"] div`);
                        if(rapportTabDiv) rapportTabDiv.textContent = "Bilans";
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

export function setupProfileManagement() {
    const desktopBtn = document.getElementById('desktop-profile-btn');
    const mobileBtn = document.getElementById('mobile-profile-btn');
    const modal = document.getElementById('profile-modal');
    const form = document.getElementById('form-profile');

    const openProfile = async () => {
        if (!state.currentBoutiqueId) return;
        modal.classList.remove('hidden');

        document.getElementById('profile-email').value = auth.currentUser?.email || '';
        const roleEl = document.getElementById('profile-role');
        roleEl.textContent = state.userRole === 'admin' ? 'Propriétaire / Gérant' : 'Vendeur';
        roleEl.className = state.userRole === 'admin' ? 'text-sm font-bold text-purple-600' : 'text-sm font-bold text-green-600';

        const adminSection = document.getElementById('profile-admin-section');
        const saveBtn = document.getElementById('profile-save-btn');

        if (state.userRole === 'admin') {
            adminSection.classList.remove('hidden');
            saveBtn.classList.remove('hidden');

            try {
                const shopDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId));
                if (shopDoc.exists()) {
                    const data = shopDoc.data();
                    document.getElementById('profile-shop-name').value = data.nom || '';
                    document.getElementById('profile-shop-phone').value = data.telephone || '';
                    document.getElementById('profile-shop-address').value = data.adresse || '';
                    document.getElementById('profile-shop-msg').value = data.messageTicket || '';
                    
                    const logoPreview = document.getElementById('profile-logo-preview');
                    if (data.logo) {
                        logoPreview.src = data.logo;
                        logoPreview.classList.remove('hidden');
                    } else {
                        logoPreview.src = '';
                        logoPreview.classList.add('hidden');
                    }
                }
            } catch(e) { console.error(e); }
        } else {
            adminSection.classList.add('hidden');
            saveBtn.classList.add('hidden');
        }
    };

    if (desktopBtn) desktopBtn.addEventListener('click', openProfile);
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            if(window.closeHamburgerMenu) window.closeHamburgerMenu();
            openProfile();
        });
    }

    // Gestion de la copie du lien du catalogue
    const copyCatalogBtn = document.getElementById('btn-copy-catalog');
    if (copyCatalogBtn) {
        copyCatalogBtn.addEventListener('click', () => {
            if (!state.currentBoutiqueId) return;
            const baseUrl = window.location.origin + window.location.pathname.replace(/app\.html|index\.html$/, '');
            const catalogUrl = `${baseUrl}catalogue.html?id=${state.currentBoutiqueId}`;
            
            navigator.clipboard.writeText(catalogUrl).then(() => {
                showToast("Lien du catalogue copié !", "success");
            }).catch(err => {
                showToast("Impossible de copier le lien.", "error");
            });
        });
    }

    const logoInput = document.getElementById('profile-logo-input');
    const logoPreview = document.getElementById('profile-logo-preview');
    let compressedLogo = null;

    if (logoInput) {
        logoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width; let height = img.height;
                    const maxSize = 400; // Format léger pour le logo
                    if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } 
                    else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    compressedLogo = canvas.toDataURL('image/jpeg', 0.8);
                    logoPreview.src = compressedLogo;
                    logoPreview.classList.remove('hidden');
                };
            };
            reader.readAsDataURL(file);
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (state.userRole !== 'admin') return;

            const saveBtn = document.getElementById('profile-save-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline"></i>...';

            try {
                const updateData = {
                    nom: document.getElementById('profile-shop-name').value.trim(),
                    telephone: document.getElementById('profile-shop-phone').value.trim(),
                    adresse: document.getElementById('profile-shop-address').value.trim(),
                    messageTicket: document.getElementById('profile-shop-msg').value.trim()
                };

                if (compressedLogo) {
                    showToast("Enregistrement du logo...", "info");
                    const fileName = `logos/${state.currentBoutiqueId}_${Date.now()}.jpg`;
                    const storageRef = ref(storage, fileName);
                    await uploadString(storageRef, compressedLogo, 'data_url');
                    updateData.logo = await getDownloadURL(storageRef);
                }

                await updateDoc(doc(db, "boutiques", state.currentBoutiqueId), updateData);
                
                // Mettre à jour le nom dans les accès utilisateurs si le nom a changé
                const userDocRef = doc(db, "users", state.userId);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    let shops = userData.allowedShops || [];
                    const shopIndex = shops.findIndex(s => s.id === state.currentBoutiqueId);
                    if(shopIndex !== -1) {
                        shops[shopIndex].name = updateData.nom;
                        await updateDoc(userDocRef, { allowedShops: shops });
                    }
                }

                showToast("Paramètres sauvegardés avec succès !", "success");
                modal.classList.add('hidden');
                compressedLogo = null;
            } catch(err) {
                console.error(err);
                showToast("Erreur lors de la sauvegarde", "error");
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Enregistrer';
            }
        });
    }
}
