// ===============================================
// SCRIPT 1: GESTION DES ONGLETS
// ===============================================

// IMPORTANT: Attaché à 'window' pour être accessible par les attributs 'onclick'
window.switchTab = function(tabName) {
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.add('hidden');
    });
    
    const page = document.getElementById(`page-${tabName}`);
    if (page) {
        page.classList.remove('hidden');
    }
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    window.location.hash = tabName;
}

// Gestion du hash URL au chargement
window.addEventListener('DOMContentLoaded', () => {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    const targetTab = document.querySelector(`.tab[onclick="switchTab('${hash}')"]`);
    if (targetTab) {
        targetTab.click();
    } else {
        // Fallback au dashboard
        const dashboardTab = document.querySelector(`.tab[onclick="switchTab('dashboard')"]`);
        if (dashboardTab) {
            dashboardTab.click();
        }
    }
});


// ===============================================
// SCRIPT 2: LOGIQUE FIREBASE (MODULE)
// ===============================================
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
    query,
    setLogLevel,
    deleteDoc,
    where,
    getDocs,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCluRVv-olQsTuZZBPjjJns1jHq0vkhjSw",
    authDomain: "maboutique-7891.firebaseapp.com",
    projectId: "maboutique-7891",
    storageBucket: "maboutique-7891.firebasestorage.app",
    messagingSenderId: "402820959115",
    appId: "1:402820959115:web:6fb6b2c78fc9c5fe203d8e"
};

// Variables globales
let db, auth, userId, appId;
let allProducts = [], allSales = [], saleCart = [], allExpenses = [], allClients = [], allCreditMovements = [];
let userRef, actionToConfirm = null, currentClientHistoryListener = null;
let currentBoutiqueId = null, userRole = null, isSuperAdmin = false;
let superAdminUserId = null; // NOUVEAU: Stocker l'ID du super admin

// Éléments DOM
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const topNavBar = document.getElementById('top-nav-bar');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('bottom-logout-btn');
// const adminModeBtn = document.getElementById('admin-mode-btn'); // Supprimé
const adminModal = document.getElementById('admin-modal');
const adminModalCloseBtn = document.getElementById('admin-modal-close-btn');
const createBoutiqueForm = document.getElementById('create-boutique-form');
const openAdminModalBtn = document.getElementById('open-admin-modal');
const adminTabBtn = document.getElementById('admin-tab-btn');
const adminBadge = document.getElementById('admin-badge');

// Toast (notification)
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// Helper function pour formater les prix
function formatPrice(price) {
    if (typeof price !== 'number') price = parseFloat(price) || 0;
    return price.toLocaleString('fr-FR') + ' CFA';
}

// Fonction pour récupérer les boutiques disponibles
async function getAvailableBoutiques() {
    try {
        const boutiquesRef = collection(db, "boutiques");
        const snapshot = await getDocs(boutiquesRef);
        const boutiques = [];
        
        snapshot.forEach(doc => {
            boutiques.push({ id: doc.id, ...doc.data() });
        });
        
        return boutiques;
    } catch (error) {
        console.error("Erreur lors de la récupération des boutiques:", error);
        return [];
    }
}

// Fonction pour mettre à jour le sélecteur de boutiques
async function updateBoutiqueSelector() {
    const boutiqueSelect = document.getElementById('login-boutique');
    // Vérification pour s'assurer que l'élément existe avant de continuer
    if (!boutiqueSelect) {
        console.log("Sélecteur de boutique non trouvé (peut-être en mode Super Admin).");
        return;
    }
    const boutiques = await getAvailableBoutiques();
    
    boutiqueSelect.innerHTML = '<option value="">Sélectionnez une boutique</option>';
    
    boutiques.forEach(boutique => {
        const option = document.createElement('option');
        option.value = boutique.id;
        option.textContent = boutique.nom;
        boutiqueSelect.appendChild(option);
    });
}

