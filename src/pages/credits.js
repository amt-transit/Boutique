// src/pages/credits.js
import { db, onSnapshot, collection, doc, setDoc, writeBatch, increment, serverTimestamp, updateDoc, query, where, getDocs } from '../firebase.js';
import { showToast, formatPrice, showPromptModal, showConfirmModal, formatWhatsAppNumber } from '../ui.js';
import * as state from '../state.js';
let currentClientSales = [];

function renderTable() {
    const tbody = document.getElementById('credits-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    let filtered = [...state.allClients]; 

    const sortSelect = document.getElementById('credits-sort');
    if(sortSelect) { 
        const sort = sortSelect.value; 
        filtered.sort((a, b) => { 
            if(sort === 'name_asc') return a.nom.localeCompare(b.nom); 
            if(sort === 'dette_desc') return (b.dette || 0) - (a.dette || 0); 
            if(sort === 'rentable') return (b.totalProfit || 0) - (a.totalProfit || 0); // Plus rentable en haut
            if(sort === 'depense') return (b.totalAchats || 0) - (a.totalAchats || 0); // Plus gros acheteur en haut
            return 0; 
        }); 
    }
    
    filtered.forEach(c => {
        const rowClass = c.deleted ? "deleted-row" : "border-b hover:bg-gray-50 dark:hover:bg-slate-800/50 transition";
        const safeName = c.nom.replace(/'/g, "\\'");
        
        // Médaille d'or pour les clients top 3 les plus rentables
        const isTop = (c.totalProfit > 0 && filtered.indexOf(c) < 3 && sortSelect?.value === 'rentable') ? '👑 ' : '';
        
        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td class="p-4">
                    <div class="font-bold text-gray-800 dark:text-gray-200">${isTop}${c.nom}</div>
                    <div class="text-[10px] text-gray-400 italic">${c.adresse || 'Sans adresse'}</div>
                </td>
                <td class="p-4">
                    <div class="text-[10px] font-bold text-gray-500 uppercase">Acheté : <span class="text-blue-600">${formatPrice(c.totalAchats || 0)}</span></div>
                    <div class="text-[10px] font-bold text-gray-400 uppercase">Profit : <span class="text-emerald-600">${formatPrice(c.totalProfit || 0)}</span></div>
                </td>
                <td class="p-4 font-black text-orange-600">${formatPrice(c.dette || 0)}</td>
                <td class="p-4 text-right flex gap-1 justify-end items-center">
                    <button onclick="viewClientHistory('${c.id}', '${safeName}')" class="text-blue-500 bg-blue-50 p-1.5 rounded-lg transition" title="Historique"><i data-lucide="history" class="w-4 h-4"></i></button>
                    ${c.dette > 0 ? `<button onclick="rembourserClient('${c.id}', ${c.dette}, '${safeName}')" class="bg-green-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-sm">Payer</button>` : ''}
                </td>
            </tr>`;
    });
    if (window.lucide) window.lucide.createIcons();
}

export function setupCredits() {
    if (!state.currentBoutiqueId) return;

    const searchInput = document.getElementById('credits-search');
    const sortSelect = document.getElementById('credits-sort');

    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "clients"), (snap) => {
        const clients = [];
        let totalDette = 0;
        snap.forEach(d => {
            const c = { id: d.id, ...d.data() };
            if(!c.deleted) totalDette += (c.dette || 0);
            if(c.deleted && state.userRole === 'seller') return;
            clients.push(c);
        });
        state.setAllClients(clients);
        renderTable();
        if(document.getElementById('dash-total-credits')) document.getElementById('dash-total-credits').textContent = formatPrice(totalDette);
    });

    if(searchInput) searchInput.addEventListener('input', renderTable);
    if(sortSelect) sortSelect.addEventListener('change', renderTable);

    // Note: The client form submission is handled in sales.js due to isQuickAddMode logic
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
