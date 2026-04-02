// ════════════════════════════════════════════════════════════════
//  aiAssistant.js — Assistant intelligent "Ma Boutique" V2
//  Moteur de score par sujet + mémoire contexte + Interface riche
// ════════════════════════════════════════════════════════════════
import { db, collection, addDoc, serverTimestamp } from './firebase.js';

export function setupAIAssistant() {
    // ── Éléments DOM ─────────────────────────────────────────────
    let lastUserQuery = "";
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
        lastUserQuery = text;
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

            // --- NOUVEAU : Envoi automatique dans ai_unknowns si incompris ---
            if (topic === 'erreur') {
                window.logUnknownQuery(text);
            }
            // -----------------------------------------------------------------

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

            // NOUVEAU : Boutons d'apprentissage (RLHF)
            let feedbackHtml = '';
            // On ne demande pas de vote pour les salutations ou les erreurs
            if (topic && topic !== 'salutation' && topic !== 'erreur') {
                const safeQuery = lastUserQuery.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                feedbackHtml = `
                <div class="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                    <span class="text-[9px] text-slate-400 font-medium">Avez-vous compris ?</span>
                    <button onclick="window.rateAI('${safeQuery}', '${topic}', true, this)" class="text-[11px] bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 px-2 py-1 rounded-md transition border border-slate-200">👍 Oui</button>
                    <button onclick="window.rateAI('${safeQuery}', '${topic}', false, this)" class="text-[11px] bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 px-2 py-1 rounded-md transition border border-slate-200">👎 Non</button>
                </div>`;
            }

            d.className = "flex flex-col items-start gap-0.5 mb-3 animate-fade-in-up";
            d.innerHTML = `
                <div class="flex items-start gap-2 w-full">
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-xs mt-0.5 shadow-sm">${getTopicIcon(topic)}</div>
                    <div class="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-3 py-2.5 rounded-2xl rounded-tl-sm shadow-sm max-w-[88%] min-w-[200px]">
                        <div class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">${formatText(text)}</div>
                        ${actionBtnHtml}
                        ${feedbackHtml}
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
        
        // --- DICTIONNAIRE PHONÉTIQUE LOCAL ---
        // Force la voix française (qui lit avec l'accent français) à bien prononcer le Dioula/Nouchi
        const phonetics = {
            // Salutations
            "I ni ce": "I ni tsé", "i ni ce": "i ni tsé",
            "Aw ni ce": "Ao ni tsé", "aw ni ce": "ao ni tsé",
            "I ni baara": "I ni bara", "i ni baara": "i ni bara",
            "Djam": "Djame", "djam": "djame",
            
            // Commerce / vente
            "Feere": "Féré", "feere": "féré",
            "Sara": "Sara", "sara": "sara",
            "Wari": "Ouari", "wari": "ouari",
            "Songo": "Sonnguo", "songo": "sonnguo",
            "Tono": "Tonou", "tono": "tonou",
            "Minen": "Minène", "minen": "minène",

            // Crédits / dettes
            "Juru": "Djourou", "juru": "djourou",
            "Dourou": "Djourou", "dourou": "djourou",

            // Pertes
            "Tiɲɛna": "Tiniéna", "tiɲɛna": "tiniéna",
            "Tununa": "Tounouna", "tununa": "tounouna",

            // Équipe
            "Baarakɛla": "Baraké-la", "baarakɛla": "baraké-la",
            "Mogo": "Mogou", "mogo": "mogou",

            // Merci / politesse
            "Barika": "Barika", "barika": "barika",
            "A barika": "A barika", "a barika": "a barika",

            // Lettres et petits mots
            "banna": "banna",
            "bɔ": "bo",
            "tɛ": "tè",
            "ɲɛ": "nyè",
            "ɔ": "o",
            "ɛ": "è"
        };
        
        let spokenText = clean;
        Object.keys(phonetics).forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            spokenText = spokenText.replace(regex, phonetics[word]);
        });

        const u = new SpeechSynthesisUtterance(spokenText);
        u.lang = 'fr-FR'; 
        u.rate = 1.05; 
        u.pitch = 1.0;
        
        const frVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr') && v.localService);
        if (frVoice) u.voice = frVoice;
        
        window.speechSynthesis.speak(u);
    }

    function stopSpeaking() { window.speechSynthesis?.cancel(); }

    // ════════════════════════════════════════════════════════════
    //  MOTEUR DE RÉPONSES BILINGUE (Français / Bambara-Dioula)
    // ════════════════════════════════════════════════════════════
    function getSmartResponse(query, prevTopic) {
        // ── Correction phonétique pour le micro (Traductions forcées par le navigateur) ──
        let correctedQuery = query.toLowerCase();
        const phoneticCorrections = {
            // Salutations
            "en ce moment": "a ni sogor man",
            "ans sur comment": "a ni sogor man",
            "han sur comment": "a ni sogor man",
            "unisson": "i ni ce",
            "il n'y sait": "i ni ce",
            "initier": "i ni ce",
            "on y sait": "aw ni ce",
            
            // Commerce
            "son go": "songo",
            "sans go": "songo",
            "sont gros": "songo",
            "son gros": "songo",
            "cent go": "songo",
            "féré": "feere",
            "ferré": "feere",
            "ouari": "wari",
            "harry": "wari",
            
            // Finances et gestion
            "tonneau": "tono",
            "tonnaud": "tono",
            "jour où": "juru",
            "genou": "juru",
            
            // Autres
            "bara": "baara",
            "bas ras": "baara"
        };
        
        Object.keys(phoneticCorrections).forEach(badFr => {
            if (correctedQuery.includes(badFr)) {
                // Remplacement global pour corriger le mot même s'il est répété plusieurs fois
                correctedQuery = correctedQuery.replace(new RegExp(badFr, 'g'), phoneticCorrections[badFr]);
            }
        });

        // Remplacement des caractères spéciaux bambara avant la normalisation standard
        const nQuery = correctedQuery
            .replace(/ɛ/g, 'e').replace(/ɔ/g, 'o').replace(/ɲ/g, 'n')
            .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
        
        const hasWord = words => words.some(w => nQuery.includes(w));
        const countWords = words => words.filter(w => nQuery.includes(w)).length;
        const isNegative = hasWord(['pas', 'bug', 'erreur', 'marche pas', 'probleme', 'impossible', 'te', 'bila']);
        const isFollowUp = hasWord(['et aussi', 'encore', 'autre', 'et pour', 'et si', 'ani', 'tugun']);

        // ── Détection de l'utilisation du Bambara par l'utilisateur ──
        const bambaraKeywords = ['i ni ce', 'aw ni ce', 'inice', 'awnice', 'anice', 'kori djam', 'a ni sogor man', 'barika', 'djarabi', 'baara', 'deme', 'makan', 'feere', 'fere', 'féré', 'wuli', 'sara', 'wari', 'fen feere', 'nogo', 'misen', 'telefoni', 'juru', 'djourou', 'njuru', 'dibi', 'je fana', 'kene', 'minen', 'jogo', 'fanba', 'donniya', 'songo', 'suguya', 'cogo', 'nyuman', 'banna', 'te yen', 'desi', 'dese', 'dogoya', 'tinena', 'tununa', 'fili', 'bana', 'mako', 'nafo', 'tono', 'nafama', 'geleya', 'saba', 'juju', 'kun', 'feerekela', 'sugu tigi', 'interneti', 'baarakela', 'mogo', 'kalan den', 'kuma', 'tariku', 'tugun'];
        const isBambaraUser = bambaraKeywords.some(w => nQuery.includes(w));

        // ── Lexique Enrichi (Français + Bambara/Dioula + Nouchi phonétique) ──
        const scores = {
            salutation: countWords(['bonjour', 'salut', 'coucou', 'hello', 'hey', 'bjr', 'i ni ce', 'aw ni ce', 'inice', 'awnice', 'anice', 'djam', 'kori djam', 'a ni sogor man']),
            merci: countWords(['merci', 'super', 'parfait', 'genial', 'top', 'cimer', 'barika', 'a barika', 'djarabi', 'i ni baara']),
            aide: countWords(['aide', 'aider', 'apprendre', 'debut', 'fonction', 'comment faire', 'comment ca marche', 'marche', 'deme', 'n deme', 'makan']),

            vente: countWords(['vente', 'vendre', 'encaisser', 'caisse', 'panier', 'ticket', 'facture', 'paiement', 'feere', 'fere', 'féré', 'wuli', 'sara', 'sara ke', 'wari sara', 'ci', 'fen feere']),
            remise: countWords(['remise', 'reduction', 'promo', 'discount', 'moins cher', 'rabais', 'do bo a la', 'a do bo', 'a da dusu', 'nogo', 'a nogo']),
            monnaie: countWords(['monnaie', 'fond caisse', 'fonds de caisse', 'matin', 'demarrer', 'jeton', 'petite monnaie', 'wari misen', 'warimisen', 'misen']),
            mobile_money: countWords(['wave', 'orange', 'mtn', 'moov', 'mobile money', 'momo', 'electronique', 'wari di', 'telefoni wari']),
            credit: countWords(['credit', 'dette', 'doit', 'impaye', 'rembourser', 'client', 'pret', 'bon', 'juru', 'djourou', 'njuru', 'n\'juru', 'dibi', 'je fana', 'kene', 'wari to']),
            commande: countWords(['commande', 'reserver', 'livraison', 'livrer', 'livreur', 'route', 'preparation', 'expedier', 'ci', 'ci wari']),

            stock: countWords(['stock', 'produit', 'article', 'marchandise', 'inventaire', 'quantite', 'ajouter', 'nouveau', 'minen', 'fen', 'jogo', 'bagage', 'baara', 'fanba', 'donniya']),
            prix: countWords(['prix', 'tarif', 'modifier prix', 'changer', 'cout', 'songo', 'a songo', 'da', 'a da', 'wari', 'do', 'ke']),
            variante: countWords(['variante', 'taille', 'couleur', 'pointure', 'modele', 'declinaison', 'suguya', 'cogo', 'nyuman']),
            rupture: countWords(['rupture', 'epuise', 'bas', 'alerte', 'manque', 'faible', 'banna', 'a banna', 'a te yen', 'desi', 'dese', 'a dogoyara']),
            perte: countWords(['perte', 'perime', 'casse', 'vole', 'manquant', 'signaler', 'tinena', 'a tinena', 'tununa', 'fili', 'a filila', 'perdu', 'bana', 'dogoya']),
            code_barre: countWords(['code barre', 'scanner', 'etiquette', 'imprimer', 'barcode', 'qr', 'flash', 'foto']),

            depense: countWords(['depense', 'charge', 'facture', 'loyer', 'transport', 'cie', 'sodeci', 'sortie', 'frais', 'wari bo', 'boli', 'mako', 'don', 'nafo te']),
            bilan: countWords(['benefice', 'bilan', 'rapport', 'chiffre', 'gagne', 'recette', 'point', 'rentable', 'profit', 'tono', 'tono soro', 'nafama', 'wari to', 'geleya', 'saba']),
            capital: countWords(['fonds investi', 'capital', 'mise de depart', 'investi', 'fond de depart', 'budget', 'wari juju', 'wari kun']),
            pdf: countWords(['pdf', 'exporter', 'telecharger', 'imprimer bilan', 'papier']),

            fournisseur: countWords(['fournisseur', 'grossiste', 'approvisionnement', 'achat', 'contact', 'feerekela', 'sugu tigi']),
            catalogue: countWords(['catalogue', 'en ligne', 'internet', 'lien', 'partager', 'whatsapp', 'site', 'vitrine', 'interneti', 'acceder', 'ouvrir']),
            equipe: countWords(['equipe', 'vendeur', 'employe', 'gerant', 'acces', 'compte', 'utilisateur', 'ajouter personne', 'baarakela', 'mogo', 'kalan den']),
            audit: countWords(['audit', 'journal', 'historique', 'trace', 'mouvement', 'supprime', 'erreur', 'log', 'kuma', 'tariku']),
            pwa: countWords(['installer', 'appli', 'ecran accueil', 'pwa', 'telecharger', 'telephone']),
            mode_sombre: countWords(['sombre', 'nuit', 'theme', 'couleur ecran', 'luminosite', 'dibi'])
        };

        // Modificateurs de contexte
        if (prevTopic && scores[prevTopic] > 0) scores[prevTopic] += 1.5;
        if (isFollowUp && prevTopic) scores[prevTopic] += 2;

        const bestTopic = Object.entries(scores).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])[0]?.[0];

        // ── Base de Connaissances (KB) : Version 100% Français et Version Bilingue ──
        const KB = {
            salutation: { 
                r_fr: "Bonjour ! 👋 Prêt à gérer la boutique ?\n\nQue souhaitez-vous faire ?", 
                r_bi: "I ni ce ! Bonjour ! 👋 Prêt à gérer la boutique ? (I bɛ di ?)\n\nQue souhaitez-vous faire ? (Mun bɛ i mago la ?)", 
                s_fr: ["Vendre", "Voir le stock", "Bénéfice"], 
                s_bi: ["Vendre (Feere)", "Voir le stock (Minen)", "Bénéfice (Tono)"] 
            },
            merci: { 
                r_fr: "Avec grand plaisir ! 😊 Je suis là pour vous aider.", 
                r_bi: "I ni baara ! Avec grand plaisir ! 😊 Je suis là pour vous aider (N bɛ se ka i dɛmɛ).", 
                s_fr: ["Vendre", "Ajouter marchandise"] 
            },
            aide: { 
                r_fr: "Je peux vous aider avec :\n\n→ **Vente**\n→ **Stock et Marchandises**\n→ **Bénéfices**\n→ **Crédits**", 
                r_bi: "N bɛ se ka i dɛmɛ ! Je peux vous aider avec :\n\n→ **Vente (Feere)**\n→ **Stock et Marchandises (Minen)**\n→ **Bénéfices (Tono)**\n→ **Crédits (Juru)**", 
                s_fr: ["Encaisser une vente", "Voir mes bénéfices"] 
            },
            vente: { 
                r_fr: "📦 **Pour vendre :**\n\n1️⃣ Je vous ouvre la caisse !\n2️⃣ Touchez les articles.\n3️⃣ Cliquez sur le gros bouton vert ENCAISSER.", 
                r_bi: "📦 **Pour vendre (Ka feere kɛ) :**\n\n1️⃣ Je vous ouvre la caisse !\n2️⃣ Touchez les articles.\n3️⃣ Cliquez sur le gros bouton vert ENCAISSER.", 
                s_fr: ["Crédit", "Remise", "Mobile Money"], 
                s_bi: ["Crédit (Juru)", "Remise (A dɔ bɔ)", "Mobile Money"], action: "ventes" 
            },
            remise: { 
                r_fr: "🏷️ **Diminuer le prix :**\n\nDans la Vente, sous le panier, cliquez sur '+ Ajouter Remise'. Tapez l'argent à enlever.", 
                r_bi: "🏷️ **Diminuer le prix (A dɔ bɔ) :**\n\nDans la Vente, sous le panier, cliquez sur '+ Ajouter Remise'. Tapez l'argent à enlever.", 
                s_fr: ["Vendre", "Mobile money"], 
                s_bi: ["Vendre (Feere)", "Mobile money"], action: "ventes" 
            },
            monnaie: { 
                r_fr: "💰 **Monnaie du matin :**\n\nDans la Vente, en haut à droite. Tapez la petite monnaie que vous avez dans le tiroir, puis enregistrez 💾.", 
                r_bi: "💰 **Monnaie du matin (Wari misen) :**\n\nDans la Vente, en haut à droite. Tapez la petite monnaie que vous avez dans le tiroir, puis enregistrez 💾.", 
                s_fr: ["Bénéfice", "Dépense"], 
                s_bi: ["Bénéfice (Tono)", "Dépense (Wari bɔ)"], action: "ventes" 
            },
            mobile_money: { 
                r_fr: "📱 **Paiement Mobile Money :**\n\nPour payer par Wave ou Orange, cliquez sur 'Mobile Money' (bouton turquoise) au moment de payer.", 
                s_fr: ["Vendre", "Crédit"], 
                s_bi: ["Vendre (Feere)", "Crédit (Juru)"], action: "ventes" 
            },
            credit: { 
                r_fr: "👥 **Crédit :**\n\n→ **Pour donner à crédit :** Dans Vente, bouton orange 'Crédit Client'.\n→ **Pour faire payer un crédit :** Je vous emmène voir vos clients.", 
                r_bi: "👥 **Crédit (Juru) :**\n\n→ **Pour donner à crédit :** Dans Vente, bouton orange 'Crédit Client'.\n→ **Pour faire payer un crédit :** Je vous emmène voir vos clients.", 
                s_fr: ["Payer un crédit"], action: "credits" 
            },
            commande: { 
                r_fr: "📋 **Livraisons :**\n\nJe vous ouvre la page des commandes. Vous pourrez donner la commande à un livreur ou envoyer un message WhatsApp.", 
                r_bi: "📋 **Livraisons (Ci) :**\n\nJe vous ouvre la page des commandes. Vous pourrez donner la commande à un livreur ou envoyer un message WhatsApp.", 
                s_fr: ["Catalogue en ligne"], action: "commandes" 
            },
            stock: { 
                r_fr: "📦 **Stock :**\n\nJe vous ouvre le magasin !\n→ Cliquez sur 'Nouveau Produit' pour ajouter des marchandises.", 
                r_bi: "📦 **Stock (Minen) :**\n\nJe vous ouvre le magasin !\n→ Cliquez sur 'Nouveau Produit' pour ajouter des marchandises (Fen).", 
                s_fr: ["Perte", "Prix"], 
                s_bi: ["Perte (Tiɲɛna)", "Prix (Songo)"], action: "stock" 
            },
            prix: { 
                r_fr: "✏️ **Changer un prix :**\n\nAllez dans le Stock, touchez la marchandise, changez le Prix de Vente et enregistrez.", 
                r_bi: "✏️ **Changer un prix (A songo) :**\n\nAllez dans le Stock, touchez la marchandise, changez le Prix de Vente et enregistrez.", 
                s_fr: ["Voir le stock"], 
                s_bi: ["Voir le stock (Minen)"], action: "stock" 
            },
            variante: { 
                r_fr: "🎨 **Tailles et Couleurs :**\n\nQuand vous ajoutez une marchandise, cochez la case bleue 'Variantes'. Vous pourrez ajouter les tailles et les couleurs.", 
                r_bi: "🎨 **Tailles et Couleurs (Suguya) :**\n\nQuand vous ajoutez une marchandise, cochez la case bleue 'Variantes'. Vous pourrez ajouter les tailles et les couleurs.", 
                s_fr: ["Ajouter marchandise"], action: "stock" 
            },
            rupture: { 
                r_fr: "⚠️ **Marchandise finie :**\n\nL'application vous prévient en rouge quand il reste moins de 5 articles. Triez le stock par 'Stock Faible' pour voir.", 
                r_bi: "⚠️ **Marchandise finie (A banna) :**\n\nL'application vous prévient en rouge quand il reste moins de 5 articles. Triez le stock par 'Stock Faible' pour voir.", 
                s_fr: ["Fournisseurs", "Ajouter stock"], action: "stock" 
            },
            perte: { 
                r_fr: "🗑️ **Perte ou Vol :**\n\nSi un article est cassé ou perdu, allez dans Stock, cliquez sur l'article, puis sur le bouton rouge 'Signaler une perte' en bas.", 
                r_bi: "🗑️ **Perte ou Vol (Tiɲɛna) :**\n\nSi un article est cassé ou perdu, allez dans Stock, cliquez sur l'article, puis sur le bouton rouge 'Signaler une perte' en bas.", 
                s_fr: ["Journal"], 
                s_bi: ["Journal (Tariku)"], action: "stock" 
            },
            code_barre: { 
                r_fr: "📷 **Scanner avec le téléphone :**\n\nTouchez l'icône appareil photo 📷 pour scanner un code barre rapidement.", 
                s_fr: ["Vendre", "Voir le stock"], 
                s_bi: ["Vendre (Feere)", "Voir le stock (Minen)"], action: "stock" 
            },
            depense: { 
                r_fr: "💸 **Dépenses :**\n\nPour les factures, le transport ou la nourriture, je vous ouvre la page Dépenses pour tout noter.", 
                r_bi: "💸 **Dépenses (Wari bɔ) :**\n\nPour les factures, le transport ou la nourriture, je vous ouvre la page Dépenses pour tout noter.", 
                s_fr: ["Bénéfice"], 
                s_bi: ["Bénéfice (Tono)"], action: "charges" 
            },
            bilan: { 
                r_fr: "📊 **Bénéfices :**\n\nVoici vos chiffres ! L'onglet Bilan calcule votre argent et ce que vous avez gagné.", 
                r_bi: "📊 **Bénéfices (Tono) :**\n\nVoici vos chiffres ! L'onglet Bilan calcule votre argent et ce que vous avez gagné (Tono sɔrɔ).", 
                s_fr: ["Exporter PDF", "Dépense"], 
                s_bi: ["Exporter PDF", "Dépense (Wari bɔ)"], action: "rapports" 
            },
            capital: { 
                r_fr: "🏦 **Capital :**\n\nSur la page Bilan, tapez l'argent que vous avez investi au début dans la case bleue.", 
                r_bi: "🏦 **Capital (Wari juju) :**\n\nSur la page Bilan, tapez l'argent que vous avez investi au début dans la case bleue.", 
                s_fr: ["Bénéfice"], 
                s_bi: ["Bénéfice (Tono)"], action: "rapports" 
            },
            pdf: { 
                r_fr: "📄 **Imprimer le Bilan :**\n\nSur la page Bilan, cliquez sur le bouton rouge PDF pour télécharger vos chiffres.", 
                r_bi: "📄 **Imprimer le Bilan (Papier) :**\n\nSur la page Bilan, cliquez sur le bouton rouge PDF pour télécharger vos chiffres.", 
                s_fr: ["Bénéfice"], 
                s_bi: ["Bénéfice (Tono)"], action: "rapports" 
            },
            fournisseur: { 
                r_fr: "🚚 **Fournisseurs :**\n\nJe vous ouvre votre carnet d'adresses. Vous pourrez enregistrer vos grossistes.", 
                r_bi: "🚚 **Fournisseurs (Feerekela) :**\n\nJe vous ouvre votre carnet d'adresses. Vous pourrez enregistrer vos grossistes.", 
                s_fr: ["Voir le stock"] 
            },
            catalogue: { 
                r_fr: "🌐 **Boutique WhatsApp :**\n\nVos clients peuvent voir vos articles sur leur téléphone ! Allez dans 'Profil' ⚙️ et cliquez sur 'Copier' pour partager le lien.", 
                r_bi: "🌐 **Boutique WhatsApp (Interneti) :**\n\nVos clients peuvent voir vos articles sur leur téléphone ! Allez dans 'Profil' ⚙️ et cliquez sur 'Copier' pour partager le lien.", 
                s_fr: ["Voir les commandes"] 
            },
            equipe: { 
                r_fr: "👥 **Ajouter un vendeur :**\n\nAllez dans le menu et cliquez sur 'Gestion Équipe' pour donner un code d'accès à votre employé.", 
                r_bi: "👥 **Ajouter un vendeur (Baarakɛla) :**\n\nAllez dans le menu et cliquez sur 'Gestion Équipe' pour donner un code d'accès à votre employé.", 
                s_fr: ["Journal"], 
                s_bi: ["Journal (Tariku)"] 
            },
            audit: { 
                r_fr: "🔍 **Journal :**\n\nC'est la mémoire de la boutique. Tout ce qui est fait ou effacé est écrit ici. Impossible de tricher !", 
                r_bi: "🔍 **Journal (Tariku) :**\n\nC'est la mémoire de la boutique. Tout ce qui est fait ou effacé est écrit ici. Impossible de tricher !", 
                s_fr: ["Bénéfice"], 
                s_bi: ["Bénéfice (Tono)"] 
            },
            pwa: { 
                r_fr: "📲 **Mettre sur le téléphone :**\n\nPour installer l'application, ouvrez le menu de votre navigateur (Chrome/Safari) et choisissez 'Installer' ou 'Sur l'écran d'accueil'.", 
                s_fr: [] 
            },
            mode_sombre: { 
                r_fr: "🌙 **Mode Nuit :**\n\nOuvrez le menu sur le côté et cliquez sur 'Mode Sombre' pour protéger vos yeux.", 
                r_bi: "🌙 **Mode Nuit (Dibi) :**\n\nOuvrez le menu sur le côté et cliquez sur 'Mode Sombre' pour protéger vos yeux.", 
                s_fr: [] 
            }
        };

        // ── Réponse de secours ──
        const fallback = {
            r_fr: isNegative 
                ? "Un problème ? 🤔 Dites-moi simplement : 'Je veux vendre' ou 'Voir le bénéfice'." 
                : "Je n'ai pas bien compris. Parlez-moi simplement :\n\n→ **Vendre**\n→ **Bénéfice**\n→ **Crédit**\n→ **Stock**",
            r_bi: isNegative 
                ? "Un problème ? 🤔 Dites-moi simplement : 'Je veux vendre' ou 'Voir le bénéfice'." 
                : "Je n'ai pas bien compris. Parlez-moi simplement :\n\n→ **'Feere'** (Vendre)\n→ **'Tono'** (Bénéfice)\n→ **'Juru'** (Crédit)\n→ **'Minen'** (Stock)",
            s_fr: ["Vendre", "Stock", "Bénéfice"],
            s_bi: ["Vendre (Feere)", "Stock (Minen)", "Bénéfice (Tono)"]
        };

        const result = bestTopic && KB[bestTopic] ? KB[bestTopic] : fallback;

        return {
            response: isBambaraUser ? (result.r_bi || result.r_fr) : result.r_fr,
            topic: bestTopic || 'erreur',
            suggestions: isBambaraUser ? (result.s_bi || result.s_fr) : result.s_fr,
            action: result.action || null
        };
    }
}

// --- Fonction d'enregistrement automatique des incompréhensions ---
async function autoLogUnknown(query) {
    try {
        await addDoc(collection(db, "ai_unknowns"), {
            phrase: query,
            date: serverTimestamp(),
            resolved: false // Permettra plus tard de marquer ce qui a été ajouté au code
        });
        console.log("✔️ Mot inconnu enregistré avec succès dans Firebase !");
    } catch (e) {
        console.error("❌ Erreur Firebase lors de l'enregistrement :", e);
    }
}
// --- Fonction d'apprentissage IA ---
window.rateAI = async function(query, topic, isHelpful, btnElement) {
    try {
        // Enregistrer dans Firebase
        await addDoc(collection(db, "ai_learning"), {
            phrase: query,
            sujet_devine: topic,
            correct: isHelpful,
            date: serverTimestamp()
        });

        // Modifier l'interface pour dire merci
        const container = btnElement.parentElement;
        container.innerHTML = `<span class="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Merci pour votre aide ! L'IA va apprendre.</span>`;
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.error("Erreur d'apprentissage IA :", e);
    }
}
// --- Fonction de collecte automatique des mots incompris ---
window.logUnknownQuery = async function(query) {
    try {
        const { db, collection, addDoc, serverTimestamp } = await import('./firebase.js');
        await addDoc(collection(db, "ai_unknowns"), {
            phrase: query,
            date: serverTimestamp()
        });
    } catch (e) {
        console.error("Erreur d'enregistrement IA Inconnu :", e);
    }
};