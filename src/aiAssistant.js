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
        const q = query.toLowerCase();
        
        // Petite fonction pour vérifier si un mot d'une liste est présent
        const hasWord = (wordsArray) => wordsArray.some(word => q.includes(word));
        
        if (hasWord(['ajouter', 'nouveau', 'créer', 'entrer']) && hasWord(['produit', 'article', 'marchandise', 'stock'])) {
            return "Pour ajouter un produit, allez dans l'onglet 'Stock'. Ensuite, cliquez sur le bouton vert 'Nouveau Produit' en haut à droite. Remplissez le nom, le prix, et appuyez sur Enregistrer.";
        } else if (hasWord(['vendre', 'vente', 'encaisser', 'facturer', 'vendu'])) {
            return "Pour faire une vente, rendez-vous dans l'onglet 'Vente'. Cliquez sur les produits que vous souhaitez vendre pour les ajouter au panier, puis cliquez sur le bouton vert 'Encaisser' en bas à droite.";
        } else if (hasWord(['crédit', 'dette', 'doit', 'client', 'impayé'])) {
            return "Pour gérer les crédits, allez dans l'onglet 'Clients et Crédits'. Vous pourrez y ajouter un nouveau client et voir qui vous doit de l'argent.";
        } else if (hasWord(['bénéfice', 'rapport', 'bilan', 'chiffre', 'caisse', 'gagné', 'point'])) {
            return "Votre point financier, vos bénéfices et statistiques se trouvent dans l'onglet 'Bilan'. Vous pourrez y voir l'argent réel disponible.";
        } else {
            return "Je n'ai pas bien compris. Essayez de me demander par exemple : comment ajouter un article, comment faire une vente, ou comment voir mes bénéfices.";
        }
    }
}