// src/aiAssistant.js
export function setupAIAssistant() {
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiPanel = document.getElementById('ai-assistant-panel');
    const aiCloseBtn = document.getElementById('ai-close-btn');
    const micBtn = document.getElementById('ai-mic-btn');
    const micPulse = document.getElementById('ai-mic-pulse');
    const statusText = document.getElementById('ai-status-text');
    const chatBox = document.getElementById('ai-chat-box');
    const aiInput = document.getElementById('ai-text-input');
    const aiSendBtn = document.getElementById('ai-send-btn');

    if (!aiBtn || !aiPanel) return;

    // Toggle panneau
    aiBtn.addEventListener('click', () => {
        aiPanel.classList.toggle('hidden');
        aiPanel.classList.toggle('flex');
        if (!aiPanel.classList.contains('hidden') && chatBox.children.length === 0) {
            addWelcomeMessage();
        }
    });
    aiCloseBtn.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
        aiPanel.classList.remove('flex');
        stopSpeaking();
    });

    // Envoi texte manuel
    if (aiSendBtn && aiInput) {
        aiSendBtn.addEventListener('click', () => {
            const text = aiInput.value.trim();
            if (text) {
                processUserInput(text);
                aiInput.value = '';
            }
        });
        aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                aiSendBtn.click();
            }
        });
    }

    // Vérifier la compatibilité du navigateur pour la voix
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (statusText) statusText.textContent = "Reconnaissance vocale non supportée";
        if (micBtn) {
            micBtn.disabled = true;
            micBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    } else {
        setupVoiceRecognition();
    }

    function setupVoiceRecognition() {
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
            if (micPulse) micPulse.classList.remove('hidden');
            if (statusText) statusText.textContent = "Je vous écoute...";
        };

        recognition.onspeechend = () => {
            recognition.stop();
        };

        recognition.onend = () => {
            isListening = false;
            if (micPulse) micPulse.classList.add('hidden');
            if (statusText) statusText.textContent = "Appuyez sur le micro pour parler...";
        };

        recognition.onresult = (event) => {
            const userSpeech = event.results[0][0].transcript;
            processUserInput(userSpeech);
        };

        recognition.onerror = (event) => {
            console.error('Erreur reconnaissance vocale:', event.error);
            if (statusText) statusText.textContent = "Erreur microphone, réessayez";
            isListening = false;
            if (micPulse) micPulse.classList.add('hidden');
            setTimeout(() => {
                if (statusText) statusText.textContent = "Appuyez sur le micro pour parler...";
            }, 2000);
        };
    }

    function addWelcomeMessage() {
        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = "bg-white dark:bg-slate-800 border dark:border-slate-700 p-3 rounded-xl rounded-tl-none shadow-sm mr-auto max-w-[85%] text-slate-700 dark:text-slate-200";
        welcomeMsg.innerHTML = `👋 Bonjour ! Je suis votre assistant virtuel.<br><br>
        Je peux vous aider avec :<br>
        • 📦 Gestion des produits et du stock<br>
        • 💰 Ventes et encaissements<br>
        • 👥 Clients et crédits<br>
        • 📊 Bilans et bénéfices<br>
        • 🔗 Catalogue en ligne<br>
        • 👨‍💼 Gestion de l'équipe<br>
        • 🏪 Fournisseurs<br>
        • 📜 Journal d'audit<br><br>
        <span class="text-blue-500">Posez-moi une question !</span>`;
        chatBox.appendChild(welcomeMsg);
    }

    async function processUserInput(text) {
        addMessageToChat(text, 'user');
        if (statusText) statusText.textContent = "Je réfléchis...";
        
        setTimeout(() => {
            const response = generateSmartResponse(text);
            addMessageToChat(response, 'ai');
            speak(response);
            if (statusText) statusText.textContent = "Appuyez sur le micro pour parler...";
        }, 500);
    }

    function addMessageToChat(text, sender) {
        const msgDiv = document.createElement('div');
        if (sender === 'user') {
            msgDiv.className = "bg-blue-100 dark:bg-blue-900/40 p-3 rounded-xl rounded-tr-none shadow-sm ml-auto max-w-[85%] text-slate-800 dark:text-blue-100";
            msgDiv.textContent = text;
        } else {
            msgDiv.className = "bg-white dark:bg-slate-800 border dark:border-slate-700 p-3 rounded-xl rounded-tl-none shadow-sm mr-auto max-w-[85%] text-slate-700 dark:text-slate-200";
            msgDiv.innerHTML = text.replace(/\n/g, '<br>');
        }
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function speak(text) {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ''));
        utterance.lang = 'fr-FR';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeaking() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    // ============= MOTEUR DE RÉPONSES AMÉLIORÉ =============
    function generateSmartResponse(query) {
        const q = normalizeText(query);
        
        // Détection multi-mots
        const containsAny = (words) => words.some(w => q.includes(normalizeText(w)));
        const containsAll = (words) => words.every(w => q.includes(normalizeText(w)));
        
        // ========== 1. SALUTATIONS ==========
        if (containsAny(['bonjour', 'salut', 'coucou', 'hello', 'hey', 'yo', 'bjr'])) {
            const greetings = [
                "Bonjour ! 👋 Comment puis-je vous aider aujourd'hui ?",
                "Salut ! Prêt à gérer votre boutique ?",
                "Bonjour ! Que puis-je faire pour vous ?",
                "Coucou ! Besoin d'aide pour quelque chose ?"
            ];
            return greetings[Math.floor(Math.random() * greetings.length)];
        }
        
        if (containsAny(['merci', 'thanks', 'merci beaucoup', 'cimer', 'gracias'])) {
            return "Avec plaisir ! 😊 N'hésitez pas si vous avez d'autres questions.";
        }
        
        // ========== 2. VENTES ET CAISSE ==========
        if (containsAny(['vente', 'encaisser', 'caisse', 'panier', 'ajouter au panier', 'facture', 'ticket', 'paiement', 'monnaie'])) {
            if (containsAny(['comment', 'faire', 'procédure', 'etapes', 'procedure'])) {
                return "📦 **Pour effectuer une vente :**\n\n1️⃣ Allez dans l'onglet **Vente** (Caisse)\n2️⃣ Recherchez ou scannez un produit\n3️⃣ Ajustez la quantité si besoin\n4️⃣ Cliquez sur **ENCAISSER**\n5️⃣ Choisissez le mode de paiement : Espèces, Mobile Money, ou Crédit Client\n\n💡 *Astuce : vous pouvez modifier le prix à la volée en cliquant sur le montant dans le panier.*";
            }
            return "Pour vendre, allez dans l'onglet **Vente** (Caisse). Scannez ou cherchez un produit, ajustez la quantité, puis cliquez sur le bouton vert **ENCAISSER**. Vous pourrez choisir entre Espèces, Mobile Money ou Crédit Client. Simple et rapide ! 💰";
        }
        
        // ========== 3. FONDS DE CAISSE (MONNAIE DU MATIN) ==========
        if (containsAny(['fonds', 'caisse initiale', 'monnaie du matin', 'fonds de caisse', 'argent de depart', 'capital'])) {
            return "💰 **Fonds de caisse / Monnaie du matin :**\n\nDans l'onglet **Vente**, vous verrez une section bleue en haut à droite du panier avec le libellé 'Monnaie du matin'. Entrez le montant d'argent que vous mettez dans la caisse pour démarrer la journée, puis cliquez sur l'icône de sauvegarde. Ce montant servira de base pour calculer le solde théorique de fin de journée. 📊";
        }
        
        // ========== 4. STOCK ET PRODUITS ==========
        if (containsAny(['stock', 'produit', 'article', 'marchandise', 'inventaire', 'quantite', 'rupture', 'code barre', 'etiquette'])) {
            if (containsAny(['ajouter', 'nouveau', 'creer', 'entrer'])) {
                return "🆕 **Ajouter un produit :**\n\n• Rendez-vous dans l'onglet **Stock**\n• Cliquez sur **Nouveau Produit**\n• Remplissez les informations (nom, prix, catégorie, description, photo)\n• Pour les variantes (tailles, couleurs), cochez la case \"Ce produit possède des variantes\"\n• Validez\n\n💡 *Vous pouvez aussi scanner un code-barres pour l'associer au produit.*";
            }
            if (containsAny(['modifier', 'changer', 'mettre à jour', 'corriger'])) {
                return "✏️ **Modifier un produit :**\n\n• Allez dans l'onglet **Stock**\n• Cliquez sur le produit dans la liste\n• Modifiez le prix, la quantité, la catégorie, la description ou la photo\n• Pour signaler une perte (cassé/périmé), utilisez la zone rouge \"Zone de Perte\"\n• Enregistrez les modifications";
            }
            if (containsAny(['bas', 'faible', 'alerte', 'manque', 'epuise'])) {
                return "⚠️ **Gestion des stocks faibles :**\n\nL'application vous alerte automatiquement quand un produit atteint un seuil critique (moins de 5 unités). Vous pouvez consulter la liste dans le Dashboard en cliquant sur la carte \"Stock Faible\", ou dans l'onglet Stock en triant par \"Stock Faible\".";
            }
            return "📦 **Gestion du stock :**\n\nToute votre marchandise se trouve dans l'onglet **Stock**. Vous pouvez :\n• Ajouter des produits avec photo et description\n• Modifier prix et quantités\n• Gérer les variantes (tailles, couleurs)\n• Signaler des pertes (cassés, périmés)\n• Imprimer des étiquettes avec code-barres\n• Importer des produits en masse via CSV\n\nBesoin d'aide sur une action spécifique ?";
        }
        
        // ========== 5. CATALOGUE EN LIGNE ==========
        if (containsAny(['catalogue', 'en ligne', 'internet', 'site web', 'vitrine', 'lien', 'partager', 'whatsapp', 'facebook', 'instagram', 'client'])) {
            if (containsAny(['copier', 'obtenir', 'avoir', 'récupérer', 'trouver', 'lien'])) {
                return "🔗 **Votre lien de catalogue :**\n\n1️⃣ Ouvrez votre profil en cliquant sur votre email (dans le menu de gauche sur PC, ou via le menu hamburger ☰ sur mobile)\n2️⃣ Dans la section **Boutique en ligne**, cliquez sur **Copier**\n3️⃣ Partagez ce lien par WhatsApp, SMS ou réseaux sociaux\n\n✨ *Vos clients peuvent voir vos produits et commander directement sans créer de compte !*";
            }
            return "🌐 **Catalogue en ligne :**\n\nChaque boutique a son propre lien de commande ! Vos clients peuvent voir vos produits, choisir leurs articles et passer commande en quelques clics. Retrouvez le lien dans votre profil → **Boutique en ligne** → **Copier**. Partagez-le et recevez des commandes directement !";
        }
        
        // ========== 6. CLIENTS ET CRÉDITS ==========
        if (containsAny(['client', 'credit', 'dette', 'impaye', 'remboursement', 'paiement', 'doit', 'solde', 'creance'])) {
            if (containsAny(['ajouter', 'nouveau', 'creer'])) {
                return "👤 **Ajouter un client :**\n\n• Allez dans l'onglet **Clients & Crédits**\n• Cliquez sur **Nouveau Client**\n• Saisissez son nom (obligatoire), téléphone et adresse\n• Validez\n\nLes clients peuvent ensuite acheter à crédit directement depuis la caisse.";
            }
            if (containsAny(['rembourser', 'encaisser', 'payer', 'régler', 'paiement'])) {
                return "💵 **Encaisser un remboursement :**\n\n• Allez dans l'onglet **Clients & Crédits**\n• Trouvez le client dans la liste\n• Cliquez sur **Payer**\n• Saisissez le montant reçu\n\n*Le solde de la dette se mettra automatiquement à jour et l'argent sera ajouté à votre caisse.*";
            }
            return "👥 **Gestion des clients :**\n\nL'onglet **Clients & Crédits** vous permet de :\n• Ajouter/modifier des clients\n• Voir qui vous doit de l'argent\n• Enregistrer les remboursements\n• Contacter les clients par WhatsApp directement depuis l'application\n• Consulter l'historique complet des transactions pour chaque client";
        }
        
        // ========== 7. DÉPENSES ET CHARGES ==========
        if (containsAny(['depense', 'charge', 'facture', 'sortie', 'cie', 'sodeci', 'loyer', 'transport', 'eau', 'electricite', 'nourriture', 'entree', 'injection'])) {
            if (containsAny(['ajouter', 'nouvelle', 'enregistrer', 'creer'])) {
                return "📝 **Enregistrer une dépense :**\n\n1️⃣ Allez dans l'onglet **Dépenses**\n2️⃣ Choisissez le type :\n   • 🔴 Dépense / Sortie (argent qui sort de la caisse)\n   • 🟢 Apport Externe (injection d'argent personnel)\n3️⃣ Remplissez le motif et le montant\n4️⃣ Sélectionnez la source (prise dans la caisse ou paiement externe)\n5️⃣ Cliquez sur **Ajouter**\n\nLa dépense sera automatiquement déduite (ou ajoutée) à vos bénéfices.";
            }
            return "💸 **Suivi des dépenses :**\n\nL'onglet **Dépenses** centralise toutes vos charges. Vous pouvez :\n• Ajouter des dépenses ponctuelles\n• Enregistrer des injections d'argent (apports personnels)\n• Rechercher par motif\n• Voir l'historique complet\n• Annuler une erreur (si vous êtes administrateur)\n\n*Les dépenses sont automatiquement déduites du bénéfice final.*";
        }
        
        // ========== 8. BILAN ET BÉNÉFICES ==========
        if (containsAny(['benefice', 'bilan', 'chiffre', 'argent', 'recette', 'gain', 'profit', 'resultat', 'performance', 'tresorerie'])) {
            if (containsAny(['caisse initiale', 'fonds', 'capital', 'investi', 'depart'])) {
                return "💰 **Capital de départ / Fonds investi :**\n\nPour enregistrer l'argent que vous avez investi au départ :\n1️⃣ Allez dans l'onglet **Bilan**\n2️⃣ En haut, dans la zone bleue, entrez le montant investi (fonds de caisse initial)\n3️⃣ Cliquez sur **Sauvegarder**\n\nCe montant sert de base pour calculer vos bénéfices réels et la trésorerie.";
            }
            if (containsAny(['total', 'global', 'ensemble', 'tout'])) {
                return "📊 **Vue d'ensemble de votre activité :**\n\nDans l'onglet **Bilan**, vous retrouvez :\n• **Fonds de départ** : votre investissement initial\n• **Total Entrées** : ventes + remboursements\n• **Total Sorties** : dépenses\n• **Trésorerie Réelle** : argent disponible\n• **Bénéfice Net** = Entrées - Sorties\n\nFiltrez par date pour analyser votre performance !";
            }
            return "📈 **Suivi financier :**\n\nL'onglet **Bilan** est votre tableau de bord financier :\n• Fonds de départ (capital investi)\n• Total des entrées (ventes, remboursements, apports)\n• Total des sorties (dépenses)\n• Trésorerie réelle (argent disponible)\n• Bénéfice net\n\nVous pouvez filtrer par période et exporter vos données en PDF ou CSV.";
        }
        
        // ========== 9. COMMANDES ==========
        if (containsAny(['commande', 'reservation', 'livraison', 'livrer', 'expedier', 'preparer', 'en cours', 'en attente'])) {
            if (containsAny(['statut', 'changer', 'modifier', 'mettre à jour', 'valider', 'livreur'])) {
                return "📦 **Gérer les commandes :**\n\n1️⃣ Allez dans l'onglet **Commandes**\n2️⃣ Les commandes sont classées par statut :\n   • **Nouvelles** (à traiter)\n   • **En préparation**\n   • **En route**\n3️⃣ Cliquez sur une commande pour :\n   • Changer son statut\n   • Assigner un livreur\n   • Valider le paiement\n   • Contacter le client";
            }
            return "📋 **Gestion des commandes :**\n\nL'onglet **Commandes** affiche toutes les commandes reçues via votre catalogue en ligne. Vous pouvez :\n• Voir les détails de chaque commande\n• Changer le statut (nouvelle → en préparation → en route → livrée)\n• Assigner un livreur avec son contact\n• Valider le paiement (espèces ou Mobile Money)\n• Contacter le client directement\n\n*Les commandes en attente sont réservées, le stock n'est pas encore déduit.*";
        }
        
        // ========== 10. FOURNISSEURS ==========
        if (containsAny(['fournisseur', 'grossiste', 'approvisionnement', 'achat', 'commander stock', 'reapprovisionner', 'contact'])) {
            return "🏪 **Gestion des fournisseurs :**\n\nL'onglet **Fournisseurs** vous permet de :\n• Ajouter/modifier vos fournisseurs\n• Enregistrer les coordonnées complètes (nom, contact, email, téléphone)\n• Les contacter directement via WhatsApp depuis l'application\n\nUtile pour organiser vos réapprovisionnements et garder tous vos contacts à portée de main !";
        }
        
        // ========== 11. ÉQUIPE ET UTILISATEURS ==========
        if (containsAny(['equipe', 'vendeur', 'employe', 'staff', 'collaborateur', 'acces', 'compte', 'utilisateur', 'gerant', 'admin'])) {
            if (containsAny(['ajouter', 'creer', 'nouveau', 'inviter'])) {
                return "👥 **Ajouter un employé :**\n\n1️⃣ Ouvrez le menu (en haut à droite sur PC, ou le menu hamburger ☰ sur mobile)\n2️⃣ Cliquez sur **Gestion Équipe**\n3️⃣ Remplissez :\n   • Le rôle (Gérant ou Vendeur)\n   • L'identifiant (pseudo ou email)\n   • Le mot de passe / code PIN\n4️⃣ Cliquez sur **Créer le compte**\n\n*Seul le propriétaire peut ajouter des membres.*";
            }
            if (containsAny(['role', 'difference', 'gérant', 'admin', 'vendeur'])) {
                return "👔 **Différence entre les rôles :**\n\n• **Gérant (Admin)** : accès complet à toutes les fonctionnalités (stock, finances, équipe, paramètres, bilans)\n• **Vendeur** : accès limité à la caisse, clients, et rapport de ses propres ventes uniquement\n\nCela permet de sécuriser vos données tout en laissant vos employés travailler efficacement.";
            }
            return "👨‍💼 **Gestion de l'équipe :**\n\nEn tant que propriétaire, vous pouvez ajouter des vendeurs ou gérants via le menu **Gestion Équipe** (accessible depuis le menu hamburger ☰ sur mobile ou en haut à droite sur PC). Chaque membre aura son propre compte avec des accès adaptés à son rôle. Idéal pour organiser votre boutique !";
        }
        
        // ========== 12. AUDIT ET HISTORIQUE ==========
        if (containsAny(['audit', 'journal', 'historique', 'trace', 'mouvement', 'qui a fait', 'supprime', 'annule', 'erreur', 'log'])) {
            return "📜 **Journal d'audit :**\n\nL'onglet **Journal** enregistre toutes les actions importantes :\n• Ventes réalisées\n• Dépenses ajoutées\n• Modifications de stock\n• Suppressions\n• Connexions\n• Ajouts de produits\n\nC'est l'outil idéal pour retrouver une opération, vérifier l'activité de votre équipe ou analyser l'historique complet de votre boutique !";
        }
        
        // ========== 13. CODES-BARRES ET ÉTIQUETTES ==========
        if (containsAny(['code barre', 'scanner', 'etiquette', 'imprimer', 'barcode', 'qr code', 'flash', 'scan'])) {
            return "📷 **Scanner et étiquettes :**\n\n• **Scanner** : utilisez l'icône 📷 dans les onglets Vente ou Stock pour ajouter des produits rapidement\n• **Étiquettes** : depuis l'onglet Stock, cliquez sur **Imprimer Étiquettes**, sélectionnez les produits et la quantité, puis générez vos étiquettes avec codes-barres\n\n*Idéal pour une gestion fluide et professionnelle !*";
        }
        
        // ========== 14. EXPORTATION ET IMPORTATION ==========
        if (containsAny(['exporter', 'importer', 'csv', 'excel', 'sauvegarder', 'backup', 'restaurer', 'export', 'import'])) {
            return "💾 **Import/Export de données :**\n\n• **Exporter** : dans l'onglet **Bilan**, vous trouverez des boutons pour exporter produits et ventes au format CSV\n• **Importer** : en mode Super Admin, vous pouvez importer en masse des produits, clients ou ventes depuis des fichiers CSV\n\n*Pratique pour la sauvegarde, la migration ou la mise à jour massive de votre catalogue !*";
        }
        
        // ========== 15. AIDE GÉNÉRALE ==========
        if (containsAny(['aide', 'help', 'assistance', 'tuto', 'tutoriel', 'guide', 'support', 'comment ca marche', 'fonctionne', 'commencer'])) {
            return "🆘 **Aide et assistance :**\n\nL'application est organisée en 11 onglets principaux :\n\n📊 **Accueil (Dashboard)** - Vue d'ensemble et KPIs\n💰 **Vente (Caisse)** - Encaissements et panier\n📋 **Commandes** - Gestion des commandes clients\n📦 **Stock** - Gestion des produits et inventaire\n🏪 **Fournisseurs** - Carnet d'adresses\n👥 **Clients & Crédits** - Dettes et remboursements\n💸 **Dépenses** - Charges et sorties\n📈 **Bilan** - Rapports financiers et bénéfices\n📜 **Journal** - Historique des actions\n\nPour plus d'aide, consultez le guide en cliquant sur \"Guide d'utilisation\" dans le menu.\n\nQue souhaitez-vous explorer ?";
        }
        
        // ========== 16. PROFIL ET PARAMÈTRES ==========
        if (containsAny(['profil', 'parametre', 'setting', 'configuration', 'boutique', 'modifier boutique', 'changer nom', 'logo'])) {
            return "⚙️ **Paramètres de la boutique :**\n\nPour modifier les informations de votre boutique :\n1️⃣ Cliquez sur votre email (dans le menu de gauche sur PC, ou dans le menu hamburger ☰ sur mobile)\n2️⃣ Une fenêtre s'ouvre avec :\n   • Les informations de votre compte\n   • Le lien de votre catalogue à copier\n   • Les paramètres de la boutique (nom, téléphone, adresse, logo, message promo)\n3️⃣ Modifiez les champs souhaités\n4️⃣ Cliquez sur **Enregistrer**\n\n*Les modifications sont appliquées immédiatement.*";
        }
        
        // ========== 17. RÉPONSE PAR DÉFAUT AVEC SUGGESTIONS ==========
        const suggestions = [
            "Je n'ai pas bien compris. Essayez avec ces mots-clés :\n\n• **vente** pour les encaissements\n• **produit** ou **stock** pour la gestion\n• **catalogue** pour le lien en ligne\n• **bilan** pour voir vos bénéfices\n• **client** pour les crédits\n• **commande** pour les livraisons\n• **fournisseur** pour le carnet d'adresses\n\nOu posez votre question différemment !",
            "Désolé, je n'ai pas saisi votre demande. Pourriez-vous reformuler ?\n\nQuelques exemples :\n• \"Comment ajouter un produit ?\"\n• \"Où voir mes bénéfices ?\"\n• \"Comment créer un compte vendeur ?\"\n• \"Comment imprimer des étiquettes ?\"\n• \"Comment partager mon catalogue ?\"",
            "Je ne connais pas encore cette fonctionnalité. Pouvez-vous me poser une question sur :\n• Les ventes et la caisse\n• Le stock et les produits\n• Les clients et crédits\n• Le catalogue en ligne\n• Les bilans financiers\n• Les commandes et livraisons ?"
        ];
        return suggestions[Math.floor(Math.random() * suggestions.length)];
    }
    
    // Fonction de normalisation du texte
    function normalizeText(str) {
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, '');
    }
}