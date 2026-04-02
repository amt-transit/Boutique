// src/aiAssistant.js - Version améliorée avec détection bambara

// ════════════════════════════════════════════════════════════════
//  aiAssistant.js — Assistant intelligent "Ma Boutique" V3
//  Détection automatique Bambara + Correction phonétique avancée
// ════════════════════════════════════════════════════════════════
import { db, collection, addDoc, serverTimestamp } from './firebase.js';

export function setupAIAssistant() {
    // ── Éléments DOM ─────────────────────────────────────────────
    let lastUserQuery = "";
    let detectedLanguage = "fr"; // 'fr', 'bm' (bambara), 'mixed'
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
            
            const hour = new Date().getHours();
            let greeting = "Bonjour";
            if (hour >= 18) greeting = "Bonsoir";
            else if (hour < 5) greeting = "Bonne nuit";
            
            addMsg(`${greeting} ! 👋 Je suis votre assistant **Ma Boutique**.\n\nJe comprends le **français** et le **bambara** (dioula).\n\nPosez-moi une question ou choisissez une option ci-dessous !`, 'ai', 'salutation');
            showSuggestions(["Faire une vente", "Ajouter un produit", "Voir mes bénéfices", "I ni ce (Bonjour)"]);
        }
    });

    aiCloseBtn.addEventListener('click', () => {
        aiPanel.classList.add('hidden');
        aiPanel.classList.remove('flex');
        stopSpeaking();
    });

    // ── Zone de saisie texte ────────────────────────────
    if (!document.getElementById('ai-text-input')) {
        const bar = document.createElement('div');
        bar.className = "flex gap-2 px-3 pb-3 bg-white dark:bg-slate-800";
        bar.innerHTML = `
            <input id="ai-text-input" type="text" placeholder="Tapez votre question en français ou bambara..."
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

    // ── Reconnaissance vocale avec correction phonétique bambara ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        if (statusText) statusText.textContent = "Utilisez la saisie texte ↓";
        if (micBtn) { micBtn.disabled = true; micBtn.classList.add('opacity-40', 'cursor-not-allowed'); }
    } else {
        const rec = new SR();
        rec.lang = 'fr-FR'; // Forcé en français, mais on corrige après
        rec.interimResults = false;
        rec.maxAlternatives = 3; // Prendre plusieurs alternatives pour mieux détecter

        micBtn?.addEventListener('click', () => {
            if (isListening) rec.stop();
            else { stopSpeaking(); try { rec.start(); } catch(e) {} }
        });

        rec.onstart = () => { isListening = true; micPulse?.classList.remove('hidden'); if(statusText) statusText.textContent = "Je vous écoute..."; };
        rec.onspeechend = () => rec.stop();
        rec.onend = () => { isListening = false; micPulse?.classList.add('hidden'); if(statusText) statusText.textContent = "Micro ou texte ↓"; };
        
        rec.onresult = e => {
            // Prendre la meilleure alternative
            let transcript = e.results[0][0].transcript;
            
            // Vérifier les autres alternatives si la première ne correspond à aucun mot-clé bambara
            const isBambaraAlternative = (alt) => {
                const test = alt.toLowerCase();
                return BAMBARA_PATTERNS.some(pattern => test.includes(pattern));
            };
            
            // Si la première alternative ne contient pas de mot bambara, vérifier les autres
            if (!isBambaraAlternative(transcript) && e.results[0].length > 1) {
                for (let i = 1; i < e.results[0].length; i++) {
                    const alt = e.results[0][i].transcript;
                    if (isBambaraAlternative(alt)) {
                        transcript = alt;
                        break;
                    }
                }
            }
            
            handleInput(transcript);
        };
        
        rec.onerror = e => {
            isListening = false; micPulse?.classList.add('hidden');
            if (e.error === 'not-allowed') addMsg("⚠️ Accès au micro refusé. Utilisez le texte.", 'ai');
        };
    }

    // ════════════════════════════════════════════════════════════════
    //  CORPUS BAMBARA - Mots et expressions à détecter
    // ════════════════════════════════════════════════════════════════
    const BAMBARA_PATTERNS = [
        // Salutations
        "i ni ce", "inice", "aw ni ce", "awnice", "anice", "kori djam", "a ni sogor man", "ansogorman",
        "i ni baara", "inibaara", "barika", "a barika", "djarabi", "i ni tile", "i ni su",
        
        // Commerce / vente
        "feere", "fere", "féré", "sara", "wari", "songo", "songoro", "tono", "tonou", "minen", "minin",
        "juru", "djourou", "njuru", "dibi", "je fana", "kene", "nogo", "misen", "warimisen",
        
        // Stock / produits
        "fen", "fenw", "jogo", "bagage", "baara", "fanba", "donniya", "suguya", "cogo", "nyuman",
        
        // État / négation
        "banna", "te yen", "desi", "dese", "dogoya", "tinena", "tununa", "fili", "bana", "dogoya",
        
        // Fournisseurs / équipe
        "feerekela", "sugu tigi", "baarakela", "mogo", "kalan den",
        
        // Divers
        "interneti", "tariku", "kuma", "tugun", "deme", "makan", "wuli", "ci", "boli", "mako", "don",
        "nafo", "nafama", "geleya", "saba", "juju", "kun", "foto"
    ];
    
    // ════════════════════════════════════════════════════════════════
    //  CORRECTIONS PHONÉTIQUES - Transforme la sortie du micro français
    //  en mots bambara reconnaissables
    // ════════════════════════════════════════════════════════════════
    const PHONETIC_CORRECTIONS = {
        // Salutations
        "en ce moment": "a ni sogor man",
        "ans sur comment": "a ni sogor man",
        "han sur comment": "a ni sogor man",
        "année c'est comment": "a ni sogor man",
        "unisson": "i ni ce",
        "il n'y sait": "i ni ce",
        "initier": "i ni ce",
        "on y sait": "aw ni ce",
        "Annie ségou": "a ni sogor man",
        "et à tout": "i ni ce",
        "unice": "i ni ce",
        "unisse": "i ni ce",
        
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
        "sara": "sara", // déjà correct
        "tonneau": "tono",
        "tonnaud": "tono",
        
        // Crédits / dettes
        "jour où": "juru",
        "genou": "juru",
        "djourou": "juru",
        
        // Stock
        "minaine": "minen",
        "minine": "minen",
        "minant": "minen",
        
        // Divers
        "bara": "baara",
        "bas ras": "baara",
        "dame": "deme",
        "damé": "deme",
        "makan": "makan",
        "banane": "banna",
        "bana": "banna",
        "té y est": "te yen",
        "té yé": "te yen",
        "dési": "desi",
        "dézé": "desi"
    };
    
    // ════════════════════════════════════════════════════════════════
    //  DÉTECTION DE LA LANGUE (Bambara vs Français)
    // ════════════════════════════════════════════════════════════════
    function detectLanguage(text) {
        const lowerText = text.toLowerCase();
        
        // Compter les occurrences de motifs bambara
        let bambaraScore = 0;
        let frenchScore = 0;
        
        // Mots typiquement bambara
        BAMBARA_PATTERNS.forEach(pattern => {
            if (lowerText.includes(pattern)) {
                bambaraScore += pattern.length; // Plus long = plus significatif
            }
        });
        
        // Mots typiquement français (pour éviter les faux positifs)
        const frenchMarkers = ["je", "tu", "il", "elle", "nous", "vous", "ils", "elles", 
                               "comment", "pourquoi", "quand", "où", "est-ce que", "est-ce",
                               "veux", "peux", "sais", "fais", "dis", "va", "viens"];
        frenchMarkers.forEach(word => {
            if (lowerText.includes(word)) {
                frenchScore += 2;
            }
        });
        
        // Si score bambara significatif, retourner bambara
        if (bambaraScore > 3) return "bm";
        if (frenchScore > bambaraScore) return "fr";
        
        // Par défaut, essayer de deviner par la présence de mots spécifiques
        const hasBambaraGreeting = BAMBARA_PATTERNS.slice(0, 10).some(p => lowerText.includes(p));
        if (hasBambaraGreeting) return "bm";
        
        return "fr";
    }
    
    // ════════════════════════════════════════════════════════════════
    //  CORRECTION PHONÉTIQUE DU TEXTE RECONNU
    // ════════════════════════════════════════════════════════════════
    function correctPhonetic(text) {
        let corrected = text.toLowerCase();
        
        // Appliquer les corrections phonétiques
        Object.keys(PHONETIC_CORRECTIONS).forEach(bad => {
            if (corrected.includes(bad)) {
                corrected = corrected.replace(new RegExp(bad, 'gi'), PHONETIC_CORRECTIONS[bad]);
            }
        });
        
        // Correction des caractères spéciaux bambara
        corrected = corrected
            .replace(/ɛ/g, 'e')
            .replace(/ɔ/g, 'o')
            .replace(/ɲ/g, 'n');
        
        return corrected;
    }
    
    // ════════════════════════════════════════════════════════════════
    //  NORMALISATION POUR LA DÉTECTION (supprime accents)
    // ════════════════════════════════════════════════════════════════
    function normalizeText(text) {
        return text.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, '');
    }

    // ── Point d'entrée de traitement ─────────────────────────────
    function handleInput(rawText) {
        // ÉTAPE 1 : Appliquer les corrections phonétiques
        const correctedText = correctPhonetic(rawText);
        
        // ÉTAPE 2 : Détecter la langue
        const language = detectLanguage(correctedText);
        detectedLanguage = language;
        
        lastUserQuery = correctedText;
        
        // Nettoyer les suggestions précédentes
        chatBox.querySelectorAll('.ai-sugg').forEach(el => el.remove());
        
        // Afficher le message utilisateur (original ou corrigé ? On garde l'original pour l'affichage)
        addMsg(rawText, 'user', null, null, language === 'bm' ? 'bm' : 'fr');
        
        if (statusText) statusText.textContent = "Je réfléchis...";
        
        // Indicateur de frappe
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
            document.getElementById(typingId)?.remove();

            const { response, topic, suggestions, action } = getSmartResponse(correctedText, lastTopic, language);
            lastTopic = topic;
            addMsg(response, 'ai', topic, action, language);
            if (suggestions?.length) showSuggestions(suggestions);
            speak(response, language);
            if (statusText) statusText.textContent = "Micro ou texte ↓";

            if (topic === 'erreur') {
                window.logUnknownQuery(correctedText);
            }
        }, 800 + Math.random() * 600);
    }

    // ── Affichage UI avec indication de langue ───────────────────
    function addMsg(text, sender, topic = null, action = null, language = 'fr') {
        const d = document.createElement('div');
        const time = new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});

        if (sender === 'user') {
            // Afficher un petit indicateur de langue détectée
            const langIndicator = language === 'bm' ? '<span class="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full ml-2">Bambara</span>' : '';
            
            d.className = "flex flex-col items-end gap-0.5 mb-3 animate-fade-in-up";
            d.innerHTML = `
                <div class="bg-purple-600 text-white px-3 py-2 rounded-2xl rounded-tr-sm shadow-sm max-w-[88%] text-xs font-medium leading-relaxed">
                    ${escapeHtml(text)}
                    ${langIndicator}
                </div>
                <span class="text-[9px] text-slate-400 font-medium">${time}</span>`;
        } else {
            let actionBtnHtml = '';
            if (action) {
                actionBtnHtml = `<button onclick="window.switchTab('${action}'); document.getElementById('ai-close-btn').click();" class="mt-3 bg-purple-100 hover:bg-purple-200 text-purple-700 w-full py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-2 transition active:scale-95"><i data-lucide="external-link" class="w-3 h-3"></i> Y aller maintenant !</button>`;
            }

            let feedbackHtml = '';
            if (topic && topic !== 'salutation' && topic !== 'erreur') {
                const safeQuery = lastUserQuery.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                feedbackHtml = `
                <div class="flex items-center gap-3 mt-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                    <span class="text-[9px] text-slate-400 font-medium">Cette réponse vous a-t-elle aidé ?</span>
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

    // ════════════════════════════════════════════════════════════════
    //  SYNTHÈSE VOCALE BILINGUE
    // ════════════════════════════════════════════════════════════════
    function speak(text, language = 'fr') {
        if (!window.speechSynthesis) return;
        stopSpeaking();
        
        // Nettoyage du texte pour la voix
        let clean = text
            .replace(/<[^>]*>/g, '')
            .replace(/\*\*/g, '')
            .replace(/[→↑↓←]/g, '')
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
            .replace(/\n/g, '. ')
            .substring(0, 300);
        
        // Dictionnaire phonétique pour la voix (évite les erreurs de prononciation)
        const phonetics = {
            "I ni ce": "I ni tsé", "i ni ce": "i ni tsé",
            "Aw ni ce": "Ao ni tsé", "aw ni ce": "ao ni tsé",
            "I ni baara": "I ni bara", "i ni baara": "i ni bara",
            "Feere": "Féré", "feere": "féré",
            "Sara": "Sara", "sara": "sara",
            "Wari": "Ouari", "wari": "ouari",
            "Songo": "Sonnguo", "songo": "sonnguo",
            "Tono": "Tonou", "tono": "tonou",
            "Juru": "Djourou", "juru": "djourou"
        };
        
        let spokenText = clean;
        Object.keys(phonetics).forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            spokenText = spokenText.replace(regex, phonetics[word]);
        });

        const u = new SpeechSynthesisUtterance(spokenText);
        u.lang = language === 'bm' ? 'fr-FR' : 'fr-FR'; // La voix reste française car pas de voix bambara native
        u.rate = 1.05;
        u.pitch = 1.0;
        
        const frVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr') && v.localService);
        if (frVoice) u.voice = frVoice;
        
        window.speechSynthesis.speak(u);
    }

    function stopSpeaking() { window.speechSynthesis?.cancel(); }

    // ════════════════════════════════════════════════════════════════
    //  MOTEUR DE RÉPONSES BILINGUE
    // ════════════════════════════════════════════════════════════════
    function getSmartResponse(query, prevTopic, language = 'fr') {
        const nQuery = normalizeText(query);
        
        const hasWord = words => words.some(w => nQuery.includes(normalizeText(w)));
        const countWords = words => words.filter(w => nQuery.includes(normalizeText(w))).length;
        const isNegative = hasWord(['pas', 'bug', 'erreur', 'marche pas', 'probleme', 'impossible', 'te', 'bila']);
        const isFollowUp = hasWord(['et aussi', 'encore', 'autre', 'et pour', 'et si', 'ani', 'tugun']);

        // Score par sujet (mots-clés bilingues)
        const scores = {
            salutation: countWords(['bonjour', 'salut', 'coucou', 'hello', 'bjr', 'i ni ce', 'aw ni ce', 'inice', 'awnice', 'anice', 'djam', 'kori djam', 'a ni sogor man']),
            merci: countWords(['merci', 'super', 'parfait', 'genial', 'top', 'cimer', 'barika', 'a barika', 'djarabi', 'i ni baara']),
            aide: countWords(['aide', 'aider', 'apprendre', 'debut', 'fonction', 'comment faire', 'deme', 'n deme', 'makan']),
            vente: countWords(['vente', 'vendre', 'encaisser', 'caisse', 'panier', 'ticket', 'facture', 'paiement', 'feere', 'fere', 'féré', 'wuli', 'sara', 'wari sara', 'ci', 'fen feere']),
            remise: countWords(['remise', 'reduction', 'promo', 'discount', 'moins cher', 'rabais', 'do bo a la', 'a do bo', 'nogo']),
            monnaie: countWords(['monnaie', 'fond caisse', 'fonds de caisse', 'matin', 'demarrer', 'jeton', 'wari misen', 'warimisen', 'misen']),
            credit: countWords(['credit', 'dette', 'doit', 'impaye', 'rembourser', 'client', 'pret', 'juru', 'djourou', 'njuru', 'dibi', 'je fana', 'kene', 'wari to']),
            commande: countWords(['commande', 'reserver', 'livraison', 'livrer', 'livreur', 'route', 'preparation', 'expedier', 'ci']),
            stock: countWords(['stock', 'produit', 'article', 'marchandise', 'inventaire', 'quantite', 'ajouter', 'nouveau', 'minen', 'fen', 'jogo', 'bagage', 'baara', 'fanba', 'donniya']),
            variante: countWords(['variante', 'taille', 'couleur', 'pointure', 'modele', 'declinaison', 'suguya', 'cogo', 'nyuman']),
            rupture: countWords(['rupture', 'epuise', 'bas', 'alerte', 'manque', 'faible', 'banna', 'te yen', 'desi', 'dese', 'dogoya']),
            perte: countWords(['perte', 'perime', 'casse', 'vole', 'manquant', 'signaler', 'tinena', 'tununa', 'fili', 'bana']),
            code_barre: countWords(['code barre', 'scanner', 'etiquette', 'imprimer', 'barcode', 'qr', 'flash', 'foto']),
            depense: countWords(['depense', 'charge', 'facture', 'loyer', 'transport', 'cie', 'sodeci', 'sortie', 'frais', 'wari bo', 'boli', 'mako']),
            bilan: countWords(['benefice', 'bilan', 'rapport', 'chiffre', 'gagne', 'recette', 'rentable', 'profit', 'tono', 'tono soro', 'nafama', 'wari to', 'geleya', 'saba']),
            capital: countWords(['fonds investi', 'capital', 'mise de depart', 'investi', 'fond de depart', 'budget', 'wari juju', 'wari kun']),
            fournisseur: countWords(['fournisseur', 'grossiste', 'approvisionnement', 'achat', 'contact', 'feerekela', 'sugu tigi']),
            catalogue: countWords(['catalogue', 'en ligne', 'internet', 'lien', 'partager', 'whatsapp', 'site', 'vitrine', 'interneti']),
            equipe: countWords(['equipe', 'vendeur', 'employe', 'gerant', 'acces', 'compte', 'utilisateur', 'ajouter personne', 'baarakela', 'mogo', 'kalan den']),
            audit: countWords(['audit', 'journal', 'historique', 'trace', 'mouvement', 'supprime', 'erreur', 'log', 'kuma', 'tariku'])
        };

        if (prevTopic && scores[prevTopic] > 0) scores[prevTopic] += 1.5;
        if (isFollowUp && prevTopic) scores[prevTopic] += 2;

        const bestTopic = Object.entries(scores).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])[0]?.[0];

        // Base de connaissances bilingue
        const KB = {
            salutation: { 
                r_fr: "Bonjour ! 👋 Prêt à gérer votre boutique ?\n\nQue souhaitez-vous faire ?", 
                r_bm: "I ni ce ! 👋 Bonjour ! Prêt à gérer votre boutique ?\n\nQue souhaitez-vous faire ?", 
                s_fr: ["Vendre", "Voir le stock", "Bénéfice"], 
                s_bm: ["Vendre (Feere)", "Voir le stock (Minen)", "Bénéfice (Tono)"] 
            },
            merci: { 
                r_fr: "Avec grand plaisir ! 😊 Je suis là pour vous aider.", 
                r_bm: "I ni baara ! Avec grand plaisir ! 😊 Je suis là pour vous aider.", 
                s_fr: ["Vendre", "Ajouter marchandise"] 
            },
            vente: { 
                r_fr: "📦 **Pour vendre :**\n\n1️⃣ Allez dans l'onglet **Vente** (Caisse)\n2️⃣ Touchez les articles pour les ajouter au panier\n3️⃣ Cliquez sur le bouton vert **ENCAISSER**", 
                r_bm: "📦 **Pour vendre (Ka feere kɛ) :**\n\n1️⃣ Allez dans l'onglet **Vente** (Caisse)\n2️⃣ Touchez les articles pour les ajouter au panier\n3️⃣ Cliquez sur le bouton vert **ENCAISSER**", 
                s_fr: ["Crédit", "Remise", "Mobile Money"], 
                s_bm: ["Crédit (Juru)", "Remise (A dɔ bɔ)", "Mobile Money"], action: "ventes" 
            },
            credit: { 
                r_fr: "👥 **Crédit client :**\n\n→ **Donner à crédit :** Dans Vente, bouton orange 'Crédit Client'\n→ **Encaisser un crédit :** Allez dans l'onglet **Clients & Crédits** et cliquez sur 'Payer'", 
                r_bm: "👥 **Crédit client (Juru) :**\n\n→ **Donner à crédit :** Dans Vente, bouton orange 'Crédit Client'\n→ **Encaisser un crédit :** Allez dans l'onglet **Clients & Crédits** et cliquez sur 'Payer'", 
                s_fr: ["Payer un crédit"], action: "credits" 
            },
            stock: { 
                r_fr: "📦 **Gestion du stock :**\n\n→ **Ajouter :** Onglet **Stock** → 'Nouveau Produit'\n→ **Modifier :** Cliquez sur un produit dans la liste\n→ **Variantes :** Cochez la case bleue 'Variantes'", 
                r_bm: "📦 **Gestion du stock (Minen) :**\n\n→ **Ajouter :** Onglet **Stock** → 'Nouveau Produit'\n→ **Modifier :** Cliquez sur un produit dans la liste\n→ **Variantes :** Cochez la case bleue 'Variantes'", 
                s_fr: ["Perte", "Prix"], 
                s_bm: ["Perte (Tiɲɛna)", "Prix (Songo)"], action: "stock" 
            },
            depense: { 
                r_fr: "💸 **Dépenses :**\n\nPour les factures, le transport ou la nourriture, allez dans l'onglet **Dépenses** pour tout enregistrer.", 
                r_bm: "💸 **Dépenses (Wari bɔ) :**\n\nPour les factures, le transport ou la nourriture, allez dans l'onglet **Dépenses** pour tout enregistrer.", 
                s_fr: ["Bénéfice"], 
                s_bm: ["Bénéfice (Tono)"], action: "charges" 
            },
            bilan: { 
                r_fr: "📊 **Bénéfices :**\n\nL'onglet **Bilan** calcule votre argent, vos ventes, dépenses et bénéfice net. Vous pouvez filtrer par date et exporter en PDF.", 
                r_bm: "📊 **Bénéfices (Tono) :**\n\nL'onglet **Bilan** calcule votre argent, vos ventes, dépenses et bénéfice net. Vous pouvez filtrer par date et exporter en PDF.", 
                s_fr: ["Exporter PDF", "Dépense"], 
                s_bm: ["Exporter PDF", "Dépense (Wari bɔ)"], action: "rapports" 
            },
            catalogue: { 
                r_fr: "🌐 **Catalogue en ligne :**\n\nAllez dans votre **Profil** ⚙️ → cliquez sur **Copier** pour obtenir le lien à partager à vos clients par WhatsApp !", 
                r_bm: "🌐 **Catalogue en ligne (Interneti) :**\n\nAllez dans votre **Profil** ⚙️ → cliquez sur **Copier** pour obtenir le lien à partager à vos clients par WhatsApp !", 
                s_fr: ["Voir les commandes"] 
            }
        };

        const fallback = {
            r_fr: isNegative 
                ? "Un problème ? 🤔 Dites-moi simplement : 'Je veux vendre' ou 'Voir le bénéfice'." 
                : "Je n'ai pas bien compris. Parlez-moi simplement :\n\n→ **Vendre**\n→ **Bénéfice**\n→ **Crédit**\n→ **Stock**\n\nEssayez aussi en **bambara** si vous préférez !",
            r_bm: isNegative 
                ? "Un problème ? 🤔 Dites-moi simplement : 'Je veux vendre' ou 'Voir le bénéfice'." 
                : "Je n'ai pas bien compris. Parlez-moi simplement :\n\n→ **'Feere'** (Vendre)\n→ **'Tono'** (Bénéfice)\n→ **'Juru'** (Crédit)\n→ **'Minen'** (Stock)",
            s_fr: ["Vendre", "Stock", "Bénéfice", "I ni ce (Bonjour)"],
            s_bm: ["Vendre (Feere)", "Stock (Minen)", "Bénéfice (Tono)", "I ni ce (Bonjour)"]
        };

        const result = bestTopic && KB[bestTopic] ? KB[bestTopic] : fallback;
        const useBambara = (language === 'bm') || (bestTopic === null && nQuery.includes('i ni ce'));

        return {
            response: useBambara ? (result.r_bm || result.r_fr) : result.r_fr,
            topic: bestTopic || 'erreur',
            suggestions: useBambara ? (result.s_bm || result.s_fr) : result.s_fr,
            action: result.action || null
        };
    }
}