// Fonction pour créer une nouvelle boutique (SUPER ADMIN ONLY)
async function createNewBoutique(boutiqueData) {
    try {
        // Créer la boutique
        const boutiqueRef = doc(collection(db, "boutiques"));
        
        const createdById = superAdminUserId || "system"; // Fallback si non défini
        
        await setDoc(boutiqueRef, {
            nom: boutiqueData.nom,
            createdAt: serverTimestamp(),
            createdBy: createdById 
        });
        
        const boutiqueId = boutiqueRef.id;
        
        // Créer les comptes admin et vendeur
        const adminUserCredential = await createUserWithEmailAndPassword(auth, boutiqueData.adminEmail, boutiqueData.adminPassword);
        const adminUser = adminUserCredential.user;
        
        const sellerUserCredential = await createUserWithEmailAndPassword(auth, boutiqueData.sellerEmail, boutiqueData.sellerPassword);
        const sellerUser = sellerUserCredential.user;
        
        // Enregistrer les informations des utilisateurs
        const usersRef = collection(db, "users");
        
        await setDoc(doc(usersRef, adminUser.uid), {
            email: boutiqueData.adminEmail,
            role: 'admin',
            boutiqueId: boutiqueId,
            boutiqueName: boutiqueData.nom,
            createdAt: serverTimestamp()
        });
        
        await setDoc(doc(usersRef, sellerUser.uid), {
            email: boutiqueData.sellerEmail,
            role: 'seller',
            boutiqueId: boutiqueId,
            boutiqueName: boutiqueData.nom,
            createdAt: serverTimestamp()
        });
        
        return boutiqueId;
    } catch (error) {
        console.error("Erreur lors de la création de la boutique:", error);
        throw error;
    }
}

// Fonction pour vérifier si l'utilisateur est super admin
async function checkSuperAdmin(userId) {
    try {
        const superAdminDoc = await getDoc(doc(db, "super_admins", userId));
        return superAdminDoc.exists();
    } catch (error) {
        console.error("Erreur vérification super admin:", error);
        return false;
    }
}

// Fonction pour initialiser le super admin (à exécuter une seule fois)
async function initializeSuperAdmin() {
    const superAdminEmail = "jeanaffa@gmail.com"; // Remplacez par votre email
    const superAdminPassword = "VOTRE_MOT_DE_PASSE_SECURISE"; // Mettez votre mot de passe ici
    
    // Quitter si le mot de passe est vide pour éviter les erreurs
    if (!superAdminPassword || superAdminPassword === "VOTRE_MOT_DE_PASSE_SECURISE") {
        console.log("initializeSuperAdmin: Mot de passe non défini. Sortie.");
        return; 
    }

    try {
        // Vérifier si le super admin existe déjà
        const superAdminsRef = collection(db, "super_admins");
        const snapshot = await getDocs(superAdminsRef);
        
        if (snapshot.empty) {
            // Créer le compte super admin
            const userCredential = await createUserWithEmailAndPassword(auth, superAdminEmail, superAdminPassword);
            const user = userCredential.user;
            
            // Enregistrer comme super admin
            await setDoc(doc(db, "super_admins", user.uid), {
                email: superAdminEmail,
                createdAt: serverTimestamp()
            });
            
            console.log("Super admin créé avec succès");
            showToast("Super admin initialisé", "success");
        } else {
            console.log("Le Super Admin existe déjà.");
        }
    } catch (error) {
        console.error("Erreur initialisation super admin:", error);
        // Gérer l'erreur 'email-already-in-use' silencieusement
        if (error.code !== 'auth/email-already-in-use') {
             showToast(`Erreur Super Admin: ${error.message}`, "error");
        }
    }
}

// Fonction principale
async function main() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        appId = firebaseConfig.projectId;
        setLogLevel('error');

        // Mettez cette ligne en commentaire après la PREMIÈRE exécution réussie
        // await initializeSuperAdmin(); 

        setupLoginForm();
        setupAuthListener();
        setupAdminFeatures();
        
        updateBoutiqueSelector();
    } catch (error) {
        console.error("Erreur critique de Firebase.", error);
        showToast("Erreur critique de Firebase.", "error");
    }
}

// Gestion des fonctionnalités admin
function setupAdminFeatures() {

    // Gestion de la modale admin
    adminModalCloseBtn.addEventListener('click', () => {
        adminModal.classList.add('hidden');
    });

    openAdminModalBtn?.addEventListener('click', () => {
        adminModal.classList.remove('hidden');
        loadBoutiquesList();
    });

    // Formulaire création boutique
    createBoutiqueForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const boutiqueData = {
            nom: document.getElementById('new-boutique-name').value.trim(),
            adminEmail: document.getElementById('admin-email').value,
            adminPassword: document.getElementById('admin-password').value,
            sellerEmail: document.getElementById('seller-email').value,
            sellerPassword: document.getElementById('seller-password').value
        };
        
        if (!boutiqueData.nom || !boutiqueData.adminEmail || !boutiqueData.adminPassword || 
            !boutiqueData.sellerEmail || !boutiqueData.sellerPassword) {
            showToast("Tous les champs sont requis.", "error");
            return;
        }
        
        try {
            // S'assurer que superAdminUserId est défini
            if (!superAdminUserId) {
                 const user = auth.currentUser;
                 if (user && await checkSuperAdmin(user.uid)) {
                     superAdminUserId = user.uid;
                 } else {
                     showToast("Erreur: Non autorisé. Reconnectez-vous.", "error");
                     return;
                 }
            }

            await createNewBoutique(boutiqueData);
            showToast("Boutique créée avec succès !", "success");
            createBoutiqueForm.reset();
            updateBoutiqueSelector();
            loadBoutiquesList();
        } catch (error) {
            console.error("Erreur création boutique:", error);
            if (error.code === 'auth/email-already-in-use') {
                showToast("Erreur: Un compte avec cet email existe déjà.", "error");
            } else {
                showToast(`Erreur: ${error.message}`, "error");
            }
        }
    });
}

