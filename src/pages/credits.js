// src/pages/credits.js
import { db, onSnapshot, collection, doc, setDoc, writeBatch, increment, serverTimestamp, updateDoc, query, where, getDocs } from '../firebase.js';
import { showToast, formatPrice, showPromptModal, showConfirmModal, formatWhatsAppNumber } from '../ui.js';
import * as state from '../state.js';

function renderTable() {
    const tbody = document.getElementById('credits-table-body');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    let filtered = [...state.allClients]; 
    
    const searchInput = document.getElementById('credits-search');
    if(searchInput && searchInput.value) { 
        const term = searchInput.value.toLowerCase(); 
        filtered = filtered.filter(c => c.nom.toLowerCase().includes(term)); 
    }

    const sortSelect = document.getElementById('credits-sort');
    if(sortSelect) { 
        const sort = sortSelect.value; 
        filtered.sort((a, b) => { 
            if(sort === 'name_asc') return a.nom.localeCompare(b.nom); 
            if(sort === 'dette_desc') return b.dette - a.dette; 
            if(sort === 'dette_asc') return a.dette - b.dette; 
            return 0; 
        }); 
    }
    
    filtered.forEach(c => {
        const rowClass = c.deleted ? "deleted-row" : "border-b hover:bg-gray-50";
        const actions = (state.userRole === 'admin' && !c.deleted) ? `<button onclick="deleteClient('${c.id}')" class="text-red-400 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
        const safeName = c.nom.replace(/'/g, "\\'");
        const payBtn = (!c.deleted && c.dette > 0) ? `<button onclick="rembourserClient('${c.id}', ${c.dette}, '${safeName}')" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs mr-2 font-bold">Payer</button>` : '';
        const historyBtn = `<button onclick="viewClientHistory('${c.id}', '${safeName}')" class="text-blue-500 hover:text-blue-700 bg-blue-50 p-1.5 rounded-lg transition mr-2" title="Voir l'historique des achats"><i data-lucide="history" class="w-4 h-4"></i></button>`;
        const waBtn = c.telephone ? `<a href="https://wa.me/${formatWhatsAppNumber(c.telephone)}" target="_blank" class="text-green-500 hover:text-green-600 bg-green-50 p-1.5 rounded-lg transition mr-2" title="Contacter sur WhatsApp"><i data-lucide="message-circle" class="w-4 h-4"></i></a>` : '';
        tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 font-medium">${c.nom} ${c.deleted?'(Archivé)':''}</td><td class="p-4">${c.telephone||'-'}</td><td class="p-4 font-bold text-orange-600">${formatPrice(c.dette||0)}</td><td class="p-4 text-right flex gap-2 justify-end items-center">${waBtn} ${historyBtn} ${payBtn} ${actions}</td></tr>`;
    });
    if (window.lucide) window.lucide.createIcons();
};

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

        if (ventes.length === 0) {
            body.innerHTML = '<div class="text-center p-6 text-gray-500">Aucun achat enregistré pour ce client.</div>';
            return;
        }

        body.innerHTML = `
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                    <tr><th class="p-3">Date</th><th class="p-3">Articles achetés</th><th class="p-3 text-right">Montant</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                    ${ventes.map(v => {
                        const d = v.date ? v.date.toDate().toLocaleDateString('fr-FR') : '-';
                        const items = v.items ? v.items.map(i => `${i.qty}x ${i.nomDisplay}`).join(', ') : 'Vente';
                        const statusBadge = v.type === 'credit' 
                            ? '<span class="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 font-bold rounded ml-1 uppercase">À Crédit</span>' 
                            : '<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 font-bold rounded ml-1 uppercase">Payé</span>';
                        
                        return `<tr class="hover:bg-gray-50 dark:hover:bg-slate-800 transition">
                            <td class="p-3 text-gray-500 dark:text-gray-400 text-xs">${d}</td>
                            <td class="p-3 text-gray-900 dark:text-gray-200 font-medium">${items} ${statusBadge}</td>
                            <td class="p-3 text-right font-extrabold text-blue-600 dark:text-blue-400">${new Intl.NumberFormat('fr-FR', {style:'currency', currency:'XOF'}).format(v.total)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error(error);
        body.innerHTML = '<div class="text-center p-6 text-red-500">Erreur lors du chargement de l\'historique.</div>';
    }
};