// ════════════════════════════════════════════════════════════════
//  FONCTIONS GLOBALES
// ════════════════════════════════════════════════════════════════

async function autoLogUnknown(query) {
    try {
        await addDoc(collection(db, "ai_unknowns"), {
            phrase: query,
            date: serverTimestamp(),
            resolved: false
        });
        console.log("✔️ Mot inconnu enregistré dans Firebase");
    } catch (e) {
        console.error("❌ Erreur Firebase :", e);
    }
}

window.rateAI = async function(query, topic, isHelpful, btnElement) {
    try {
        await addDoc(collection(db, "ai_learning"), {
            phrase: query,
            sujet_devine: topic,
            correct: isHelpful,
            date: serverTimestamp()
        });

        const container = btnElement.parentElement;
        container.innerHTML = `<span class="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><i data-lucide="check-circle-2" class="w-3 h-3"></i> Merci ! L'IA va s'améliorer.</span>`;
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.error("Erreur apprentissage :", e);
    }
}

window.logUnknownQuery = async function(query) {
    try {
        const { db, collection, addDoc, serverTimestamp } = await import('./firebase.js');
        await addDoc(collection(db, "ai_unknowns"), {
            phrase: query,
            date: serverTimestamp()
        });
    } catch (e) {
        console.error("Erreur enregistrement :", e);
    }
};