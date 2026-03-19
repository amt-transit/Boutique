// src/pages/reports.js
import { db, getDocs, collection, doc, getDoc, updateDoc, writeBatch, increment, serverTimestamp } from '../firebase.js'; 
import { showToast, formatPrice, showConfirmModal } from '../ui.js';
import * as state from '../state.js';

function renderReportsTable() {
    const tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '';
    
    let filtered = [...state.loadedTransactions];

    const searchInput = document.getElementById('reports-search');
    if(searchInput && searchInput.value) { 
        const term = searchInput.value.toLowerCase(); 
        filtered = filtered.filter(t => t.desc.toLowerCase().includes(term) || t.type.toLowerCase().includes(term)); 
    }

    const sortSelect = document.getElementById('reports-sort');
    if(sortSelect) { 
        const sort = sortSelect.value; 
        filtered.sort((a, b) => { 
            if(sort === 'date_desc') return b.date - a.date; 
            if(sort === 'date_asc') return a.date - b.date; 
            if(sort === 'amount_desc') return b.amount - a.amount; 
            return 0; 
        }); 
    }

    let totalEncaisse = 0; 
    let totalSorties = 0;
    state.loadedTransactions.forEach(t => { 
        if(t.isExpense) totalSorties += t.amount; 
        else if (t.isEffectiveEntry) totalEncaisse += t.amount; 
    });

    filtered.forEach(t => {
        const row = document.createElement('tr');
        let classMontant = ''; 
        let classType = 'text-gray-500';
        if (t.type === 'RETOUR' || t.type === 'RETOUR_CR') { classMontant = 'text-red-600 font-bold'; classType = 'text-red-500'; } 
        else if (t.isExpense) { classMontant = 'text-red-600 font-bold'; classType = 'text-red-400'; } 
        else if (t.type === 'ACHAT') { classMontant = 'text-red-600 font-bold'; classType = 'text-blue-500'; }
        else if (t.isCreditSale) { classMontant = 'text-orange-400 italic'; classType = 'text-orange-400'; } 
        else if (t.type === 'MOMO') { classMontant = 'text-teal-600 font-bold'; classType = 'text-teal-600'; }
        else { classMontant = 'text-green-600 font-bold'; classType = 'text-green-600'; } 

        let returnBtn = "";
        if (state.userRole === 'admin' && (t.type === 'VENTE' || t.type === 'CRÉDIT') && !t.isReturned) {
            returnBtn = `<button onclick="processReturn('${t.id}')" class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200 ml-2 border border-red-200" title="Retour">Retour</button>`;
        } else if (t.isReturned) {
            returnBtn = `<span class="text-xs text-gray-400 ml-2">(Annulé)</span>`;
            row.classList.add('opacity-50'); 
        }

        row.className = "border-b hover:bg-gray-50 transition";
        row.innerHTML = `<td class="p-3 text-xs">${t.date.toLocaleString()}</td><td class="p-3 text-sm text-gray-700">${t.desc} ${returnBtn}</td><td class="p-3 text-center text-xs font-bold ${classType}">${t.type}</td><td class="p-3 text-right ${!t.isExpense && !t.type.includes('RETOUR')?classMontant:'text-gray-300'}">${!t.isExpense && !t.type.includes('RETOUR')?formatPrice(t.amount):'-'}</td><td class="p-3 text-right ${t.isExpense || t.type.includes('RETOUR')?classMontant:'text-gray-300'}">${t.isExpense || t.type.includes('RETOUR')?formatPrice(t.amount):'-'}</td>`;
        tbody.appendChild(row);
    });

    if (state.userRole !== 'seller') {
        const caisseInput = document.getElementById('caisse-initiale-input');
        const caisseInitiale = parseFloat(caisseInput.value) || 0;
        const totalDispo = caisseInitiale + totalEncaisse;
        document.getElementById('report-total-dispo').textContent = formatPrice(totalDispo);
        document.getElementById('report-only-sales').textContent = formatPrice(totalEncaisse);
        document.getElementById('report-total-expenses').textContent = formatPrice(totalSorties);
        document.getElementById('report-balance').textContent = formatPrice(totalDispo - totalSorties);
    }
};

