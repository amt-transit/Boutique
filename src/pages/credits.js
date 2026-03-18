// src/pages/credits.js
import { db, onSnapshot, collection, doc, setDoc, writeBatch, increment, serverTimestamp, updateDoc } from '../firebase.js';
import { showToast, formatPrice } from '../ui.js';
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
        const safeName = c.nom.replace(/'/g, "'");
        const payBtn = (!c.deleted && c.dette > 0) ? `<button onclick="rembourserClient('${c.id}', ${c.dette}, '${safeName}')" class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs mr-2 font-bold">Payer</button>` : '';
        tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 font-medium">${c.nom} ${c.deleted?'(Archivé)':''}</td><td class="p-4">${c.telephone||'-'}</td><td class="p-4 font-bold text-orange-600">${formatPrice(c.dette||0)}</td><td class="p-4 text-right flex gap-2 justify-end">${payBtn} ${actions}</td></tr>`;
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

window.rembourserClient = async (id, dette, nomClient) => { 
    const m = prompt(`Dette: ${formatPrice(dette)}
Montant versé :`); 
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
    } catch(e) { 
        console.error(e); 
        showToast("Erreur", "error"); 
    } 
};

window.deleteClient = (id) => { 
    if(confirm("Archiver ce client ? Sa dette sera conservée mais il n'apparaîtra plus dans les listes.")) {
        updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "clients", id), { deleted: true }); 
    }
};
