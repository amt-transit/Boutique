// ════════════════════════════════════════════════════════════════
//  aiAssistant.js — Assistant intelligent "Ma Boutique"
//  Base : moteur de score par sujet + mémoire contexte
//  Réponses calquées sur l'interface réelle (app.html)
//  100% gratuit, zéro API externe
// ════════════════════════════════════════════════════════════════

export function setupAIAssistant() {

    // ── Éléments DOM ─────────────────────────────────────────────
    const aiBtn      = document.getElementById('ai-assistant-btn');
    const aiPanel    = document.getElementById('ai-assistant-panel');
    const aiCloseBtn = document.getElementById('ai-close-btn');
    const micBtn     = document.getElementById('ai-mic-btn');
    const micPulse   = document.getElementById('ai-mic-pulse');
    const statusText = document.getElementById('ai-status-text');
    const chatBox    = document.getElementById('ai-chat-box');

    if (!aiBtn || !aiPanel) return;

    // ── État ─────────────────────────────────────────────────────
    let lastTopic        = null;
    let isListening      = false;
    let hasShownWelcome  = false;

    // ── Ouvrir / Fermer ──────────────────────────────────────────
    aiBtn.addEventListener('click', () => {
        const opening = aiPanel.classList.contains('hidden');
        aiPanel.classList.toggle('hidden', !opening);
        aiPanel.classList.toggle('flex', opening);
        if (opening && !hasShownWelcome) {
            hasShownWelcome = true;
            // Vider le message statique HTML et afficher le welcome dynamique
            chatBox.innerHTML = '';
            addMsg("Bonjour ! 👋 Je suis votre assistant **Ma Boutique**.\n\nPosez-moi une question sur la gestion de votre boutique !", 'ai', 'salutation');
            showSuggestions(["Faire une vente", "Ajouter un produit", "Voir mes bénéfices", "Partager mon catalogue"]);
        }
    });

    aiCloseBtn?.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
        aiPanel.classList.remove('flex');
        stopSpeaking();
    });

    // ── Zone de saisie texte (injectée si absente) ────────────────
    if (!document.getElementById('ai-text-input')) {
        const bar = document.createElement('div');
        bar.className = "flex gap-2 px-3 pb-3 bg-white dark:bg-slate-800";
        bar.innerHTML = `
            <input id="ai-text-input" type="text" placeholder="Tapez votre question..."
                   class="flex-1 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                          rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400
                          dark:text-slate-200 placeholder-slate-400">
            <button id="ai-send-btn"
                    class="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-xl transition active:scale-95 flex-shrink-0"
                    title="Envoyer">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
                </svg>
            </button>`;
        // Insérer après le conteneur du micro
        const micContainer = micBtn?.closest('.p-3') || chatBox.nextSibling;
        aiPanel.appendChild(bar);
    }

    const textInput = document.getElementById('ai-text-input');
    const sendBtn   = document.getElementById('ai-send-btn');

    sendBtn?.addEventListener('click', sendText);
    textInput?.addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });

    function sendText() {
        const v = textInput?.value.trim();
        if (!v) return;
        textInput.value = '';
        handleInput(v);
    }

    // ── Reconnaissance vocale ─────────────────────────────────────
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        if (statusText) statusText.textContent = "Utilisez la saisie texte ↓";
        if (micBtn) { micBtn.disabled = true; micBtn.classList.add('opacity-40', 'cursor-not-allowed'); }
    } else {
        const rec = new SR();
        rec.lang = 'fr-FR';
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        micBtn?.addEventListener('click', () => {
            if (isListening) rec.stop();
            else { stopSpeaking(); try { rec.start(); } catch(e) {} }
        });

        rec.onstart  = () => { isListening = true;  micPulse?.classList.remove('hidden'); if(statusText) statusText.textContent = "Je vous écoute..."; };
        rec.onspeechend = () => rec.stop();
        rec.onend    = () => { isListening = false; micPulse?.classList.add('hidden'); if(statusText) statusText.textContent = "Micro ou texte ↓"; };
        rec.onresult = e => handleInput(e.results[0][0].transcript);
        rec.onerror  = e => {
            isListening = false; micPulse?.classList.add('hidden');
            if (e.error === 'not-allowed') addMsg("⚠️ Accès au micro refusé. Utilisez la saisie texte.", 'ai');
        };
    }

    // ── Point d'entrée unique ────────────────────────────────────
    function handleInput(text) {
        chatBox.querySelectorAll('.ai-sugg').forEach(el => el.remove());
        addMsg(text, 'user');
        if (statusText) statusText.textContent = "Je réfléchis...";

        setTimeout(() => {
            const { response, topic, suggestions } = getResponse(text, lastTopic);
            lastTopic = topic;
            addMsg(response, 'ai', topic);
            if (suggestions?.length) showSuggestions(suggestions);
            speak(response);
            if (statusText) statusText.textContent = "Micro ou texte ↓";
        }, 350 + Math.random() * 200);
    }

    // ── Affichage des bulles ─────────────────────────────────────
    function addMsg(text, sender, topic = null) {
        const d = document.createElement('div');
        const time = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});

        if (sender === 'user') {
            d.className = "flex flex-col items-end gap-0.5 mb-2";
            d.innerHTML = `
                <div class="bg-purple-600 text-white px-3 py-2 rounded-2xl rounded-tr-sm shadow-sm max-w-[88%] text-xs font-medium leading-relaxed">
                    ${esc(text)}
                </div>
                <span class="text-[10px] text-slate-400">${time}</span>`;
        } else {
            d.className = "flex flex-col items-start gap-0.5 mb-2";
            d.innerHTML = `
                <div class="flex items-start gap-1.5">
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-xs mt-0.5">${topicIcon(topic)}</div>
                    <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2 rounded-2xl rounded-tl-sm shadow-sm max-w-[88%] text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                        ${fmt(text)}
                    </div>
                </div>
                <span class="text-[10px] text-slate-400 pl-8">${time}</span>`;
        }
        chatBox.appendChild(d);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ── Suggestions cliquables ───────────────────────────────────
    function showSuggestions(list) {
        const w = document.createElement('div');
        w.className = "ai-sugg flex flex-wrap gap-1.5 px-2 pb-2";
        list.forEach(s => {
            const b = document.createElement('button');
            b.className = "text-[10px] bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/60 " +
                          "text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 " +
                          "px-2.5 py-1 rounded-full transition font-bold active:scale-95";
            b.textContent = s;
            b.addEventListener('click', () => { w.remove(); handleInput(s); });
            w.appendChild(b);
        });
        chatBox.appendChild(w);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ── Formatage & utilitaires ──────────────────────────────────
    function fmt(t) {
        return t
            .replace(/\n\n/g, '</p><p class="mt-1.5">')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>')
            .replace(/→ /g, '<span class="text-purple-500 font-bold">→</span> ');
    }
    function esc(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function topicIcon(t) {
        const m = { vente:'🛒', stock:'📦', credit:'👥', depense:'💸', commande:'📋',
                    fournisseur:'🚚', bilan:'📊', catalogue:'🌐', equipe:'👤', audit:'🔍',
                    code_barre:'📷', mode_sombre:'🌙', connexion:'🔐', remise:'🏷️',
                    monnaie:'💰', variante:'🎨', pwa:'📲', pdf:'📄', recherche:'🔎',
                    salutation:'👋', merci:'😊', default:'🤖' };
        return m[t] || m.default;
    }

    // ── Synthèse vocale ──────────────────────────────────────────
    function speak(text) {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        const clean = text.replace(/<[^>]*>/g,'').replace(/\*\*/g,'').substring(0, 180);
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'fr-FR'; u.rate = 1.05; u.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const fr = voices.find(v => v.lang.startsWith('fr') && v.localService);
        if (fr) u.voice = fr;
        window.speechSynthesis.speak(u);
    }
    function stopSpeaking() { window.speechSynthesis?.cancel(); }

    // ════════════════════════════════════════════════════════════
    //  MOTEUR DE RÉPONSES — calé sur l'interface réelle app.html
    // ════════════════════════════════════════════════════════════
    function getResponse(query, prevTopic) {

        const N = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        const q = N(query);
        const sub  = words => words.some(w => q.includes(N(w)));
        const cnt  = words => words.filter(w => q.includes(N(w))).length;
        const isQ  = sub(['comment','ou','quand','quoi','combien','puis-je','peut-on','?','faire']);
        const isNeg = sub(['pas','bug','erreur','marche pas','probleme','impossible','ne fonctionne']);
        const isSuite = sub(['et aussi','encore','autre','et pour','et si','et les']);

        // ── Scores par sujet ────────────────────────────────────
        const S = {
            salutation : cnt(['bonjour','bonsoir','salut','coucou','hello','bonne journee']),
            merci      : cnt(['merci','super','parfait','genial','excellent','top','bravo']),
            aide       : cnt(['aide','aider','apprendre','commencer','debut','fonctionnalite','que faire','quoi faire']),

            vente      : cnt(['vente','vendre','encaisser','caisse','panier','ticket','vendu','facturer','transaction']),
            remise     : cnt(['remise','reduction','promo','promotion','discount','moins cher','rabais','solde']),
            monnaie    : cnt(['monnaie','fond caisse','fond de caisse','monnaie du matin','caisse initiale','liquide caisse']),
            mobile_money: cnt(['wave','orange','mtn','moov','mobile money','momo','paiement electronique','transfert']),
            credit     : cnt(['credit','dette','doit','impaye','rembourser','remboursement','ardoise','pret','avance client']),
            commande   : cnt(['commande','reserver','reservation','livraison','livrer','livreur','en route','preparation','expedier','en attente']),

            stock      : cnt(['stock','produit','article','marchandise','inventaire','quantite','nouveau produit','ajouter produit','creer produit']),
            prix       : cnt(['prix','tarif','changer prix','modifier prix','augmenter','diminuer','promo','cout']),
            variante   : cnt(['variante','taille','couleur','pointure','modele','declinaison','version','tailles']),
            rupture    : cnt(['rupture','epuise','fini','manque','stock faible','plus de stock','alerte','reapprovisionner']),
            perte      : cnt(['perte','perime','casse','vole','manquant','disparu','detruit','gaspille','signaler']),
            code_barre : cnt(['code barre','scanner','scan','etiquette','imprimer etiquette','qr','flasher','lire code']),

            depense    : cnt(['depense','charge','facture','loyer','electricite','eau','transport','cie','sodeci','sortie argent','frais','salaire']),
            bilan      : cnt(['benefice','bilan','rapport','chiffre','gagne','recette','statistique','point','journee','combien gagne','argent gagne']),
            capital    : cnt(['fond de depart','capital','caisse initiale','mise de fond','investi','investissement','fonds','depart']),
            pdf        : cnt(['pdf','exporter','imprimer rapport','telecharger rapport','exporter bilan']),

            fournisseur: cnt(['fournisseur','grossiste','approvisionnement','approvisionner','achat marchandise','ravitaillement']),
            catalogue  : cnt(['catalogue','vitrine','boutique en ligne','lien','partager','internet','site','vente en ligne','commander en ligne','client commande']),
            equipe     : cnt(['vendeur','employe','gerant','equipe','acces','compte employe','collaborateur','ajouter personne','creer compte','role']),
            audit      : cnt(['audit','journal','historique','trace','qui a','mouvement','verifier','annule','supprime','surveiller']),
            recherche  : cnt(['rechercher','chercher','trouver','retrouver','barre recherche','search']),
            mode_sombre: cnt(['mode sombre','dark mode','theme','nuit','couleur ecran','affichage','luminosite']),
            pwa        : cnt(['installer appli','installer','icone','ecran accueil','pwa','telecharger appli','app']),
            connexion  : cnt(['connexion','connecter','mot de passe','oublie','reinitialiser','deconnecter','compte','email','sortir']),
        };

        // Bonus contexte
        if (prevTopic && S[prevTopic] > 0) S[prevTopic] += 1.5;
        if (isSuite && prevTopic) S[prevTopic] += 2;

        const best = Object.entries(S).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])[0]?.[0];

        // ── Base de connaissances calée sur app.html ─────────────
        const KB = {

            salutation: {
                r: "Bonjour ! 👋 Ravi de vous retrouver.\n\nSur quoi puis-je vous aider aujourd'hui ?",
                s: ["Faire une vente", "Ajouter un produit", "Mes bénéfices", "Partager mon catalogue"]
            },

            merci: {
                r: "Avec plaisir ! 😊 Je suis là si vous avez d'autres questions.",
                s: ["Autre chose ?", "Voir mes bénéfices", "Faire une vente"]
            },

            aide: {
                r: "Voici ce que je connais sur **Ma Boutique** :\n\n→ **Vente** : encaisser, Mobile Money, crédit, remise\n→ **Stock** : produits, variantes, étiquettes, pertes\n→ **Clients & Crédits** : dettes, remboursements\n→ **Dépenses** : charges, factures\n→ **Bilan** : bénéfices, export PDF\n→ **Commandes** : livraisons, statuts\n→ **Catalogue** : boutique en ligne, lien WhatsApp\n→ **Équipe** : vendeurs, accès",
                s: ["Faire une vente", "Gérer mon stock", "Voir mes bénéfices", "Ajouter un vendeur"]
            },

            // ── VENTE ──────────────────────────────────────────
            vente: {
                r: "Pour **encaisser une vente** :\n\n→ Allez dans l'onglet **Vente** (icône panier)\n→ Touchez ou scannez les articles pour les ajouter\n→ Appuyez sur le grand bouton vert **ENCAISSER**\n\n✅ La vente est enregistrée et le stock mis à jour automatiquement.",
                s: ["Paiement Mobile Money", "Crédit client", "Ajouter une remise", "Envoyer la facture WhatsApp"]
            },

            remise: {
                r: "Pour appliquer une **remise** sur une vente :\n\n→ Dans l'onglet **Vente**, ajoutez vos articles au panier\n→ En bas du panier, cliquez sur le bouton **🏷️ Ajouter Remise**\n→ Entrez le montant à déduire\n→ La remise apparaît en rouge dans le total\n\n✅ Le montant final est automatiquement recalculé.",
                s: ["Faire une vente", "Mobile Money", "Crédit client"]
            },

            monnaie: {
                r: "La **monnaie du matin** (fond de caisse) :\n\n→ Dans l'onglet **Vente**, en haut à droite vous voyez la section **Monnaie du matin**\n→ Entrez le montant d'argent présent dans la caisse en début de journée\n→ Cliquez sur l'icône 💾 pour sauvegarder\n\n→ En bas, le champ **Argent dans la caisse ce soir** se calcule automatiquement (monnaie + ventes - dépenses).",
                s: ["Faire une vente", "Enregistrer une dépense", "Voir mes bénéfices"]
            },

            mobile_money: {
                r: "Pour un **paiement Mobile Money** (Wave, Orange Money, MTN, Moov) :\n\n→ Ajoutez les articles dans l'onglet **Vente**\n→ Appuyez sur le bouton **📱 Mobile Money** (en vert/turquoise)\n→ Sélectionnez l'opérateur et entrez le numéro du client\n→ Confirmez\n\n✅ La vente est enregistrée avec le mode de paiement mobile.",
                s: ["Paiement en espèces", "Crédit client", "Faire une vente"]
            },

            credit: {
                r: "Pour une **vente à crédit** :\n\n→ Ajoutez les articles dans **Vente**\n→ Appuyez sur **Crédit Client** (bouton orange)\n→ Sélectionnez ou créez le client\n\nPour voir les dettes → onglet **Clients & Crédits**\nPour enregistrer un remboursement → cliquez sur le client → **Encaisser**\n\n⚠️ Toujours noter les crédits pour ne rien oublier !",
                s: ["Faire une vente", "Voir les dettes", "Ajouter un client"]
            },

            commande: {
                r: "Pour gérer les **commandes** :\n\n→ Dans **Vente**, remplissez le panier puis cliquez **Mettre en Commande (Réservation)**\n→ Allez dans l'onglet **Commandes** pour voir toutes les commandes\n→ Filtrez par statut : **Nouvelles / En préparation / En route**\n→ Cliquez sur une commande pour changer son statut ou contacter le client\n\n✅ Les commandes passées via votre catalogue en ligne apparaissent aussi ici.",
                s: ["Partager mon catalogue", "Gérer une livraison", "Créer une commande"]
            },

            // ── STOCK ──────────────────────────────────────────
            stock: {
                r: "Pour **gérer votre stock** :\n\n→ Allez dans l'onglet **Stock** (icône boîte)\n→ Bouton **Nouveau Produit** → remplissez nom, prix achat, prix vente\n→ Pour modifier un produit existant : cliquez dessus dans la liste\n→ Vous pouvez ajouter une **photo** et des **variantes** (tailles/couleurs)\n\n✅ Le stock se met à jour automatiquement à chaque vente.",
                s: ["Modifier un prix", "Ajouter des variantes", "Produit épuisé", "Imprimer des étiquettes"]
            },

            prix: {
                r: "Pour **changer le prix** d'un produit :\n\n→ Allez dans **Stock**\n→ Cliquez sur le produit dans la liste\n→ Modifiez le **prix de vente** et/ou le **prix d'achat**\n→ Sauvegardez\n\n✅ Le nouveau prix s'applique immédiatement aux prochaines ventes.",
                s: ["Ajouter un produit", "Gérer les variantes", "Faire une vente"]
            },

            variante: {
                r: "Pour les **variantes de produits** (tailles, couleurs, pointures) :\n\n→ Dans **Stock** → **Nouveau Produit**\n→ Cochez la case **\"Ce produit possède des variantes\"**\n→ Ajoutez chaque variante avec son nom (ex: 'Taille 42 Rouge'), son code-barre (optionnel) et sa quantité\n→ Cliquez sur **+ Ajouter Ligne** pour chaque variante supplémentaire\n\n✅ Chaque variante a son propre stock.",
                s: ["Ajouter un produit", "Modifier un prix", "Gérer mon stock"]
            },

            rupture: {
                r: "Pour gérer les **ruptures de stock** :\n\n→ Le **Dashboard** affiche les alertes de stock faible en rouge\n→ Cliquez sur la carte **Stock Faible** pour voir la liste\n→ Dans **Stock**, les produits épuisés sont marqués\n→ Pour réapprovisionner : cliquez sur le produit → entrez la quantité reçue\n\n💡 Pensez à contacter votre fournisseur !",
                s: ["Ajouter du stock", "Contacter un fournisseur", "Voir le tableau de bord"]
            },

            perte: {
                r: "Pour **signaler une perte** (périmé, cassé, volé) :\n\n→ Allez dans **Stock**\n→ Cliquez sur le produit concerné\n→ Choisissez **Signaler Produits Périmés / Cassés**\n→ Entrez la quantité perdue\n\n⚠️ La perte est déduite du stock et enregistrée dans le Journal pour traçabilité.",
                s: ["Voir le journal", "Gérer mon stock", "Voir mes bénéfices"]
            },

            code_barre: {
                r: "Pour les **codes-barres et étiquettes** :\n\n→ **Scanner un article** : dans Vente ou Stock, appuyez sur l'icône caméra 📷\n→ **Attribuer un code** : dans Stock, modifiez un produit → champ 'Code Barre'\n→ **Imprimer des étiquettes** : dans Stock → bouton **Imprimer Étiquettes** (en gris)\n→ Sélectionnez les produits et générez les étiquettes avec code-barres EAN-13\n\n✅ Compatible avec tous les scanners Bluetooth.",
                s: ["Ajouter un produit", "Faire une vente", "Gérer mon stock"]
            },

            // ── FINANCES ───────────────────────────────────────
            depense: {
                r: "Pour enregistrer une **dépense** (loyer, électricité CIE, SODECI, transport...) :\n\n→ Allez dans l'onglet **Dépenses** (icône flèches)\n→ Entrez le **motif** (ex: Facture CIE octobre)\n→ Entrez le **montant**\n→ Appuyez sur **Ajouter**\n\n✅ La dépense est déduite automatiquement de vos bénéfices dans le Bilan.",
                s: ["Voir mon bilan", "Caisse initiale", "Enregistrer une vente"]
            },

            bilan: {
                r: "Pour voir vos **bénéfices** :\n\n→ Allez dans l'onglet **Bilan** (icône graphiques)\n→ Vous verrez : Total Entrées, Total Sorties, **Solde Final**\n→ Filtrez par date avec les champs **Du... Au...**\n→ En haut du Dashboard, les KPI affichent aussi un résumé rapide\n\n💡 Bénéfice = Ventes encaissées − Dépenses − Pertes",
                s: ["Enregistrer une dépense", "Caisse de départ", "Exporter en PDF"]
            },

            capital: {
                r: "Pour enregistrer votre **caisse initiale** (fonds de départ) :\n\n→ Allez dans l'onglet **Bilan**\n→ Cherchez la section **Caisse Initiale** en haut\n→ Entrez votre montant de départ\n→ Cliquez sur l'icône 💾 pour sauvegarder\n\n✅ Ce montant sert de base pour calculer vos bénéfices réels.\n\n💡 Différent de la 'Monnaie du matin' dans Vente, qui représente l'argent physique dans le tiroir.",
                s: ["Voir mon bilan", "Enregistrer une dépense", "Monnaie du matin"]
            },

            pdf: {
                r: "Pour **exporter le bilan en PDF** :\n\n→ Allez dans l'onglet **Bilan**\n→ Choisissez la période avec les filtres de date\n→ Cliquez sur le bouton rouge **PDF** (icône téléchargement)\n→ Le rapport PDF est généré et téléchargé\n\n✅ Idéal pour partager un bilan avec votre comptable.",
                s: ["Voir mon bilan", "Filtrer par date", "Enregistrer une dépense"]
            },

            // ── AUTRES ─────────────────────────────────────────
            fournisseur: {
                r: "Pour gérer vos **fournisseurs** :\n\n→ Allez dans l'onglet **Fournisseurs** (accessible via le menu ☰ sur mobile)\n→ Ajoutez leur nom, numéro de téléphone, email et spécialité\n→ Bouton **WhatsApp** pour les contacter en un clic\n\n💡 Gardez vos fournisseurs à jour pour réapprovisionner rapidement !",
                s: ["Produit épuisé", "Ajouter du stock", "Gérer mon stock"]
            },

            catalogue: {
                r: "Pour **partager votre boutique en ligne** :\n\n→ Ouvrez votre **Profil** (icône ⚙️ en bas à gauche sur PC, ou menu ☰ sur mobile)\n→ Dans la section **'Boutique en ligne'**, cliquez sur **Copier** (bouton violet)\n→ Envoyez ce lien à vos clients par WhatsApp, Facebook, SMS !\n\n→ Vos clients voient vos produits et passent commande directement\n→ Les commandes reçues apparaissent dans l'onglet **Commandes**\n\n✅ Aucune installation requise pour vos clients.",
                s: ["Gérer mes commandes", "Ajouter des produits", "Voir les commandes reçues"]
            },

            equipe: {
                r: "Pour **gérer votre équipe** (vendeurs, gérants) :\n\n→ Vous devez être le **Propriétaire** du compte\n→ Sur **PC** : bouton **Équipe** dans la barre de navigation\n→ Sur **mobile** : menu ☰ → **Gestion Équipe**\n→ Créez un compte avec email + mot de passe\n→ Choisissez le rôle : **Vendeur** (accès Vente seulement) ou **Gérant** (accès complet sauf Admin)\n\n⚠️ Chaque employé a son propre accès sécurisé et tracé.",
                s: ["Supprimer un vendeur", "Changer le mot de passe", "Voir le journal d'audit"]
            },

            audit: {
                r: "L'onglet **Journal** (accessible via le menu ☰ sur mobile) enregistre tout :\n\n→ Chaque vente avec l'heure et le vendeur\n→ Les modifications de prix ou de stock\n→ Les suppressions et corrections\n→ Les connexions des employés\n→ Les dépenses enregistrées\n\n💡 Utilisez-le pour vérifier une erreur ou surveiller une anomalie.",
                s: ["Voir les ventes", "Surveiller l'équipe", "Gérer les dépenses"]
            },

            recherche: {
                r: "La **barre de recherche rapide** :\n\n→ Elle est en haut de l'application (icône loupe 🔍)\n→ Tapez le nom d'un **produit** ou d'un **client** pour le retrouver instantanément\n→ Fonctionne sur toutes les pages\n\n💡 Pratique pour retrouver rapidement un article pendant une vente.",
                s: ["Faire une vente", "Gérer mon stock", "Voir mes clients"]
            },

            mode_sombre: {
                r: "Pour activer le **Mode Sombre** :\n\n→ Sur **mobile** : menu ☰ → bouton **Mode sombre**\n→ Sur **PC** : cliquez sur l'icône 🌙 dans le panneau de navigation à gauche\n\n✅ L'application mémorise votre choix automatiquement.\n\n💡 Le mode sombre est plus reposant pour les yeux la nuit.",
                s: ["Aide générale", "Installer l'application"]
            },

            pwa: {
                r: "Pour **installer l'application** sur votre téléphone :\n\n→ **Android (Chrome)** : menu ☰ → **Installer l'application** (ou bannière automatique)\n→ **iPhone/iPad (Safari)** : cliquez l'icône Partager ↑ → **Sur l'écran d'accueil**\n\n✅ Une fois installée, l'appli fonctionne comme une vraie application, même hors connexion pour les données déjà chargées !",
                s: ["Mode sombre", "Aide générale"]
            },

            connexion: {
                r: "Pour les **problèmes de connexion** :\n\n→ **Mot de passe oublié** : sur l'écran de connexion, cliquez **Oublié ?** puis entrez votre email\n→ **Se déconnecter** : menu ☰ → **Sortir** (bouton rouge)\n→ **Compte bloqué** : contactez votre administrateur ou le propriétaire du compte\n\n⚠️ Votre email est votre identifiant unique.",
                s: ["Ajouter un vendeur", "Réinitialiser le mot de passe", "Aide générale"]
            },
        };

        // ── Réponse de secours contextuelle ───────────────────────
        const fallback = {
            r: isNeg
                ? "Je vois qu'il y a un souci. 🤔 Pouvez-vous préciser :\n\n→ Sur quel **onglet** (Vente, Stock, Bilan...) ?\n→ Qu'est-ce que vous essayiez de faire ?\n\nJe ferai de mon mieux pour vous aider !"
                : "Je n'ai pas bien compris. Essayez avec des mots simples comme :\n→ **'Faire une vente'**\n→ **'Ajouter un produit'**\n→ **'Voir mes bénéfices'**",
            s: ["Faire une vente", "Gérer mon stock", "Voir mes bénéfices", "Partager mon catalogue"]
        };

        const found = best && KB[best] ? KB[best] : fallback;

        return {
            response: found.r,
            topic: best || 'default',
            suggestions: found.s || []
        };
    }
}