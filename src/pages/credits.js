// src/pages/credits.js
import { db, onSnapshot, collection, doc, setDoc, writeBatch, increment, serverTimestamp, updateDoc, query, where, getDocs } from '../firebase.js';
import { showToast, formatPrice, showPromptModal, showConfirmModal, formatWhatsAppNumber } from '../ui.js';
import * as state from '../state.js';
let currentClientSales = [];

export function renderTable() {
    const tbody = document.getElementById('credits-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    let filtered = [...state.allClients]; 

    const searchInput = document.getElementById('credits-search');
    if(searchInput && searchInput.value) { 
        const term = searchInput.value.toLowerCase(); 
        filtered = filtered.filter(c => c.nom.toLowerCase().includes(term) || (c.adresse && c.adresse.toLowerCase().includes(term)) || (c.telephone && c.telephone.includes(term))); 
    }

    const sortSelect = document.getElementById('credits-sort');
    if(sortSelect) { 
        const sort = sortSelect.value; 
        filtered.sort((a, b) => { 
            if(sort === 'name_asc') return a.nom.localeCompare(b.nom); 
            if(sort === 'dette_desc') return (b.dette || 0) - (a.dette || 0); 
            if(sort === 'rentable') return (b.totalProfit || 0) - (a.totalProfit || 0); // Plus rentable
            if(sort === 'depense') return (b.totalAchats || 0) - (a.totalAchats || 0); // Plus gros acheteur
            if(sort === 'recent') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            return 0; 
        }); 
    }
    
    filtered.forEach(c => {
        if(c.deleted) return; 
        const rowClass = "border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition";
        const safeName = c.nom.replace(/'/g, "\\'");
        
        // Attribution des couronnes de différentes couleurs pour le Top 3
        let badge = '';
        const rank = filtered.indexOf(c);
        const isRankable = (sortSelect?.value === 'rentable' && c.totalProfit > 0) || (sortSelect?.value === 'depense' && c.totalAchats > 0);
        
        if (isRankable) {
            if (rank === 0) badge = '<i data-lucide="crown" class="w-5 h-5 text-yellow-500 fill-current" title="1er Place"></i> ';
            else if (rank === 1) badge = '<i data-lucide="crown" class="w-5 h-5 text-slate-400 fill-current" title="2ème Place"></i> ';
            else if (rank === 2) badge = '<i data-lucide="crown" class="w-5 h-5 text-amber-600 fill-current" title="3ème Place"></i> ';
        }

        const formatCFA = (val) => new Intl.NumberFormat('fr-FR', {style:'currency', currency:'XOF', maximumFractionDigits:0}).format(val || 0);

        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td class="p-3 md:p-4">
                    <div class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">${badge}${c.nom}</div>
                    <div class="text-[11px] text-slate-400 italic mt-0.5 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${c.adresse || 'Sans adresse'}</div>
                    <!-- Affichage des montants sur Mobile -->
                    <div class="mt-1.5 flex flex-wrap gap-2 sm:hidden">
                        <span class="text-[10px] font-bold text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30 px-1.5 py-0.5 rounded shadow-sm">Achats: ${formatCFA(c.totalAchats)}</span>
                        <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded shadow-sm">Profit: ${formatCFA(c.totalProfit)}</span>
                    </div>
                </td>
                <td class="p-3 md:p-4 hidden sm:table-cell">
                    <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Acheté: <span class="text-blue-600">${formatCFA(c.totalAchats)}</span></div>
                    <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Profit: <span class="text-emerald-600">${formatCFA(c.totalProfit)}</span></div>
                </td>
                <td class="p-3 md:p-4 text-xs font-medium text-slate-500">${c.telephone || '-'}</td>
                <td class="p-3 md:p-4 font-black text-orange-600">${formatCFA(c.dette)}</td>
                <td class="p-3 md:p-4 text-right flex gap-1 justify-end items-center">
                    ${c.telephone ? `<a href="https://wa.me/${formatWhatsAppNumber(c.telephone)}" target="_blank" class="text-green-500 hover:text-green-600 bg-green-50 dark:bg-green-900/30 p-2 rounded-lg transition" title="WhatsApp"><i data-lucide="message-circle" class="w-4 h-4"></i></a>` : ''}
                    <button onclick="viewClientHistory('${c.id}', '${safeName}')" class="text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg transition" title="Historique"><i data-lucide="history" class="w-4 h-4"></i></button>
                    ${c.dette > 0 ? `<button onclick="rembourserClient('${c.id}', ${c.dette}, '${safeName}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition">Encaisser</button>` : ''}
                    ${(state.userRole === 'admin') ? `<button onclick="deleteClient('${c.id}')" class="text-red-400 hover:text-red-600 p-2"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
                </td>
            </tr>`;
    });
    if (window.lucide) window.lucide.createIcons();
}

window.rembourserClient = (id, dette, nomClient) => { 
    showPromptModal("Encaisser un remboursement", `Dette Actuelle: ${formatPrice(dette)}\nMontant versé par le client :`, "number", async (m) => {
        if(!m) return; 
        const montant = parseFloat(m); 
        if(isNaN(montant) || montant <= 0) return showToast("Montant invalide", "error"); 
        try { 
            const batch = writeBatch(db); 
            const clientRef = doc(db, "boutiques", state.currentBoutiqueId, "clients", id); 
            batch.update(clientRef, { dette: increment(-montant) }); 
            const moveRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "ventes")); 
            batch.set(moveRef, { date: serverTimestamp(), total: montant, profit: 0, type: 'remboursement', clientName: nomClient, clientId: id, items: [], vendeurId: state.userId, deleted: false }); 
            await batch.commit(); 
            showToast("Remboursement encaissé !", "success"); 

            showConfirmModal("Imprimer le reçu ?", "Le remboursement a été enregistré. Voulez-vous imprimer un reçu pour le client ?", () => {
                const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Ma Boutique";
                const dateStr = new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
                
                const receiptContent = `
                    <div class="receipt-header">
                        <h1>${shopName}</h1>
                        <p>${dateStr}</p>
                        <p style="font-weight: bold; margin-top: 2mm;">Reçu de Paiement</p>
                        <p>Client: ${nomClient}</p>
                    </div>
                    <div class="receipt-items">
                        <table>
                            <tbody>
                                <tr>
                                    <td>Remboursement Dette</td>
                                    <td class="col-price">${formatPrice(montant)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="receipt-total">
                        TOTAL PAYÉ: ${formatPrice(montant)}
                    </div>
                    <div class="receipt-footer">
                        <p>Reste à payer: ${formatPrice(dette - montant)}</p>
                        <p>Merci de votre confiance !</p>
                    </div>
                `;
                const printableArea = document.getElementById('printable-area');
                if (printableArea) {
                    printableArea.innerHTML = receiptContent;
                    window.print();
                }
            });
        } catch(e) { 
            console.error(e); 
            showToast("Erreur", "error"); 
        } 
    });
};

window.deleteClient = (id) => { 
    showConfirmModal("Archiver le client", "Voulez-vous archiver ce client ? Sa dette sera conservée mais il n'apparaîtra plus dans les listes.", () => {
        updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "clients", id), { deleted: true }); 
    });
};

