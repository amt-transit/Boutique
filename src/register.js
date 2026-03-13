import { auth, db, createUserWithEmailAndPassword, doc, setDoc, serverTimestamp, collection, deleteUser } from './firebase.js';
import { showToast } from './ui.js';

export function setupRegisterForm() {
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');

    // Toggle entre Connexion et Inscription
    if (showRegisterLink && showLoginLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            authTitle.textContent = "Créer un compte";
            authSubtitle.textContent = "90 jours d'essai gratuit, sans engagement.";
        });

        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            authTitle.textContent = "Ma Boutique";
            authSubtitle.textContent = "Connectez-vous à votre espace";
        });
    }

    // Gestion de l'affichage des mots de passe
    const setupToggle = (toggleId, inputId) => {
        const btn = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => {
                const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
                input.setAttribute('type', type);
                btn.innerHTML = type === 'password' ? '<i data-lucide="eye" class="w-4 h-4"></i>' : '<i data-lucide="eye-off" class="w-4 h-4"></i>';
                if (window.lucide) window.lucide.createIcons();
            });
        }
    };
    setupToggle('toggle-reg-pass', 'reg-password');
    setupToggle('toggle-reg-confirm-pass', 'reg-confirm-password');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-shop-name').value;
            const email = document.getElementById('reg-email').value;
            const pass = document.getElementById('reg-password').value;
            const confirmPass = document.getElementById('reg-confirm-password').value;

            if (pass.length < 6) {
                showToast("Le mot de passe doit faire au moins 6 caractères", "error");
                return;
            }
            if (pass !== confirmPass) {
                showToast("Les mots de passe ne correspondent pas", "error");
                return;
            }

            // AFFICHER LE LOADER
            const loader = document.getElementById('creation-loader');
            if(loader) {
                loader.classList.remove('hidden');
                if(window.lucide) window.lucide.createIcons(); // Force le rendu des icônes engrenages
            }

            let newUser = null;

            try {
                
                // 1. Créer l'utilisateur Auth
                const cred = await createUserWithEmailAndPassword(auth, email, pass);
                newUser = cred.user; // On garde une référence à l'utilisateur créé
                const uid = cred.user.uid;

                // 2. Calculer la date d'expiration (90 jours)
                const expireDate = new Date();
                expireDate.setDate(expireDate.getDate() + 90);

                // 3. Créer la boutique
                const shopRef = doc(collection(db, "boutiques"));
                await setDoc(shopRef, { nom: name, createdAt: serverTimestamp(), createdBy: uid, statut: 'essai', expireAt: expireDate });

                // 4. Créer le profil utilisateur lié
                await setDoc(doc(db, "users", uid), { 
                    email: email, 
                    password: pass, // AJOUT : Enregistrement du mot de passe
                    role: 'admin', 
                    allowedShops: [{id: shopRef.id, name: name, role: 'admin'}], 
                    shopIds: [shopRef.id] 
                });

                showToast("Bienvenue ! Votre essai de 90 jours commence.", "success");
                
                if(loader) loader.classList.add('hidden');
                // La redirection est automatique via onAuthStateChanged dans auth.js
            } catch (err) {
                if(loader) loader.classList.add('hidden');
                console.error(err);
                
                // ROLLBACK : Si l'utilisateur a été créé mais que la suite a échoué (erreur Firestore, réseau...),
                // on le supprime immédiatement pour libérer l'email.
                if (newUser) {
                    try { await deleteUser(newUser); } catch (e) { console.error("Échec du nettoyage utilisateur:", e); }
                }

                if (err.code === 'auth/email-already-in-use') {
                    showToast("Cette adresse email est déjà utilisée.", "error");
                } else if (err.code === 'permission-denied') {
                    showToast("Erreur de permissions (Règles Firestore).", "error");
                } else {
                    showToast("Erreur: " + err.message, "error");
                }
            }
        });
    }
}