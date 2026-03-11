// src/admin/import.js
import { db, collection, doc, writeBatch, increment, serverTimestamp, getDocs } from '../firebase.js';
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
    loadShopsForImport();
}

async function loadShopsForImport() { 
    const s = document.getElementById('import-target-shop'); 
    if(!s) return; 
    
    // We assume allShopsList is populated by the admin dashboard setup
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
    
    const fileInputId = `csv-${type === 'products' ? 'stock' : type}`;
    const fileInput = document.getElementById(fileInputId);
    if(!fileInput) return;
    const f = fileInput.files[0];
    
    if(!f) return showToast("Veuillez sélectionner un fichier CSV.", "error");
    
    const progressContainer = document.getElementById('import-progress-container');
    if(progressContainer) progressContainer.classList.remove('hidden');
    
    Papa.parse(f, { 
        header: true, 
        skipEmptyLines: true, 
        complete: async (r) => { 
            if(confirm(`Confirmer l'import de ${r.data.length} lignes ?`)) {
                await uploadBatchData(id, type, r.data); 
                fileInput.value = "";
            } else {
                if(progressContainer) progressContainer.classList.add('hidden');
            }
        },
        error: () => {
            showToast("Erreur de lecture du fichier CSV.", "error");
            if(progressContainer) progressContainer.classList.add('hidden');
        }
    });
};
