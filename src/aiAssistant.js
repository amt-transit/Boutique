// ════════════════════════════════════════════════════════════════
//  aiAssistant.js — Assistant intelligent "Ma Boutique" V2
//  Moteur de score par sujet + mémoire contexte + Interface riche
// ════════════════════════════════════════════════════════════════

export function setupAIAssistant() {
    // ── Éléments DOM ─────────────────────────────────────────────
    const aiBtn = document.getElementById('ai-assistant-btn');
    const aiPanel = document.getElementById('ai-assistant-panel');
    const aiCloseBtn = document.getElementById('ai-close-btn');
    const micBtn = document.getElementById('ai-mic-btn');
    const micPulse = document.getElementById('ai-mic-pulse');
    const statusText = document.getElementById('ai-status-text');
    const chatBox = document.getElementById('ai-chat-box');

    if (!aiBtn || !aiPanel) return;

    // ── État ─────────────────────────────────────────────────────
    let lastTopic = null;
    let isListening = false;
    let hasShownWelcome = false;

    // ── Ouvrir / Fermer ──────────────────────────────────────────
    aiBtn.addEventListener('click', () => {
        const opening = aiPanel.classList.contains('hidden');
        aiPanel.classList.toggle('hidden', !opening);
        aiPanel.classList.toggle('flex', opening);
        
        if (opening && !hasShownWelcome) {
            hasShownWelcome = true;
            chatBox.innerHTML = '';
            
            // NOUVEAU : Salutation selon l'heure
            const hour = new Date().getHours();
            let greeting = "Bonjour";
            if (hour >= 18) greeting = "Bonsoir";
            else if (hour < 5) greeting = "Bonne nuit... ou plutôt bon courage pour cette heure tardive";
            
            addMsg(`${greeting} ! 👋 Je suis votre assistant virtuel **Ma Boutique**.\n\nPosez-moi une question ou choisissez une option ci-dessous !`, 'ai', 'salutation');
            showSuggestions(["Faire une vente", "Ajouter un produit", "Voir mes bénéfices", "Partager mon catalogue"]);
        }
    });

    aiCloseBtn.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
        aiPanel.classList.remove('flex');
        stopSpeaking();
    });

    // ── Zone de saisie texte (Injectée dynamiquement) ────────────
    if (!document.getElementById('ai-text-input')) {
        const bar = document.createElement('div');
        bar.className = "flex gap-2 px-3 pb-3 bg-white dark:bg-slate-800";
        bar.innerHTML = `
            <input id="ai-text-input" type="text" placeholder="Tapez votre question..."
                   class="flex-1 text-xs bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                          rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-purple-400
                          dark:text-slate-200 placeholder-slate-400" autocomplete="off">
            <button id="ai-send-btn"
                    class="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-xl transition active:scale-95 flex-shrink-0 shadow-sm"
                    title="Envoyer">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
                </svg>
            </button>`;
        aiPanel.appendChild(bar);
    }

    const textInput = document.getElementById('ai-text-input');
    const sendBtn = document.getElementById('ai-send-btn');

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
    if (!SpeechRecognition) {
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

        rec.onstart = () => { isListening = true; micPulse?.classList.remove('hidden'); if(statusText) statusText.textContent = "Je vous écoute..."; };
        rec.onspeechend = () => rec.stop();
        rec.onend = () => { isListening = false; micPulse?.classList.add('hidden'); if(statusText) statusText.textContent = "Micro ou texte ↓"; };
        rec.onresult = e => handleInput(e.results[0][0].transcript);
        rec.onerror = e => {
            isListening = false; micPulse?.classList.add('hidden');
            if (e.error === 'not-allowed') addMsg("⚠️ Accès au micro refusé. Utilisez le texte.", 'ai');
        };
    }

    // ── Point d'entrée de traitement ─────────────────────────────
    function handleInput(text) {
        chatBox.querySelectorAll('.ai-sugg').forEach(el => el.remove());
        addMsg(text, 'user');
        if (statusText) statusText.textContent = "Je réfléchis...";
        
        // NOUVEAU : Ajouter l'indicateur de frappe
        const typingId = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.id = typingId;
        typingDiv.className = "flex items-start gap-2 mb-3 animate-fade-in-up";
        typingDiv.innerHTML = `
            <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-xs mt-0.5 shadow-sm">🤖</div>
            <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-4 py-3.5 rounded-2xl rounded-tl-sm shadow-sm flex gap-1">
                <div class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0s"></div>
                <div class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0.15s"></div>
                <div class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style="animation-delay: 0.3s"></div>
            </div>`;
        chatBox.appendChild(typingDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        
        setTimeout(() => {
            // NOUVEAU : Supprimer l'indicateur de frappe avant d'afficher la réponse
            document.getElementById(typingId)?.remove();

            const { response, topic, suggestions, action } = getSmartResponse(text, lastTopic);
            lastTopic = topic;
            addMsg(response, 'ai', topic, action);
            if (suggestions?.length) showSuggestions(suggestions);
            speak(response);
            if (statusText) statusText.textContent = "Micro ou texte ↓";
        }, 800 + Math.random() * 600); // Délai réaliste de réflexion
    }

    // ── Affichage UI ──────────────────────────────────────────────
    function addMsg(text, sender, topic = null, action = null) {
        const d = document.createElement('div');
        const time = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});

        if (sender === 'user') {
            d.className = "flex flex-col items-end gap-0.5 mb-3 animate-fade-in-up";
            d.innerHTML = `
                <div class="bg-purple-600 text-white px-3 py-2 rounded-2xl rounded-tr-sm shadow-sm max-w-[88%] text-xs font-medium leading-relaxed">
                    ${escapeHtml(text)}
                </div>
                <span class="text-[9px] text-slate-400 font-medium">${time}</span>`;
        } else {
            // NOUVEAU : Bouton d'action magique (Pilote automatique)
            let actionBtnHtml = '';
            if (action) {
                actionBtnHtml = `<button onclick="window.switchTab('${action}'); document.getElementById('ai-close-btn').click();" class="mt-3 bg-purple-100 hover:bg-purple-200 text-purple-700 w-full py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-2 transition active:scale-95"><i data-lucide="external-link" class="w-3 h-3"></i> Y aller maintenant !</button>`;
            }

            d.className = "flex flex-col items-start gap-0.5 mb-3 animate-fade-in-up";
            d.innerHTML = `
                <div class="flex items-start gap-2">
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-xs mt-0.5 shadow-sm">${getTopicIcon(topic)}</div>
                    <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2.5 rounded-2xl rounded-tl-sm shadow-sm max-w-[88%] text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                        <div>${formatText(text)}</div>
                        ${actionBtnHtml}
                    </div>
                </div>
                <span class="text-[9px] text-slate-400 font-medium pl-8">${time}</span>`;
                
            // Recharger les icônes si Lucide est présent
            setTimeout(() => { if(window.lucide) lucide.createIcons(); }, 10);
        }
        chatBox.appendChild(d);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function showSuggestions(list) {
        const w = document.createElement('div');
        w.className = "ai-sugg flex flex-wrap gap-1.5 pl-8 pb-3 animate-fade-in-up";
        list.forEach(s => {
            const b = document.createElement('button');
            b.className = "text-[10px] bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/30 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 px-3 py-1.5 rounded-full transition font-bold active:scale-95";
            b.textContent = s;
            b.addEventListener('click', () => { w.remove(); handleInput(s); });
            w.appendChild(b);
        });
        chatBox.appendChild(w);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ── Utilitaires ───────────────────────────────────────────────
    function formatText(t) {
        return t.replace(/\n\n/g, '</p><p class="mt-1.5">')
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100 font-extrabold">$1</strong>')
                .replace(/→ /g, '<span class="text-purple-500 font-bold">→</span> ');
    }
    
    function escapeHtml(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    
    function getTopicIcon(t) {
        const icons = { vente:'🛒', stock:'📦', credit:'👥', depense:'💸', commande:'📋', fournisseur:'🚚', bilan:'📊', catalogue:'🌐', equipe:'👤', audit:'🔍', code_barre:'📷', mode_sombre:'🌙', connexion:'🔐', remise:'🏷️', monnaie:'💰', variante:'🎨', pwa:'📲', pdf:'📄', recherche:'🔎', salutation:'👋', merci:'✨', erreur:'🤔', default:'🤖' };
        return icons[t] || icons.default;
    }

    function speak(text) {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        
        // Nettoyage extrême pour une voix naturelle et professionnelle
        const clean = text
            .replace(/<[^>]*>/g, '') // Enlève le HTML
            .replace(/\*\*/g, '')    // Enlève le gras Markdown
            .replace(/[→↑↓←]/g, '')  // 🛑 SUPPRIME LES FLÈCHES
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '') // 🛑 SUPPRIME LES ÉMOJIS
            .replace(/\n/g, '. ')    // Remplace les sauts de ligne par de vraies pauses vocales
            .substring(0, 250);      // Légèrement allongé pour ne pas couper au milieu d'une phrase
            
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'fr-FR'; 
        u.rate = 1.05; 
        u.pitch = 1.0;
        
        const frVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr') && v.localService);
        if (frVoice) u.voice = frVoice;
        
        window.speechSynthesis.speak(u);
    }

    function stopSpeaking() { window.speechSynthesis?.cancel(); }

    // ════════════════════════════════════════════════════════════
    //  MOTEUR DE RÉPONSES AVANCÉ — Score + Mémoire + Actions
    // ════════════════════════════════════════════════════════════
    function getSmartResponse(query, prevTopic) {
        const nQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        
        const hasWord = words => words.some(w => nQuery.includes(w));
        const countWords = words => words.filter(w => nQuery.includes(w)).length;
        const isNegative = hasWord(['pas', 'bug', 'erreur', 'marche pas', 'probleme', 'impossible']);
        const isFollowUp = hasWord(['et aussi', 'encore', 'autre', 'et pour', 'et si']);

        // ── Système de Scores par Intention ──
        const scores = {
            salutation: countWords(['bonjour', 'salut', 'coucou', 'hello', 'hey', 'bjr', 'i ni ce', 'aw ni ce', 'inice', 'awnice', 'anice']),
            merci: countWords(['merci', 'super', 'parfait', 'genial', 'top', 'cimer', 'barika', 'a barika', 'djarabi']),
            aide: countWords(['aide', 'aider', 'apprendre', 'debut', 'fonction', 'comment', 'marche', 'deme']),

            vente: countWords(['vente', 'vendre', 'encaisser', 'caisse', 'panier', 'ticket', 'facture', 'paiement', 'feere', 'fere']),
            remise: countWords(['remise', 'reduction', 'promo', 'discount', 'moins cher', 'rabais', 'do bo a la', 'a do bo', 'a da dusu']),
            monnaie: countWords(['monnaie', 'fond caisse', 'fonds de caisse', 'matin', 'demarrer', 'caisse initiale', 'jeton', 'petite monnaie', 'wari misen', 'warimisen']),
            mobile_money: countWords(['wave', 'orange', 'mtn', 'moov', 'mobile money', 'momo', 'electronique']),
            credit: countWords(['credit', 'dette', 'doit', 'impaye', 'rembourser', 'remboursement', 'client', 'pret', 'bon', 'juru', 'njuru', 'n\'juru']),
            commande: countWords(['commande', 'reserver', 'livraison', 'livrer', 'livreur', 'route', 'preparation', 'expedier']),

            stock: countWords(['stock', 'produit', 'article', 'marchandise', 'inventaire', 'quantite', 'ajouter', 'nouveau', 'minen', 'fen', 'jogo']),
            prix: countWords(['prix', 'tarif', 'modifier prix', 'changer', 'cout', 'songo', 'a songo', 'da', 'a da']),
            variante: countWords(['variante', 'taille', 'couleur', 'pointure', 'modele', 'declinaison', 'suguya', 'cogo']),
            rupture: countWords(['rupture', 'epuise', 'bas', 'alerte', 'manque', 'faible', 'banna', 'a banna', 'a te yen']),
            perte: countWords(['perte', 'perime', 'casse', 'vole', 'manquant', 'signaler', 'tinena', 'a tinena', 'tununa']),
            code_barre: countWords(['code barre', 'scanner', 'etiquette', 'imprimer', 'barcode', 'qr', 'flash']),

            depense: countWords(['depense', 'charge', 'facture', 'loyer', 'transport', 'cie', 'sodeci', 'sortie', 'frais', 'wari bo', 'wari boli']),
            bilan: countWords(['benefice', 'bilan', 'rapport', 'chiffre', 'gagne', 'recette', 'point', 'rentable', 'profit', 'tono', 'tono soro', 'wari to']),
            capital: countWords(['fonds investi', 'capital', 'mise de depart', 'investi', 'fond de commerce', 'fonds de commerce', 'fond de depart', 'fonds de depart', 'budget', 'wari juju', 'wari kun']),
            pdf: countWords(['pdf', 'exporter', 'telecharger', 'imprimer bilan']),

            fournisseur: countWords(['fournisseur', 'grossiste', 'approvisionnement', 'achat', 'contact', 'feerekela']),
            catalogue: countWords(['catalogue', 'en ligne', 'internet', 'lien', 'partager', 'whatsapp', 'site', 'vitrine']),
            equipe: countWords(['equipe', 'vendeur', 'employe', 'gerant', 'acces', 'compte', 'utilisateur', 'ajouter personne', 'baarakela', 'mogo']),
            audit: countWords(['audit', 'journal', 'historique', 'trace', 'mouvement', 'supprime', 'erreur', 'log']),
            pwa: countWords(['installer', 'appli', 'ecran accueil', 'pwa', 'telecharger']),
            mode_sombre: countWords(['sombre', 'nuit', 'theme', 'couleur ecran', 'luminosite'])
        };

        // Modificateurs de contexte
        if (prevTopic && scores[prevTopic] > 0) scores[prevTopic] += 1.5;
        if (isFollowUp && prevTopic) scores[prevTopic] += 2;

        const bestTopic = Object.entries(scores).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])[0]?.[0];

        // ── Base de Connaissances ──
        const KB = {
            salutation: { r: "Bonjour ! 👋 Prêt à gérer votre boutique ?\n\nQue souhaitez-vous faire ?", s: ["Faire une vente", "Gérer mon stock", "Voir mon bilan"] },
            merci: { r: "Avec grand plaisir ! 😊 N'hésitez pas si vous avez d'autres questions.", s: ["Faire une vente", "Ajouter un produit"] },
            aide: { r: "Voici ce que je gère :\n\n→ **Vente** : Caisse, Mobile Money, Crédits\n→ **Stock** : Produits, Variantes, Pertes, Étiquettes\n→ **Finances** : Bénéfices, Dépenses, Bilans PDF\n→ **Clients & Commandes**\n→ **Catalogue en ligne WhatsApp**", s: ["Encaisser une vente", "Voir mes bénéfices", "Partager mon catalogue"] },
            
            vente: { r: "📦 **Pour effectuer une vente :**\n\n1️⃣ Je vous emmène à la caisse !\n2️⃣ Touchez ou scannez les articles\n3️⃣ Cliquez sur **ENCAISSER** (bouton vert en bas)\n4️⃣ Choisissez le paiement : Espèces ou Mobile Money\n\n💡 *Astuce : Vous pouvez modifier le prix ou la quantité d'un article directement dans le panier.*", s: ["Vente à crédit", "Ajouter une remise", "Mobile Money"], action: "ventes" },
            remise: { r: "🏷️ **Appliquer une remise :**\n\nDans l'onglet **Vente**, sous le panier, cliquez sur le petit bouton **+ Ajouter Remise**. Saisissez le montant à déduire en CFA et le total s'ajustera automatiquement.", s: ["Faire une vente", "Mobile money"], action: "ventes" },
            monnaie: { r: "💰 **Monnaie du matin (Fond de caisse) :**\n\nDans l'onglet **Vente**, regardez la zone bleue en haut à droite. Entrez le montant présent dans votre tiroir, puis cliquez sur la disquette 💾 pour l'enregistrer.", s: ["Voir mes bénéfices", "Enregistrer une dépense"], action: "ventes" },
            mobile_money: { r: "📱 **Paiement Mobile Money :**\n\nDepuis la **Vente**, au moment de payer, cliquez sur **Mobile Money** (bouton turquoise). Choisissez l'opérateur (Wave, Orange, MTN...) et entrez le numéro du client.", s: ["Faire une vente", "Vente à crédit"], action: "ventes" },
            credit: { r: "👥 **Gestion des Crédits :**\n\n→ **Pour faire un crédit :** Dans Vente, cliquez sur le bouton orange **Crédit Client**.\n→ **Pour encaisser un remboursement :** Allez dans l'onglet **Clients & Crédits**, cherchez le client et cliquez sur **Encaisser**.", s: ["Voir mes clients", "Faire une vente"], action: "credits" },
            commande: { r: "📋 **Les Commandes (Livraisons) :**\n\nL'onglet **Commandes** centralise les achats faits par vos clients sur votre catalogue en ligne. Vous pouvez :\n→ Changer le statut (En préparation, En route)\n→ Assigner un livreur avec son numéro\n→ Partager le suivi par WhatsApp", s: ["Partager mon catalogue", "Assigner un livreur"], action: "commandes" },
            
            stock: { r: "📦 **Gérer le Stock :**\n\nJe vous ouvre l'inventaire tout de suite !\n→ Cliquez sur **Nouveau Produit** pour ajouter.\n→ Cliquez sur un produit existant pour modifier son prix, son stock ou sa photo.", s: ["Signaler une perte", "Imprimer des étiquettes", "Ajouter une variante"], action: "stock" },
            prix: { r: "✏️ **Changer un prix :**\n\nAllez dans **Stock**, touchez le produit concerné, modifiez la case **Prix de Vente** et enregistrez. Le nouveau tarif sera immédiat à la caisse.", s: ["Gérer mon stock"], action: "stock" },
            variante: { r: "🎨 **Tailles et Couleurs (Variantes) :**\n\nLors de la création d'un produit (onglet **Stock**), cochez la case bleue *\"Ce produit possède des variantes\"*. Vous pourrez alors ajouter des lignes pour chaque taille ou couleur, avec leur propre stock et photo !", s: ["Ajouter un produit"], action: "stock" },
            rupture: { r: "⚠️ **Ruptures de stock :**\n\nL'application vous alerte en rouge sur le **Dashboard** (Stock Faible) quand un article descend en dessous de 5. Triez votre onglet Stock par \"Stock Faible\" pour savoir quoi réapprovisionner.", s: ["Gérer mes fournisseurs", "Ajouter du stock"], action: "stock" },
            perte: { r: "🗑️ **Pertes et Périmés :**\n\nPour sortir un article du stock sans gagner d'argent (Cassé, périmé, volé), allez dans **Stock**, cliquez sur le produit, puis sur le bouton rouge **Signaler une perte** en bas.", s: ["Voir le journal d'audit"], action: "stock" },
            code_barre: { r: "📷 **Codes-barres et Scanner :**\n\n→ Pour vendre/ajouter, touchez l'icône **caméra**.\n→ Pour imprimer des étiquettes à coller sur vos articles, allez dans **Stock** et cliquez sur le bouton gris **Imprimer Étiquettes**.", s: ["Faire une vente", "Gérer le stock"], action: "stock" },
            
            depense: { r: "💸 **Les Dépenses (Charges) :**\n\nPour enregistrer un loyer, un transport ou une facture CIE, allez dans l'onglet **Dépenses**. Saisissez le motif et le montant. Ces charges seront automatiquement déduites de vos bénéfices dans le bilan.", s: ["Voir mon bilan", "Caisse de départ"], action: "charges" },
            bilan: { r: "📊 **Bénéfices et Bilan :**\n\nVoici vos chiffres ! L'onglet **Bilan** calcule tout pour vous ! Il prend vos ventes, soustrait vos dépenses, et vous affiche le bénéfice net ainsi que l'argent réel (Trésorerie) qui doit être en votre possession.", s: ["Exporter en PDF", "Enregistrer une dépense", "Capital investi"], action: "rapports" },
            capital: { r: "🏦 **Capital (Fonds de départ investi) :**\n\nAllez dans l'onglet **Bilan**. Dans la grande case bleue en haut, entrez l'argent investi pour démarrer l'activité. Cela permet à l'appli de calculer correctement l'évolution de votre trésorerie globale.", s: ["Voir mon bilan"], action: "rapports" },
            pdf: { r: "📄 **Export PDF :**\n\nDepuis l'onglet **Bilan**, choisissez vos dates puis cliquez sur le bouton rouge **PDF**. Un rapport propre et professionnel se téléchargera, parfait pour votre comptable ou vos archives.", s: ["Voir mon bilan"], action: "rapports" },
        
            fournisseur: { r: "🚚 **Fournisseurs :**\n\nLe menu **Fournisseurs** est votre carnet d'adresses professionnel. Enregistrez-y vos grossistes pour les recontacter facilement via WhatsApp en cas de rupture de stock.", s: ["Gérer mon stock"], action: "fournisseurs" },
            catalogue: { r: "🌐 **Boutique en ligne :**\n\nVotre boutique possède un lien internet unique ! Vos clients peuvent l'ouvrir (sans installer d'appli) pour voir vos produits et commander. Pour obtenir ce lien, cliquez sur **Paramètres / Profil** ⚙️ et appuyez sur **Copier** dans la section Boutique en ligne.", s: ["Gérer mes commandes"] },
            equipe: { r: "👥 **Ajouter des Vendeurs :**\n\nSi vous êtes le Propriétaire, ouvrez le menu et cliquez sur **Gestion Équipe**. Créez un compte pour votre employé (Email + Code PIN). Un 'Vendeur' aura un accès limité (Caisse uniquement), tandis qu'un 'Gérant' aura un accès presque total.", s: ["Voir le journal d'audit"] },
            audit: { r: "🔍 **Journal d'Audit :**\n\nL'onglet **Journal** est la mémoire de l'application. Chaque vente, chaque modification de prix, chaque dépense et chaque suppression y est tracée avec la date, l'heure et l'auteur. Impossible de tricher !", s: ["Gérer mon équipe", "Voir mes bénéfices"], action: "audit" },
            pwa: { r: "📲 **Installer l'Appli :**\n\n→ Sur **Android** : Ouvrez le menu de Chrome et choisissez \"Installer l'application\".\n→ Sur **iPhone (Safari)** : Cliquez sur le carré avec la flèche ↑ au milieu en bas, puis \"Sur l'écran d'accueil\".", s: ["Mode Sombre"] },
            mode_sombre: { r: "🌙 **Mode Sombre :**\n\nPour reposer vos yeux la nuit, ouvrez le menu latéral (ou regardez en bas à gauche sur PC) et cliquez sur le bouton **Mode Sombre**.", s: ["Installer l'application"] }
        };

        // ── Réponse de secours ──
        const fallback = {
            r: isNegative 
                ? "Je vois qu'il y a une difficulté. 🤔 Pouvez-vous m'indiquer sur quel onglet vous êtes et ce que vous essayez de faire ?" 
                : "Je ne suis pas sûr de comprendre. Pourriez-vous utiliser des mots simples comme :\n\n→ **'Faire une vente'**\n→ **'Ajouter un produit'**\n→ **'Partager mon catalogue'**",
            s: ["Faire une vente", "Gérer le stock", "Voir le bilan"]
        };

        const result = bestTopic && KB[bestTopic] ? KB[bestTopic] : fallback;

        return {
            response: result.r,
            topic: bestTopic || 'erreur',
            suggestions: result.s || [],
            action: result.action || null
        };
    }
}