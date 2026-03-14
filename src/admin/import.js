// src/admin/import.js
import { db, collection, doc, writeBatch, increment, serverTimestamp, getDocs, addDoc } from '../firebase.js';
import { showToast } from '../ui.js';
import * as state from '../state.js';

async function logAdminAction(actionType, details) {
    // This is duplicated from admin/main.js, could be moved to a shared admin helper
    try {
        await addDoc(collection(db, "admin_logs"), {
            action: actionType,
            details: details,
            date: serverTimestamp(),
            adminId: state.userId
        });
    } catch (e) {
        console.error("Erreur enregistrement log:", e);
    }
}

export function setupImport() {
    // Rendre la fonction accessible pour le bouton HTML onclick="loadShopsForImport()"
    window.loadShopsForImport = loadShopsForImport;
    loadShopsForImport();
}

async function loadShopsForImport() { 
    const s = document.getElementById('import-target-shop'); 
    if(!s) return; 

    // Si la liste est vide, on force le chargement depuis la DB
    if (!state.allShopsList || state.allShopsList.length === 0) {
        const snap = await getDocs(collection(db, "boutiques"));
        const list = [];
        snap.forEach(d => list.push({id: d.id, ...d.data()}));
        state.setAllShopsList(list);
    }
    
    s.innerHTML = '<option value="">-- Choisir --</option>'; 
    state.allShopsList.forEach(b => { 
        const o = document.createElement('option'); 
        o.value = b.id; o.textContent = b.nom; 
        s.appendChild(o); 
    }); 
}