// Afficher l'interface super admin
function showSuperAdminInterface() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    topNavBar.classList.remove('hidden');
    
    isSuperAdmin = true;
    userRole = 'super_admin';
    
    // Mettre à jour l'ID Super Admin global
    superAdminUserId = auth.currentUser.uid;
    
    // Ajuster l'interface
    document.getElementById('dashboard-user-name').textContent = `(${auth.currentUser.email})`;
    adminBadge.textContent = "SUPER ADMIN"; // Mettre le texte correct
    adminBadge.classList.remove('hidden');
    adminTabBtn.classList.remove('hidden');
    
    // Cacher les onglets non pertinents pour le Super Admin
    document.querySelector('.tab[onclick="switchTab(\'dashboard\')"]').style.display = 'none';
    document.querySelector('.tab[onclick="switchTab(\'ventes\')"]').style.display = 'none';
    document.querySelector('.tab[onclick="switchTab(\'stock\')"]').style.display = 'none';
    document.querySelector('.tab[onclick="switchTab(\'caisse\')"]').style.display = 'none';
    document.querySelector('.tab[onclick="switchTab(\'credits\')"]').style.display = 'none';
    document.querySelector('.tab[onclick="switchTab(\'rapports\')"]').style.display = 'none';
    document.querySelector('.tab[onclick="switchTab(\'charges\')"]').style.display = 'none';

    // Afficher la page admin par défaut
    switchTab('admin');
    loadAdminStats();
    if (window.lucide) window.lucide.createIcons();
}

// Charger les statistiques admin
async function loadAdminStats() {
    const boutiques = await getAvailableBoutiques();
    const totalBoutiquesEl = document.getElementById('total-boutiques');
    if (totalBoutiquesEl) {
        totalBoutiquesEl.textContent = boutiques.length;
    }
}