window.viewClientHistory = async (clientId, clientName) => {
    document.getElementById('dashboard-generic-modal-title').innerHTML = `Achats de <span class="text-blue-600">${clientName}</span>`;
    const body = document.getElementById('dashboard-generic-modal-body');
    body.innerHTML = '<div class="text-center p-6 text-gray-500"><i data-lucide="loader-2" class="animate-spin w-8 h-8 mx-auto mb-2"></i>Recherche dans l\'historique...</div>';
    
    document.getElementById('dashboard-generic-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();

    try {
        const q = query(collection(db, "boutiques", state.currentBoutiqueId, "ventes"), where("clientId", "==", clientId));
        const snap = await getDocs(q);
        
        let ventes = [];
        snap.forEach(doc => ventes.push({ id: doc.id, ...doc.data() }));
        ventes.sort((a, b) => b.date.seconds - a.date.seconds);
        
        currentClientSales = ventes; // Sauvegarde pour la réimpression

        if (ventes.length === 0) {
            body.innerHTML = '<div class="text-center p-6 text-gray-500">Aucun achat enregistré pour ce client.</div>';
            return;
        }

        body.innerHTML = `
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                    <tr><th class="p-3">Date & Heure</th><th class="p-3">Articles achetés</th><th class="p-3 text-right">Montant</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                    ${ventes.map(v => {
                        const dateObj = v.date ? v.date.toDate() : new Date();
                        const dateStr = dateObj.toLocaleDateString('fr-FR') + ' à ' + dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
                        const items = v.items ? v.items.map(i => `${i.qty}x ${i.nomDisplay}`).join(', ') : 'Vente';
                        const statusBadge = v.type === 'credit' 
                            ? '<span class="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 font-bold rounded ml-1 uppercase">À Crédit</span>' 
                            : '<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 font-bold rounded ml-1 uppercase">Payé</span>';
                        
                        const printBtn = `<button onclick="reprintSale('${v.id}')" class="inline-flex items-center justify-center text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 p-1.5 rounded-lg transition ml-3" title="Réimprimer le reçu"><i data-lucide="printer" class="w-4 h-4"></i></button>`;

                        return `<tr class="hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                            <td class="p-3 text-gray-500 dark:text-gray-400 text-xs font-medium">${dateStr}</td>
                            <td class="p-3 text-gray-900 dark:text-gray-200 font-medium">${items} ${statusBadge}</td>
                            <td class="p-3 text-right font-extrabold text-blue-600 dark:text-blue-400 flex justify-end items-center">${new Intl.NumberFormat('fr-FR', {style:'currency', currency:'XOF', maximumFractionDigits:0}).format(v.total)} ${printBtn}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        body.innerHTML = '<div class="text-center p-6 text-red-500">Erreur lors du chargement de l\'historique.</div>';
    }
};

window.reprintSale = (saleId) => {
    const sale = currentClientSales.find(s => s.id === saleId);
    if (!sale) return;
    
    const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Boutique";
    const dateObj = sale.date ? sale.date.toDate() : new Date();
    const dateStr = dateObj.toLocaleDateString('fr-FR') + ' à ' + dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    
    let itemsHtml = sale.items.map(i => `
        <tr><td class="col-qty">${i.qty}</td><td>${i.nomDisplay}</td><td class="col-price">${new Intl.NumberFormat('fr-FR', {style:'currency', currency:'XOF', maximumFractionDigits:0}).format(i.prixVente * i.qty)}</td></tr>
    `).join('');

    let discountHtml = '';
    if (sale.remise > 0) {
        discountHtml = `<tr><td colspan="2" style="text-align: right; font-weight: bold;">Remise</td><td class="col-price" style="color: red;">-${new Intl.NumberFormat('fr-FR', {style:'currency', currency:'XOF', maximumFractionDigits:0}).format(sale.remise)}</td></tr>`;
    }

    const receiptContent = `
        <div class="receipt-header">
            <h1>${shopName}</h1>
            <p>${dateStr}</p>
            ${sale.clientName ? `<p>Client: ${sale.clientName}</p>` : ''}
            <p style="font-weight: bold; margin-top: 2mm; text-transform: uppercase; font-size: 10px; border: 1px dashed #000; padding: 2px; display: inline-block;">Duplicata de Reçu</p>
        </div>
        <div class="receipt-items">
            <table>
                <thead><tr><th class="col-qty">Qté</th><th>Produit</th><th class="col-price">Total</th></tr></thead>
                <tbody>${itemsHtml}${discountHtml}</tbody>
            </table>
        </div>
        <div class="receipt-total">TOTAL: ${new Intl.NumberFormat('fr-FR', {style:'currency', currency:'XOF', maximumFractionDigits:0}).format(sale.total)}</div>
        <div class="receipt-footer"><p>Merci de votre confiance !</p></div>
    `;
    const printableArea = document.getElementById('printable-area');
    if (printableArea) {
        printableArea.innerHTML = receiptContent;
        window.print();
    }
};

window.recalculateClientStats = async () => {
    if (!state.currentBoutiqueId) return;
    
    showConfirmModal("Synchroniser les statistiques", "Voulez-vous recalculer l'historique de tous vos clients (Achats et Bénéfices) à partir des anciennes ventes ?", async () => {
        showToast("Calcul en cours, veuillez patienter...", "info");
        try {
            const salesSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
            const clientStats = {}; 
            
            salesSnap.forEach(doc => {
                const s = doc.data();
                if (s.deleted || !s.clientId) return;
                
                if (!clientStats[s.clientId]) {
                    clientStats[s.clientId] = { achats: 0, profit: 0 };
                }
                
                // Ne compter que les vrais achats
                if (['cash', 'mobile_money', 'credit'].includes(s.type)) {
                    let saleProfit = s.profit;
                    // Réparation pour les très anciennes ventes qui n'avaient pas de profit enregistré
                    if (saleProfit === undefined || saleProfit === 0) {
                        let computedProfit = 0;
                        if (s.items && Array.isArray(s.items)) {
                            s.items.forEach(i => { computedProfit += ((i.prixVente || 0) - (i.prixAchat || 0)) * (i.qty || 1); });
                        }
                        computedProfit -= (s.remise || 0);
                        saleProfit = computedProfit;
                    }
                    
                    clientStats[s.clientId].achats += (s.total || 0);
                    clientStats[s.clientId].profit += (saleProfit || 0);
                }
            });
            
            const batch = writeBatch(db);
            let count = 0;
            
            state.allClients.forEach(c => {
                const stats = clientStats[c.id] || { achats: 0, profit: 0 };
                if ((c.totalAchats || 0) !== stats.achats || (c.totalProfit || 0) !== stats.profit) {
                    batch.update(doc(db, "boutiques", state.currentBoutiqueId, "clients", c.id), {
                        totalAchats: stats.achats,
                        totalProfit: stats.profit
                    });
                    count++;
                }
            });
            
            if (count > 0) {
                await batch.commit();
                showToast(`${count} profil(s) mis à jour avec les anciennes ventes !`, "success");
            } else {
                showToast("Tous les profils sont déjà à jour.", "success");
            }
        } catch (e) { console.error(e); showToast("Erreur lors de la synchronisation.", "error"); }
    });
};

export function setupCredits() {
    if (!state.currentBoutiqueId) return;

    const searchInput = document.getElementById('credits-search');
    const sortSelect = document.getElementById('credits-sort');

    // Charger les clients en temps réel
    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "clients"), (snap) => {
        const clients = [];
        snap.forEach(d => {
            clients.push({ id: d.id, ...d.data() });
        });
        state.setAllClients(clients);
        renderTable();
    });

    if (searchInput) searchInput.addEventListener('input', renderTable);
    if (sortSelect) sortSelect.addEventListener('change', renderTable);
}