async function uploadBatchData(id, n, d) {
    if (!id || typeof id !== 'string' || id.length < 5) {
        return showToast("Erreur interne : ID de boutique invalide.", "error");
    }

    let productMap = {};
    let errors = [];

    // Pre-fetch existing products for sales import to avoid multiple reads
    if (n === 'ventes') {
        const productsSnapshot = await getDocs(collection(db, "boutiques", id, "products"));
        productsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.nom) productMap[data.nom.toLowerCase().trim()] = doc.id;
        });
    }
    
    let batch = writeBatch(db);
    let batchSize = 0;
    let countNew = 0;
    
    const totalLines = d.length;
    const progressBar = document.getElementById('import-progress-bar');
    const progressText = document.getElementById('import-progress-text');

    for (const [i, r] of d.entries()) {
        const excelLineNumber = i + 2;

        if (i % 50 === 0 && progressBar && progressText) {
            const percent = Math.round((i / totalLines) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${i} / ${totalLines} lignes traitées...`;
            // Force le navigateur à faire une pause pour dessiner la barre de progression
            await new Promise(resolve => setTimeout(resolve, 15)); 
        }

        if (!r.Nom && !r.Produit && !r.Motif) {
            errors.push({ ligne: excelLineNumber, msg: "Ligne ignorée : Données clés manquantes." });
            continue;
        }

        let o = {};

        try {
            if (n === 'products') {
                let pv = parseFloat(r.PrixVente?.replace(',', '.')) || 0;
                let pa = parseFloat(r.PrixAchat?.replace(',', '.')) || 0;
                if (pv <= 0) errors.push({ ligne: excelLineNumber, msg: `Attention : Prix de vente à 0 pour '${r.Nom}'.` });
                o = { nom: r.Nom.toLowerCase().trim(), nomDisplay: r.Nom.trim(), prixVente: pv, prixAchat: pa, stock: parseInt(r.Quantite) || 0, quantiteVendue: 0, createdAt: serverTimestamp(), deleted: false };
            } else if (n === 'clients') {
                o = { nom: r.Nom, telephone: r.Telephone || '', dette: parseFloat(r.Dette) || 0, createdAt: serverTimestamp(), deleted: false };
            } else if (n === 'expenses') {
                o = { date: r.Date ? new Date(r.Date) : serverTimestamp(), motif: r.Motif || 'Import', montant: parseFloat(r.Montant) || 0, user: state.userId, deleted: false };
            } else if (n === 'ventes') {
                const q = parseInt(r.Quantite) || 1;
                const p = parseFloat(r.PrixUnitaire || r.Total) || 0;
                const ft = q * p;
                const prof = parseFloat(r.Profit) || 0;

                const searchName = (r.Produit || '').trim().toLowerCase();
                const prodId = productMap[searchName];

                if (prodId) {
                    const prodRef = doc(db, "boutiques", id, "products", prodId);
                    batch.update(prodRef, { stock: increment(-q), quantiteVendue: increment(q) });
                } else {
                    errors.push({ ligne: excelLineNumber, msg: `Stock non mis à jour : Produit '${r.Produit}' inconnu.` });
                }
                
                const fi = { id: prodId || 'imp_unknown', nom: searchName, nomDisplay: r.Produit, qty: q, prixVente: p, prixAchat: 0 };
                o = { date: r.Date ? new Date(r.Date) : serverTimestamp(), total: ft, profit: prof, items: [fi], type: 'cash_import', vendeurId: state.userId, deleted: false };
            }
            
            // Use addDoc to let Firestore generate the ID
            const ref = doc(collection(db, "boutiques", id, n));
            batch.set(ref, o);

            countNew++;
            batchSize++;

            if (batchSize >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                batchSize = 0;
            }

        } catch (e) {
            errors.push({ ligne: excelLineNumber, msg: e.message || "Erreur de formatage." });
        }
    }

    if (batchSize > 0) await batch.commit();

    if (progressBar) progressBar.style.width = '100%';
    if (progressText) progressText.textContent = `${totalLines} / ${totalLines} lignes analysées.`;
    
    const titleStatus = document.getElementById('import-status-title');
    if (titleStatus) {
        const icon = errors.length > 0 ? 'alert-triangle' : 'check-circle';
        const color = errors.length > 0 ? 'text-orange-500' : 'text-green-500';
        titleStatus.innerHTML = `<i data-lucide="${icon}" class="${color} w-5 h-5"></i> Import Terminé`;
        if (window.lucide) window.lucide.createIcons();
    }
    
    if (errors.length > 0) {
        const reportArea = document.getElementById('import-report-area');
        const reportBody = document.getElementById('import-report-body');
        if (reportArea && reportBody) {
            reportArea.classList.remove('hidden');
            reportBody.innerHTML = errors.map(err => `
                <tr class="hover:bg-orange-100 transition"><td class="p-2 font-bold text-orange-900 border-r border-orange-100">Ligne ${err.ligne}</td><td class="p-2 text-orange-800">${err.msg}</td></tr>
            `).join('');
        }
    }

    logAdminAction("IMPORT_CSV", `Type: ${n} | Ajoutés: ${countNew} | Erreurs: ${errors.length} | Cible: ${id}`);
    
    let msg = `Terminé : ${countNew} lignes importées.`;
    if (errors.length > 0) msg += ` Voir rapport d'erreurs.`;
    
    showToast(msg, errors.length > 0 ? "warning" : "success");
}

window.processImport = async function(type) {
    const shopSelect = document.getElementById('import-target-shop');
    const id = shopSelect.value;
    
    if(!id) return showToast("ERREUR : Aucune boutique sélectionnée !", "error");
    
    let fileTypeStr = type;
    if (type === 'products') fileTypeStr = 'stock';
    if (type === 'ventes') fileTypeStr = 'sales'; // Correction du bug de l'ID
    
    const fileInputId = `csv-${fileTypeStr}`;
    const fileInput = document.getElementById(fileInputId);
    if(!fileInput) return;
    const f = fileInput.files[0];
    
    if(!f) return showToast("Veuillez sélectionner un fichier CSV.", "error");
    
    Papa.parse(f, { 
        header: true, 
        skipEmptyLines: true, 
        complete: async (r) => { 
            showImportPreview(id, type, r.data, fileInput);
        },
        error: () => {
            showToast("Erreur de lecture du fichier CSV.", "error");
        }
    });
};

function showImportPreview(shopId, type, data, fileInput) {
    if (!data || data.length === 0) {
        return showToast("Le fichier CSV est vide ou mal formaté.", "error");
    }

    let modal = document.getElementById('import-preview-modal');
    
    // Si la modale n'existe pas dans le DOM (ex: app.html non mis à jour), on la crée dynamiquement
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'import-preview-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-60 hidden flex-col items-center justify-center z-[250] p-4 backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-white p-6 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col animate-fade-in-up">
                <div class="flex justify-between items-center mb-4 border-b pb-3">
                    <h3 class="text-xl font-extrabold text-gray-800 flex items-center gap-2" id="import-preview-title"><i data-lucide="file-spreadsheet" class="text-blue-500"></i> Prévisualisation de l'import</h3>
                    <button id="btn-close-import-preview" class="bg-gray-100 hover:bg-gray-200 p-2 rounded-full text-gray-600 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
                <div class="overflow-auto flex-1 border border-gray-200 rounded-xl bg-white mb-4 shadow-inner">
                    <table class="w-full text-left text-sm whitespace-nowrap">
                        <thead id="import-preview-head" class="text-xs uppercase text-gray-600 sticky top-0 shadow-sm">
                        </thead>
                        <tbody id="import-preview-body" class="divide-y divide-gray-100">
                        </tbody>
                    </table>
                </div>
                <div class="flex justify-end gap-3 pt-2">
                    <button id="btn-cancel-import" class="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition">Annuler</button>
                    <button id="btn-confirm-import" class="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2 transition transform hover:-translate-y-0.5">
                        <i data-lucide="upload-cloud" class="w-5 h-5"></i> Lancer l'importation
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) window.lucide.createIcons();
    }

    const title = document.getElementById('import-preview-title');
    const thead = document.getElementById('import-preview-head');
    const tbody = document.getElementById('import-preview-body');
    
    const typeNames = { 'products': 'Stock', 'clients': 'Clients', 'expenses': 'Charges', 'ventes': 'Ventes' };
    title.innerHTML = `Prévisualisation : ${typeNames[type] || type} <span class="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded ml-2">${data.length} lignes trouvées</span>`;

    // En-têtes dynamiques
    const headers = Object.keys(data[0]);
    thead.innerHTML = `<tr><th class="p-3 border-r bg-gray-200">#</th>${headers.map(h => `<th class="p-3 border-r bg-gray-200">${h}</th>`).join('')}</tr>`;

    // Contenu du tableau (limité à 300 pour éviter de faire planter le navigateur sur de gros fichiers, mais toutes seront importées)
    const displayData = data.slice(0, 300);
    let rowsHtml = '';
    displayData.forEach((row, index) => {
        rowsHtml += `<tr class="hover:bg-blue-50 border-b transition">
            <td class="p-2 border-r text-gray-400 font-mono text-xs">${index + 1}</td>
            ${headers.map(h => `<td class="p-2 border-r text-gray-700 truncate max-w-xs">${row[h] || ''}</td>`).join('')}
        </tr>`;
    });
    
    if (data.length > 300) {
        rowsHtml += `<tr><td colspan="${headers.length + 1}" class="p-4 text-center text-gray-500 font-bold bg-gray-50">... et ${data.length - 300} autres lignes non affichées.</td></tr>`;
    }
    tbody.innerHTML = rowsHtml;

    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Force l'affichage par dessus les règles Tailwind de base

    // Configuration du bouton de validation
    document.getElementById('btn-confirm-import').onclick = async () => {
        modal.classList.add('hidden');
        modal.style.display = '';
        const progressContainer = document.getElementById('import-progress-container');
        
        if(progressContainer) {
            progressContainer.classList.remove('hidden');
            const progressBar = document.getElementById('import-progress-bar');
            const progressText = document.getElementById('import-progress-text');
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = 'Préparation...';
            const titleStatus = document.getElementById('import-status-title');
            if (titleStatus) titleStatus.innerHTML = '<i data-lucide="loader-2" class="animate-spin text-blue-500 w-5 h-5"></i> Importation en cours...';
            const reportArea = document.getElementById('import-report-area');
            if (reportArea) reportArea.classList.add('hidden');
            if (window.lucide) window.lucide.createIcons();
        }
        
        await uploadBatchData(shopId, type, data); 
        fileInput.value = ""; 
    };

    // Configuration du bouton annuler
    document.getElementById('btn-cancel-import').onclick = () => {
        modal.classList.add('hidden');
        modal.style.display = '';
        fileInput.value = "";
    };

    // Configuration du bouton croix (X) en haut à droite
    const btnClose = document.getElementById('btn-close-import-preview') || document.querySelector('#import-preview-modal button[onclick*="hidden"]');
    if (btnClose) {
        btnClose.onclick = () => {
            modal.classList.add('hidden');
            modal.style.display = '';
            if (fileInput) fileInput.value = "";
        };
    }
}