// Charger la liste des boutiques pour l'admin
async function loadBoutiquesList() {
    const boutiques = await getAvailableBoutiques();
    const listContainer = document.getElementById('boutiques-list');
    const adminListContainer = document.getElementById('admin-boutiques-list');
    
    const boutiquesHTML = boutiques.map(boutique => `
        <div class="border border-gray-200 rounded-lg p-3">
            <div class="flex justify-between items-center">
                <div>
                    <h4 class="font-semibold text-gray-800">${boutique.nom}</h4>
                    <p class="text-sm text-gray-600">ID: ${boutique.id}</p>
                    <p class="text-xs text-gray-500">Créé le: ${boutique.createdAt?.toDate().toLocaleDateString('fr-FR') || 'N/A'}</p>
                </div>
                <button class="text-red-600 hover:text-red-800 delete-boutique-btn" data-id="${boutique.id}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    const listHTML = boutiques.length > 0 ? boutiquesHTML : '<p class="text-gray-500">Aucune boutique</p>';
    if (listContainer) listContainer.innerHTML = listHTML;
    if (adminListContainer) adminListContainer.innerHTML = listHTML;
    
    if (window.lucide) window.lucide.createIcons();
    
    // Gestion suppression boutiques
    document.querySelectorAll('.delete-boutique-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const boutiqueId = e.currentTarget.dataset.id;
            showConfirmModal(
                "Supprimer cette boutique ?",
                "Action irréversible. Supprimera la boutique. (La suppression des utilisateurs liés doit être faite manuellement).",
                async () => {
                    try {
                        // TODO: Ajouter la logique de suppression des utilisateurs liés
                        await deleteDoc(doc(db, "boutiques", boutiqueId));
                        showToast("Boutique supprimée", "success");
                        loadBoutiquesList();
                        loadAdminStats();
                        updateBoutiqueSelector(); // Mettre à jour la liste de connexion
                    } catch (error) {
                        console.error("Erreur suppression boutique:", error);
                        showToast("Erreur lors de la suppression", "error");
                    }
                }
            );
        });
    });
}

// Gestion du formulaire de connexion
function setupLoginForm() {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // On ne vérifie plus la boutique ici
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        try {
            // On tente simplement de se connecter. onAuthStateChanged fera le tri.
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Erreur de connexion:", error);
            showToast(`Email ou mot de passe incorrect.`, "error");
        }
    });
}

// Gestion de l'état de connexion
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            
            try {
                // 1. Vérifier si c'est un super admin
                const isSuperAdminUser = await checkSuperAdmin(userId);
                if (isSuperAdminUser) {
                    superAdminUserId = userId; 
                    showSuperAdminInterface(); // Affiche l'interface Super Admin
                    return;
                }

                // 2. Si ce n'est pas un Super Admin, vérifier si c'est un utilisateur normal
                const userDocRef = doc(db, "users", userId);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    
                    // 3. VÉRIFICATION DE SÉCURITÉ OBLIGATOIRE
                    const selectedBoutiqueId = document.getElementById('login-boutique').value;
                    if (userData.boutiqueId !== selectedBoutiqueId) {
                        showToast("Erreur : Vous n'êtes pas autorisé pour cette boutique.", "error");
                        await signOut(auth);
                        return;
                    }
                    
                    // Si tout est bon, on continue
                    userRole = userData.role;
                    currentBoutiqueId = userData.boutiqueId;
                    userRef = doc(db, "boutiques", currentBoutiqueId);
                    
                    document.getElementById('dashboard-user-name').textContent = 
                        `(${user.email} - ${userRole === 'admin' ? 'Administrateur' : 'Vendeur'})`;
                    
                    if (userRole === 'admin') {
                        adminBadge.textContent = "ADMIN";
                        adminBadge.classList.remove('hidden');
                        adminTabBtn.classList.remove('hidden');
                    } else {
                        adminBadge.classList.add('hidden');
                        adminTabBtn.classList.add('hidden');
                    }
                    
                    if (userRole === 'seller') {
                        document.querySelector('.tab[onclick="switchTab(\'dashboard\')"]').style.display = 'none';
                        if (window.location.hash === '#dashboard' || !window.location.hash) {
                            switchTab('ventes');
                        }
                    } else {
                        document.querySelector('.tab[onclick="switchTab(\'dashboard\')"]').style.display = 'flex';
                    }
                    
                    appContainer.classList.remove('hidden');
                    topNavBar.classList.remove('hidden');
                    authContainer.classList.add('hidden');
                    
                    initializeApplication();
                    
                } else {
                    // L'utilisateur est dans Auth mais pas dans Firestore (et n'est pas Super Admin)
                    showToast("Utilisateur non trouvé ou non autorisé.", "error");
                    await signOut(auth);
                }
            } catch (error) {
                console.error("Erreur chargement données utilisateur:", error);
                showToast("Erreur de chargement.", "error");
                await signOut(auth);
            }

        } else {
            // Utilisateur déconnecté
            appContainer.classList.add('hidden');
            topNavBar.classList.add('hidden');
            authContainer.classList.remove('hidden');
            
            document.getElementById('dashboard-user-name').textContent = '';
            adminBadge.classList.add('hidden');
            adminTabBtn.classList.add('hidden'); // Cacher l'onglet admin
            
            // Réinitialiser données
            allProducts = []; allSales = []; allClients = []; allExpenses = []; 
            saleCart = []; allCreditMovements = []; currentBoutiqueId = null; userRole = null;
            superAdminUserId = null; 
            isSuperAdmin = false;

            // Réafficher tous les onglets (pour la prochaine connexion)
            document.querySelectorAll('.tab').forEach(tab => tab.style.display = 'flex');
        }
    });
}

// Initialisation de l'application (POUR LES UTILISATEURS NORMAUX)
function initializeApplication() {
    // NOTE: C'est ici que vous devez remettre vos fonctions
    // setupStockManagement(), setupSalesPage(), setupReportsPage(), 
    // setupExpensesPage(), setupCreditsPage(), setupCashManagement() etc.
    
    // Pour l'instant, c'est vide, c'est pourquoi les pages sont vides
    console.log(`Initialisation de l'application pour la boutique: ${currentBoutiqueId}`);
    
    if (window.lucide) window.lucide.createIcons();
    showToast("Application connectée et prête !", "success");
}
 
// Gestion de la déconnexion
function setupLogout() {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            showToast("Vous avez été déconnecté.", "success");
        } catch (error) {
            console.error("Erreur de déconnexion:", error);
            showToast(`Erreur: ${error.message}`, "error");
        }
    });
}

// MODALE DE CONFIRMATION
function setupModalListeners() {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('modal-cancel-btn').addEventListener('click', hideConfirmModal);
    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
        if (typeof actionToConfirm === 'function') actionToConfirm();
        hideConfirmModal();
    });
}

function showConfirmModal(title, message, onConfirm) {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-text').textContent = message;
    actionToConfirm = onConfirm;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function hideConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    actionToConfirm = null;
}

// Démarrage
main();
setupModalListeners();
setupLogout();