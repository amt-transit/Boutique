import { showToast } from './ui.js';
import { db, doc, updateDoc, serverTimestamp } from './firebase.js';
import * as state from './state.js';

let codeReader = null;
let currentScannedCode = null;
let lastScanTimestamp = 0;


function showScanFeedback(message, type = 'success') {
    const readerDiv = document.getElementById('reader');
    if (!readerDiv) return;

    const existingFeedback = readerDiv.querySelector('.scan-feedback');
    if (existingFeedback) existingFeedback.remove();

    const feedbackEl = document.createElement('div');
    feedbackEl.className = `scan-feedback`;
    feedbackEl.textContent = message;
    
    const bgColor = type === 'success' ? 'rgba(22, 163, 74, 0.8)' : 'rgba(220, 38, 38, 0.8)'; 
    feedbackEl.style.backgroundColor = bgColor;
    
    readerDiv.appendChild(feedbackEl);

    setTimeout(() => {
        feedbackEl.style.opacity = '0';
        setTimeout(() => feedbackEl.remove(), 500);
    }, 1500);
}

window.startScanner = async function() {
    const modal = document.getElementById('scanner-modal');
    if(modal) modal.classList.remove('hidden');

    currentScannedCode = null;
    lastScanTimestamp = 0;
    
    if (typeof ZXing === 'undefined') {
        return showToast("Erreur: Librairie Scanner (ZXing) non chargée", "error");
    }

    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        const videoElement = document.getElementById('video-preview');
        
        codeReader.decodeFromConstraints(
            { 
                video: { 
                    facingMode: 'environment', 
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    advanced: [{ focusMode: "continuous" }] 
                } 
            },
            videoElement,
            (result, err) => {
                if (result) {
                    onScanSuccess(result.getText());
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Erreur de scan non-gérée:', err);
                }
            }
        );

        console.log(`Scanner démarré. En attente d'un code...`);

    } catch (e) {
        console.error("Erreur init scanner:", e);
        if (e.name === 'NotAllowedError') {
            showToast("L'accès à la caméra a été refusé.", "error");
        } else {
            showToast("Impossible de démarrer la caméra.", "error");
        }
        stopScanner();
    }
};

window.stopScanner = function() {
    const modal = document.getElementById('scanner-modal');
    if(modal) modal.classList.add('hidden');
    
    if (codeReader) {
        codeReader.reset();
        codeReader = null;
    }
};

async function onScanSuccess(decodedText) {
    let rawCode = decodedText.trim();
    const eanMatch = rawCode.match(/\b(\d{12,13})\b/);
    if (eanMatch) {
        decodedText = eanMatch[1];
    } else {
        decodedText = rawCode.toUpperCase();
    }

    const now = Date.now();
    if (decodedText === currentScannedCode && (now - lastScanTimestamp) < 2500) {
        return; 
    }
    lastScanTimestamp = now;
    currentScannedCode = decodedText;

    if (navigator.vibrate) navigator.vibrate(100);
    
    console.log(`Code traité : ${decodedText}`);

    if (state.isScanningForNewProduct) {
        window.stopScanner();
        
        const inputCode = document.getElementById('prod-code');
        if(inputCode) inputCode.value = decodedText;

        const existing = state.allProducts.find(p => p.codeBarre === decodedText && !p.deleted);
        if (existing) {
            showToast("Produit reconnu ! Combien en ajoutez-vous ?", "success");
            document.getElementById('prod-nom').value = existing.nomDisplay;
            document.getElementById('prod-achat').value = existing.prixAchat;
            document.getElementById('prod-prix').value = existing.prixVente;
            const qteInput = document.getElementById('prod-qte');
            if(qteInput) { qteInput.value = ""; qteInput.focus(); qteInput.select(); } 
        } else {
            showToast("Nouveau code ! Remplissez la fiche.", "success");
            document.getElementById('prod-nom').focus(); 
        }
        state.setIsScanningForNewProduct(false); 
        return;
    } 

    const productFound = state.allProducts.find(p => p.codeBarre === decodedText && !p.deleted);
    
    if (productFound) {
        new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(e=>{});
        
        const isVentePage = !document.getElementById('page-ventes').classList.contains('hidden');
        if (isVentePage) {
            state.addToCart(productFound);
            // This part needs to be handled carefully due to circular dependency
            window.renderCart(); // Assuming renderCart is global
            showScanFeedback(`✅ ${productFound.nomDisplay}`, 'success');
        } else {
            window.stopScanner();
            showToast(`Produit trouvé : ${productFound.nomDisplay}`, "success");
        }
    } else {
        window.stopScanner();
        openAssociationModal(decodedText);
    }
}

let pendingBarcode = null;

window.openAssociationModal = function(barcode) {
    pendingBarcode = barcode;
    document.getElementById('assoc-barcode-display').textContent = barcode;
    
    const searchInput = document.getElementById('assoc-search');
    if(searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => populateAssocSelect(e.target.value);
    }

    populateAssocSelect();
    
    document.getElementById('barcode-assoc-modal').classList.remove('hidden');
};

window.closeAssocModal = function() {
    pendingBarcode = null;
    document.getElementById('barcode-assoc-modal').classList.add('hidden');
};

function populateAssocSelect(searchTerm = '') {
    const select = document.getElementById('assoc-product-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Choisir un produit existant --</option>';
    select.innerHTML += '<option value="CREATE_NEW" class="font-bold text-blue-600">➕ Créer un NOUVEAU produit</option>';

    let filtered = state.allProducts.filter(p => !p.deleted);
    
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(p => p.nomDisplay.toLowerCase().includes(term));
    }

    filtered.sort((a, b) => a.nomDisplay.localeCompare(b.nomDisplay));

    filtered.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        const hasCode = p.codeBarre ? ` (Code existant écrasé)` : '';
        option.textContent = `${p.nomDisplay} - Stock: ${p.stock} ${hasCode}`;
        select.appendChild(option);
    });
}

window.confirmBarcodeAssociation = async function() {
    if (!pendingBarcode) return closeAssocModal();
    if (!state.currentBoutiqueId) return showToast("Erreur: Boutique non définie", "error");

    const select = document.getElementById('assoc-product-select');
    const selectedValue = select.value;

    if (!selectedValue) {
        return showToast("Veuillez sélectionner un produit ou choisir d'en créer un.", "error");
    }

    if (selectedValue === "CREATE_NEW") {
        closeAssocModal();
        window.switchTab('stock');
        document.getElementById('add-product-form').classList.remove('hidden');
        document.getElementById('prod-code').value = pendingBarcode;
        document.getElementById('prod-nom').focus();
        return showToast("Remplissez les infos pour ce nouveau produit.", "success");
    }

    try {
        const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", selectedValue);
        
        await updateDoc(pRef, {
            codeBarre: pendingBarcode,
            lastModified: serverTimestamp()
        });

        const productIndex = state.allProducts.findIndex(p => p.id === selectedValue);
        if (productIndex !== -1) {
            state.allProducts[productIndex].codeBarre = pendingBarcode;
        }

        showToast("Code-barres associé avec succès !", "success");
        closeAssocModal();

        const isVentePage = !document.getElementById('page-ventes').classList.contains('hidden');
        if (isVentePage && productIndex !== -1) {
            state.addToCart(state.allProducts[productIndex]);
            window.renderCart(); // Assuming renderCart is global
        }

    } catch (e) {
        console.error("Erreur association code barre:", e);
        showToast("Erreur lors de l'association", "error");
    }
};