async function loadData() {
    if (!state.currentBoutiqueId) return;
    const tbody = document.getElementById('reports-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Chargement...</td></tr>';
    
    const dateStart = document.getElementById('report-date-start');
    const dateEnd = document.getElementById('report-date-end');

    try {
        const salesSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
        const expSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "expenses"));
        const stockSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"));
        
        let transactions = [];
        salesSnap.forEach(doc => {
            const s = doc.data();
            if(s.deleted) return; 
            let desc = "", typeLabel = "VENTE", isEffectiveEntry = false, isCreditSale = false, isExpense = false;
            
            if (s.type === 'remboursement') { desc = `💰 <strong>Remboursement</strong> (${s.clientName || 'Client'})`; typeLabel = "REMB."; isEffectiveEntry = true; } 
            else {
                let pList = s.items ? s.items.map(i => {
                    let nom = i.nomDisplay || i.nom;
                    if (i.basePrice !== undefined && i.prixVente !== i.basePrice) {
                        nom = `<span class="text-purple-600 font-bold bg-purple-50 border border-purple-200 px-1 rounded-md" title="Prix de base: ${formatPrice(i.basePrice)}">🏷️ ${nom}</span>`;
                    }
                    return `${nom} (${i.qty}x${formatPrice(i.prixVente)})`;
                }).join(', ') : 'Vente'; 
                
                if (s.remise > 0) {
                    pList += ` <span class="text-red-500 font-bold text-xs bg-red-50 border border-red-100 px-1 rounded">- Remise: ${formatPrice(s.remise)}</span>`;
                }
                
                if (s.type === 'retour') { desc = `↩️ <strong>Retour Marchandise</strong> : ${pList}`; typeLabel = "RETOUR"; isExpense = true; }
                else if (s.type === 'retour_credit') { desc = `↩️ <strong>Retour Crédit</strong> : ${pList}`; typeLabel = "RETOUR_CR"; isExpense = false; }
                else if (s.type === 'credit') { desc = `👤 <strong>${s.clientName}</strong> : ${pList} <span class="text-xs bg-orange-100 text-orange-600 px-1 rounded ml-1">Non Payé</span>`; typeLabel = "CRÉDIT"; isCreditSale = true; } 
                else if (s.type === 'mobile_money') { desc = `📱 <strong class="text-teal-700">${s.clientName}</strong> : ${pList}`; typeLabel = "MOMO"; isEffectiveEntry = true; }
                else { desc = s.clientName ? `👤 <strong>${s.clientName}</strong> : ${pList}` : pList; typeLabel = "CASH"; isEffectiveEntry = true; } 
            }
            transactions.push({ id: doc.id, date: s.date?.toDate(), desc, type: typeLabel, amount: s.total||0, isExpense, isEffectiveEntry, isCreditSale, isReturned: s.isReturned, originalItems: s.items });
        });
        
        expSnap.forEach(doc => { 
            const e = doc.data(); 
            if(e.deleted) return; 
            if(e.type === 'entree') {
                transactions.push({ date: e.date?.toDate(), desc: `🟢 ${e.motif}`, type: 'APPORT', amount: e.montant||0, isExpense: false, isEffectiveEntry: true }); 
            } else {
                transactions.push({ date: e.date?.toDate(), desc: `🔴 ${e.motif}`, type: 'SORTIE', amount: e.montant||0, isExpense: true, isEffectiveEntry: false }); 
            }
        });
        
        stockSnap.forEach(doc => {
            const m = doc.data();
            // On ne compte que les ajouts de stock comme des dépenses (achats de marchandises)
            if (m.type === 'ajout' && m.prixAchat > 0 && m.quantite > 0) {
                const totalAchat = (m.prixAchat || 0) * (m.quantite || 0);
                transactions.push({ date: m.date?.toDate(), desc: `📦 <strong>Achat Marchandise</strong> : ${m.nom} (${m.quantite})`, type: 'ACHAT', amount: totalAchat, isExpense: true, isEffectiveEntry: false });
            }
        });

        const start = new Date(dateStart.value); start.setHours(0,0,0,0); 
        const end = new Date(dateEnd.value); end.setHours(23,59,59,999);
        
        state.setLoadedTransactions(transactions.filter(t => t.date >= start && t.date <= end).sort((a,b) => b.date - a.date));
        
        renderReportsTable();
    } catch (error) { console.error(error); }
};

function exportReportsToPDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) return showToast("Erreur librairie PDF", "error");

    const doc = new jsPDF();
    const shopName = document.getElementById('dashboard-user-name')?.textContent || "Ma Boutique";
    const dateStart = document.getElementById('report-date-start').value;
    const dateEnd = document.getElementById('report-date-end').value;

    // En-tête
    doc.setFontSize(18);
    doc.text(shopName, 14, 22);
    doc.setFontSize(11);
    doc.text(`Rapport d'activité`, 14, 30);
    doc.setFontSize(10);
    doc.text(`Période : ${dateStart} au ${dateEnd}`, 14, 36);

    // Préparation des données pour le tableau
    const rows = state.loadedTransactions.map(t => [
        new Date(t.date).toLocaleDateString() + ' ' + new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        t.desc.replace(/<[^>]*>?/gm, ''), // Enlever les balises HTML
        t.type,
        !t.isExpense && !t.type.includes('RETOUR') ? formatPrice(t.amount) : '',
        t.isExpense || t.type.includes('RETOUR') ? formatPrice(t.amount) : ''
    ]);

    doc.autoTable({
        head: [['Date', 'Description', 'Type', 'Entrée', 'Sortie']],
        body: rows,
        startY: 45,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 }, // Bleu
        alternateRowStyles: { fillColor: [240, 244, 255] }
    });

    // Sauvegarde
    doc.save(`rapport_${dateStart}_${dateEnd}.pdf`);
}

