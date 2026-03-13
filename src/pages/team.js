import { db, collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp, getFirestore } from '../firebase.js';
import { firebaseConfig, initializeApp, getAuth, createUserWithEmailAndPassword, signOut, deleteApp } from '../firebase.js';
import { showToast } from '../ui.js';
import * as state from '../state.js';

export function setupTeamManagement() {
    const btn = document.getElementById('drawer-team-btn');
    if (btn) {
        btn.addEventListener('click', openTeamModal);
    }

    const desktopBtn = document.getElementById('desktop-team-btn');
    if (desktopBtn) {
        desktopBtn.addEventListener('click', openTeamModal);
    }

    const form = document.getElementById('form-add-seller');
    if (form) {
        form.addEventListener('submit', handleAddSeller);
    }
}

async function openTeamModal() {
    if (window.closeHamburgerMenu) window.closeHamburgerMenu();
    const modal = document.getElementById('team-modal');
    modal.classList.remove('hidden');
    loadTeamList();
}

async function loadTeamList() {
    const list = document.getElementById('team-list');
    list.innerHTML = '<p class="text-center text-gray-500">Chargement...</p>';

    try {
        // Récupère les membres depuis la sous-collection de la boutique (Autorisé par les règles)
        const snap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "members"));
        
        let sellers = [];
        snap.forEach(d => {
            sellers.push({ id: d.id, ...d.data() });
        });

        if (sellers.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-gray-400 bg-gray-50 rounded-lg italic text-sm">Aucun vendeur associé.</div>';
        } else {
            list.innerHTML = sellers.map(s => `
                <div class="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50 transition">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs">
                            ${(s.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-sm text-gray-800">${s.email}</div>
                            <div class="text-[10px] uppercase font-bold text-gray-400">Vendeur</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        list.dataset.count = sellers.length;

    } catch (e) {
        console.error(e);
        list.innerHTML = '<p class="text-center text-red-500">Erreur de chargement.</p>';
    }
}

async function handleAddSeller(e) {
    e.preventDefault();
    const email = document.getElementById('seller-add-email').value;
    const pass = document.getElementById('seller-add-pass').value;
    const count = parseInt(document.getElementById('team-list').dataset.count || 0);

    if (pass.length < 6) return showToast("Mot de passe trop court (min 6).", "error");

    try {
        showToast("Vérification...", "info");
        const shopDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId));
        if (!shopDoc.exists()) return;
        
        const shopData = shopDoc.data();
        const statut = shopData.statut || 'essai';

        // RÈGLE : Le 2ème vendeur nécessite le statut 'actif'
        if (count >= 1 && statut !== 'actif') {
            showToast("Limite atteinte pour la version gratuite.", "warning");
            alert("Limite atteinte (1 vendeur gratuit).\n\nPour ajouter une deuxième vendeuse, votre boutique doit passer au statut 'Actif' (Paiement OK).");
            return;
        }

        showToast("Création du vendeur...", "info");

        // Utilisation d'une app secondaire pour ne pas déconnecter l'admin actuel
        const secApp = initializeApp(firebaseConfig, "AddSeller_" + Date.now());
        const secAuth = getAuth(secApp);
        const secDb = getFirestore(secApp); // Instance DB connectée au compte vendeur
        
        try {
            const cred = await createUserWithEmailAndPassword(secAuth, email, pass);
            
            // Utilisation de secDb pour écrire avec les droits du nouveau vendeur
            await setDoc(doc(secDb, "users", cred.user.uid), {
                email: email,
                role: 'seller', 
                shopIds: [state.currentBoutiqueId],
                allowedShops: [{ id: state.currentBoutiqueId, name: shopData.nom, role: 'seller' }],
                createdAt: serverTimestamp()
            });
            
            // Ajout aussi dans la sous-collection 'members' de la boutique pour l'affichage (via db principal)
            await setDoc(doc(db, "boutiques", state.currentBoutiqueId, "members", cred.user.uid), {
                email: email,
                role: 'seller',
                addedAt: serverTimestamp()
            });

            await signOut(secAuth);
            await deleteApp(secApp);

            showToast("Vendeur ajouté avec succès !", "success");
            document.getElementById('form-add-seller').reset();
            loadTeamList(); 

        } catch (err) {
            console.error(err);
            await deleteApp(secApp);
            if (err.code === 'auth/email-already-in-use') showToast("Cet email est déjà utilisé.", "error");
            else showToast("Erreur: " + err.message, "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Erreur système", "error");
    }
}