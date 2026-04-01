export function setupAIAssistant() {
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiPanel = document.getElementById('ai-assistant-panel');
    const aiCloseBtn = document.getElementById('ai-close-btn');
    const micBtn = document.getElementById('ai-mic-btn');
    const micPulse = document.getElementById('ai-mic-pulse');
    const statusText = document.getElementById('ai-status-text');
    const chatBox = document.getElementById('ai-chat-box');

    if (!aiBtn || !aiPanel) return;

    // Toggle panneau
    aiBtn.addEventListener('click', () => {
        aiPanel.classList.toggle('hidden');
        aiPanel.classList.toggle('flex');
    });
    aiCloseBtn.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
        aiPanel.classList.remove('flex');
        stopSpeaking();
    });

    // Vérifier la compatibilité du navigateur
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        statusText.textContent = "Reconnaissance vocale non supportée sur ce navigateur.";
        micBtn.disabled = true;
        micBtn.classList.add('opacity-50', 'cursor-not-allowed');
        aiBtn.style.display = 'none'; // Cacher le bouton si non supporté (ex: iOS WebKit)
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let isListening = false;

    micBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            stopSpeaking();
            recognition.start();
        }
    });

    recognition.onstart = () => {
        isListening = true;
        micPulse.classList.remove('hidden');
        statusText.textContent = "Je vous écoute...";
    };

    recognition.onspeechend = () => {
        recognition.stop();
    };

    recognition.onend = () => {
        isListening = false;
        micPulse.classList.add('hidden');
        statusText.textContent = "Appuyez sur le micro pour parler...";
    };

    recognition.onresult = (event) => {
        const userSpeech = event.results[0][0].transcript;
        addMessageToChat(userSpeech, 'user');
        
        statusText.textContent = "Je réfléchis...";
        setTimeout(() => {
            const response = generateAIResponse(userSpeech);
            addMessageToChat(response, 'ai');
            speak(response);
            statusText.textContent = "Appuyez sur le micro pour parler...";
        }, 600); // Petit délai pour simuler la réflexion
    };

    function addMessageToChat(text, sender) {
        const msgDiv = document.createElement('div');
        if (sender === 'user') {
            msgDiv.className = "bg-blue-100 dark:bg-blue-900/40 p-3 rounded-xl rounded-tr-none shadow-sm ml-auto max-w-[85%] text-slate-800 dark:text-blue-100";
            msgDiv.textContent = text;
        } else {
            msgDiv.className = "bg-white dark:bg-slate-800 border dark:border-slate-700 p-3 rounded-xl rounded-tl-none shadow-sm mr-auto max-w-[85%] text-slate-700 dark:text-slate-200";
            msgDiv.innerHTML = text.replace(/\n/g, '<br>'); // Remplace les retours à la ligne par des balises HTML
        }
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight; // Scroll en bas
    }

    function speak(text) {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, '')); // Enlève le HTML pour la voix
        utterance.lang = 'fr-FR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeaking() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    // Moteur de règles (Intelligence de l'Assistant)
    function generateAIResponse(query) {
        // Normalisation : retire les majuscules et les accents pour une meilleure détection
        const normalize = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const q = normalize(query);
        
        // Fonctions d'aide
        const hasWord = (wordsArray) => wordsArray.some(word => q.includes(normalize(word)));
        const hasAll = (arrays) => arrays.every(arr => hasWord(arr));

        // 1. Politesse & Salutations
        if (hasWord(['bonjour', 'salut', 'coucou', 'bonsoir'])) {
            return "Bonjour ! Comment puis-je vous aider avec votre boutique aujourd'hui ?";
        }
        if (hasWord(['merci'])) {
            return "Je vous en prie ! N'hésitez pas si vous avez d'autres questions.";
        }
        
        // 2. Vente & Caisse
        if (hasWord(['vendre', 'vente', 'encaisser', 'facturer', 'vendu', 'caisse', 'panier'])) {
            return "Pour faire une vente, rendez-vous dans l'onglet 'Vente'. Touchez les articles pour les ajouter au panier, puis appuyez sur le bouton vert 'Encaisser' en bas. Vous pourrez choisir un paiement en espèces ou Mobile Money.";
        }

        // 3. Stock & Produits
        if (hasAll([['ajouter', 'nouveau', 'creer', 'entrer', 'modifier', 'changer', 'supprimer'], ['produit', 'article', 'marchandise', 'stock', 'inventaire', 'quantite', 'prix']])) {
            return "La gestion de la marchandise se fait dans l'onglet 'Stock'. Cliquez sur 'Nouveau Produit' pour l'ajouter, ou touchez un produit existant dans la liste pour modifier son prix, sa quantité, ou signaler une perte.";
        }
        
        // 4. Catalogue en ligne & Partage
        if (hasWord(['catalogue', 'en ligne', 'internet', 'lien', 'partager', 'whatsapp', 'site', 'vitrine'])) {
            return "Pour partager votre boutique sur internet, ouvrez le menu, allez dans 'Profil & Boutique', puis cliquez sur 'Copier' dans la section Boutique en ligne. Vous pourrez envoyer ce lien à vos clients par WhatsApp.";
        }

        // 5. Clients & Crédits (Dettes)
        if (hasWord(['credit', 'dette', 'doit', 'impaye', 'rembourser', 'remboursement', 'client', 'pret', 'emprunt'])) {
            return "Gérez vos clients et leurs dettes dans l'onglet 'Clients & Crédits'. Vous pouvez y voir qui vous doit de l'argent et enregistrer leurs remboursements en cliquant sur 'Encaisser'.";
        }

        // 6. Dépenses & Charges
        if (hasWord(['depense', 'charge', 'facture', 'sortie', 'cie', 'sodeci', 'loyer', 'transport', 'nourriture', 'manger', 'perdu'])) {
            return "Pour enregistrer une dépense (comme le transport ou une facture), allez dans l'onglet 'Dépenses'. Remplissez le motif et le montant pour que cela soit déduit automatiquement de vos bénéfices.";
        }

        // 7. Commandes & Livraisons
        if (hasWord(['commande', 'reserver', 'reservation', 'livraison', 'livrer', 'livreur', 'en route', 'preparation', 'expedier'])) {
            return "Les commandes passées par vos clients en ligne s'affichent dans l'onglet 'Commandes'. Vous pouvez changer leur statut (En préparation, En route) et assigner un livreur.";
        }

        // 8. Fournisseurs
        if (hasWord(['fournisseur', 'grossiste', 'approvisionnement', 'acheter', 'achat'])) {
            return "Le répertoire de vos fournisseurs se trouve dans l'onglet 'Fournisseurs'. Vous pouvez y enregistrer leurs numéros et les contacter rapidement sur WhatsApp.";
        }

        // 9. Bilan & Bénéfices
        if (hasWord(['benefice', 'rapport', 'bilan', 'chiffre', 'gagne', 'point', 'rentable', 'statistique', 'argent', 'recette'])) {
            return "Pour faire votre point financier, allez dans l'onglet 'Bilan'. Vous y verrez vos bénéfices réels, vos dépenses, et l'argent liquide qui doit normalement se trouver dans votre caisse aujourd'hui.";
        }

        // 9b. Fonds de départ & Capital
        if (hasWord(['fond', 'fonds', 'depart', 'investi', 'investissement', 'capital', 'caisse initiale'])) {
            return "Pour enregistrer votre fonds de départ investi ou votre caisse initiale, rendez-vous dans l'onglet 'Bilan'. Vous y trouverez une section dédiée en haut de la page pour entrer et sauvegarder votre capital de départ.";
        }

        // 10. Codes-barres & Étiquettes
        if (hasWord(['code', 'barre', 'scanner', 'etiquette', 'imprimer', 'imprimante', 'ticket', 'recu'])) {
            return "L'application gère les codes-barres ! Vous pouvez scanner un article avec votre caméra dans les onglets Vente ou Stock. Vous pouvez aussi imprimer des étiquettes avec code-barres depuis l'onglet Stock.";
        }

        // 11. Équipe & Utilisateurs
        if (hasWord(['equipe', 'vendeur', 'gerant', 'employe', 'acces', 'compte', 'utilisateur', 'ajouter quelqu']) || hasAll([['ajouter', 'creer'], ['vendeur', 'employe', 'personne']])) {
            return "Pour ajouter un vendeur ou un gérant, vous devez être le Propriétaire. Ouvrez le menu de navigation (ou regardez en haut à droite sur ordinateur) et cliquez sur l'option 'Gestion Équipe' ou 'Équipe'. Vous pourrez y créer un accès sécurisé avec mot de passe pour vos employés.";
        }

        // 12. Audit & Historique
        if (hasWord(['audit', 'journal', 'historique', 'trace', 'mouvement', 'erreur', 'supprime', 'qui a'])) {
            return "L'onglet 'Journal' enregistre absolument toutes les traces de votre boutique. C'est idéal pour vérifier une erreur, retrouver une vente annulée ou surveiller une dépense suspecte.";
        }

        return "Je n'ai pas bien compris. Essayez de formuler votre question avec des mots simples comme : 'Comment faire une vente', 'Où voir mes bénéfices' ou 'Ajouter un produit'.";
    }
}