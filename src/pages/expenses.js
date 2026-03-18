// src/pages/expenses.js
import { db, onSnapshot, collection, setDoc, doc, serverTimestamp, updateDoc } from '../firebase.js';
import { showToast, formatPrice } from '../ui.js';
import * as state from '../state.js';

function renderTable() {
    const tbody = document.getElementById('expenses-table-body');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    let filtered = [...state.allExpenses];
 
    const searchInput = document.getElementById('expenses-search');
    if(searchInput && searchInput.value) { 
        const term = searchInput.value.toLowerCase(); 
        filtered = filtered.filter(e => e.motif.toLowerCase().includes(term)); 
    }
    
    const sortSelect = document.getElementById('expenses-sort');
    if(sortSelect) { 
        const sort = sortSelect.value; 
        filtered.sort((a, b) => { 
            const dateA = a.date?.seconds || 0; 
            const dateB = b.date?.seconds || 0; 
            if(sort === 'date_desc') return dateB - dateA; 
            if(sort === 'date_asc') return dateA - dateB; 
            if(sort === 'amount_desc') return b.montant - a.montant; 
            return 0; 
        }); 
    }
    
    filtered.forEach(ex => {
        const rowClass = ex.deleted ? "deleted-row" : "border-b hover:bg-gray-50 transition";
        const deleteBtn = (state.userRole === 'admin' && !ex.deleted) ? `<button onclick="deleteExp('${ex.id}')" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
        const isEntree = ex.type === 'entree';
        const amountClass = isEntree ? 'text-green-600' : 'text-red-600';
        const sign = isEntree ? '+' : '-';
        const icon = isEntree ? '🟢' : '🔴';
        tbody.innerHTML += `<tr class="${rowClass}"><td class="p-4 text-sm text-gray-500">${new Date(ex.date?.seconds*1000).toLocaleDateString()}</td><td class="p-4 font-medium text-gray-800">${icon} ${ex.motif}</td><td class="p-4 text-right font-bold ${amountClass}">${sign}${formatPrice(ex.montant)}</td><td class="p-4 text-right">${deleteBtn}</td></tr>`;
    });
    if (window.lucide) window.lucide.createIcons();
};

export function setupExpenses() {
    if (!state.currentBoutiqueId) return;

    const form = document.getElementById('form-expense');
    const searchInput = document.getElementById('expenses-search');
    const sortSelect = document.getElementById('expenses-sort');
    
    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "expenses"), (snap) => { 
        const expenses = []; 
        snap.forEach(d => { 
            const ex = { id: d.id, ...d.data() }; 
            if (ex.deleted && state.userRole === 'seller') return; 
            expenses.push(ex); 
        }); 
        state.setAllExpenses(expenses);
        renderTable(); 
    });
    
    if(searchInput) searchInput.addEventListener('input', renderTable);
    if(sortSelect) sortSelect.addEventListener('change', renderTable);
    
    if(form) { 
        form.addEventListener('submit', async (e) => { 
            e.preventDefault(); 
            try { 
                await setDoc(doc(collection(db, "boutiques", state.currentBoutiqueId, "expenses")), { 
                    motif: document.getElementById('exp-motif').value, 
                    montant: parseFloat(document.getElementById('exp-montant').value), 
                    source: document.getElementById('exp-source').value,
                    type: document.getElementById('exp-type').value,
                    date: serverTimestamp(), 
                    user: state.userId, 
                    deleted: false 
                }); 
                form.reset(); 
                showToast("Dépense ajoutée"); 
            } catch(e) { 
                showToast("Erreur", "error"); 
            } 
        }); 
    }
}

window.deleteExp = (id) => { 
    if(confirm("Annuler cette dépense ? L'argent sera réintégré dans le bilan.")) {
        updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "expenses", id), { deleted: true });
    }
};
