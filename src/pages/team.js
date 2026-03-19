import { db, collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp, getFirestore } from '../firebase.js';
import { firebaseConfig, initializeApp, getAuth, createUserWithEmailAndPassword, signOut, deleteApp } from '../firebase.js';
import { showToast, showConfirmModal } from '../ui.js';
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
                            <div class="w-8 h-8 rounded-full ${s.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'} flex items-center justify-center font-bold text-xs">
                            ${(s.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-sm text-gray-800">${s.email}</div>
                                <div class="text-[10px] uppercase font-bold ${s.role === 'admin' ? 'text-purple-500' : 'text-green-500'}">${s.role === 'admin' ? 'Gérant' : 'Vendeur'}</div>
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
    let email = document.getElementById('seller-add-email').value.trim();
    let pass = document.getElementById('seller-add-pass').value;
    let role = document.getElementById('seller-add-role')?.value || 'seller';
    const count = parseInt(document.getElementById('team-list').dataset.count || 0);

    if (!email.includes('@')) {
        email = email.replace(/\s+/g, '').toLowerCase() + "@maboutique.app";
    }

    if (pass.length < 4) return showToast("Mot de passe/PIN trop court (min 4).", "error");
    if (pass.length >= 4 && pass.length < 6) {
        pass = pass.padEnd(6, '0');
    }

    try {
        showToast("Vérification...", "info");
        const shopDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId));
        if (!shopDoc.exists()) return;
        
        const shopData = shopDoc.data();
        const statut = shopData.statut || 'essai';

        // RÈGLE : Le 2ème membre nécessite le statut 'actif'
        if (count >= 1 && statut !== 'actif') {
            showConfirmModal("Limite atteinte", "Vous avez atteint la limite (1 membre supplémentaire gratuit).\n\nPour ajouter un autre accès, votre boutique doit passer au statut 'Actif' (Paiement OK).", () => {});
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
                role: role, 
                password: pass, // AJOUT : Enregistrement du mot de passe pour l'admin
                shopIds: [state.currentBoutiqueId],
                allowedShops: [{ id: state.currentBoutiqueId, name: shopData.nom, role: role }],
                createdAt: serverTimestamp()
            });
            
            // Ajout aussi dans la sous-collection 'members' de la boutique pour l'affichage (via db principal)
            await setDoc(doc(db, "boutiques", state.currentBoutiqueId, "members", cred.user.uid), {
                email: email,
                role: role,
                addedAt: serverTimestamp()
            });

            await signOut(secAuth);
            await deleteApp(secApp);

            showToast("Accès ajouté avec succès !", "success");
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