export function setupReports() {
    if (!state.currentBoutiqueId) return;

    const btnFilter = document.getElementById('btn-filter-reports');
    if(!btnFilter) return;

    const dateStart = document.getElementById('report-date-start');
    const dateEnd = document.getElementById('report-date-end');
    const caisseInput = document.getElementById('caisse-initiale-input');
    const btnSaveCaisse = document.getElementById('btn-save-caisse');
    const searchInput = document.getElementById('reports-search');
    const sortSelect = document.getElementById('reports-sort');
    const adminStatsDiv = document.getElementById('report-financial-stats');

    if (state.userRole === 'seller') { 
        if(adminStatsDiv) adminStatsDiv.classList.add('hidden'); 
    } else { 
        if(adminStatsDiv) adminStatsDiv.classList.remove('hidden'); 
    }

    const now = new Date();
    dateStart.valueAsDate = new Date(now.getFullYear(), now.getMonth(), 1);
    dateEnd.valueAsDate = now;

    const shopRef = doc(db, "boutiques", state.currentBoutiqueId);
    if (state.userRole !== 'seller') {
        getDoc(shopRef).then(snap => { if(snap.exists()) { caisseInput.value = snap.data().caisseInitiale || 0; loadData(); } });
        btnSaveCaisse.addEventListener('click', async () => { await updateDoc(shopRef, { caisseInitiale: parseFloat(caisseInput.value)||0 }); showToast("Sauvegardé"); loadData(); });
    } else { 
        setTimeout(() => loadData(), 100); 
    }

    if(searchInput) searchInput.addEventListener('input', renderReportsTable);
    if(sortSelect) sortSelect.addEventListener('change', renderReportsTable);
    btnFilter.addEventListener('click', loadData);
    
    const btnExport = document.getElementById('btn-export-pdf');
    if(btnExport) btnExport.addEventListener('click', exportReportsToPDF);

    const observer = new MutationObserver((mutations) => { 
        mutations.forEach((mutation) => { 
            if (!mutation.target.classList.contains('hidden')) { 
                if (state.userRole === 'seller') loadData(); 
                else setTimeout(() => { getDoc(shopRef).then(snap => { if(snap.exists()) caisseInput.value = snap.data().caisseInitiale || 0; loadData(); }); }, 100); 
            } 
        }); 
    });
    observer.observe(document.getElementById('page-rapports'), { attributes: true, attributeFilter: ['class'] });
}

window.processReturn = (saleId) => {
    showConfirmModal("Retour de marchandise", "Confirmer le retour de cette vente ? Le stock des produits sera réajusté.", async () => {
        const t = state.loadedTransactions.find(tr => tr.id === saleId);
        if(!t) return;
        
        try {
            const batch = writeBatch(db);
            if(t.originalItems) { 
                t.originalItems.forEach(i => { 
                    const pr = doc(db, "boutiques", state.currentBoutiqueId, "products", i.id); 
                    batch.update(pr, { stock: increment(i.qty), quantiteVendue: increment(-i.qty) }); 
                    const histRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"));
                    batch.set(histRef, { productId: i.id, nom: i.nomDisplay, type: 'retour', quantite: i.qty, date: serverTimestamp(), user: state.userId });
                }); 
            }
            
            if(t.isCreditSale) { 
                const sDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId, "ventes", saleId));
                if(sDoc.exists() && sDoc.data().clientId) {
                     batch.update(doc(db, "boutiques", state.currentBoutiqueId, "clients", sDoc.data().clientId), { dette: increment(-t.amount) });
                     const retRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
                     batch.set(retRef, { date: serverTimestamp(), total: t.amount, profit: 0, type: 'retour_credit', originalRef: saleId, items: t.originalItems || [], vendeurId: state.userId, deleted: false });
                }
            } else {
                const retRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
                batch.set(retRef, { date: serverTimestamp(), total: t.amount, profit: 0, type: 'retour', originalRef: saleId, items: t.originalItems || [], vendeurId: state.userId, deleted: false });
            }
            
            batch.update(doc(db, "boutiques", state.currentBoutiqueId, "ventes", saleId), { isReturned: true });
            
            await batch.commit(); 
            showToast("Retour effectué !"); 
            loadData();
        } catch(e) { 
            showToast("Erreur retour", "error"); 
        }
    });
};
