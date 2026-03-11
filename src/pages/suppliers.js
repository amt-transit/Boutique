// src/pages/suppliers.js
import { db, collection, onSnapshot, addDoc, serverTimestamp } from '../firebase.js';
import * as state from '../state.js';
import { showToast } from '../ui.js';

let allSuppliers = [];

function renderSuppliersTable() {
    const tbody = document.getElementById('suppliers-table-body');
    if (!tbody) return;

    tbody.innerHTML = allSuppliers.map(supplier => `
        <tr class="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
            <td class="p-4 font-medium">${supplier.nom}</td>
            <td class="p-4 text-gray-500">${supplier.contact || '-'}</td>
            <td class="p-4 text-gray-500">${supplier.email || '-'}</td>
            <td class="p-4 text-gray-500">${supplier.telephone || '-'}</td>
            <td class="p-4 text-right">
                <button class="text-blue-500">Détails</button>
            </td>
        </tr>
    `).join('');
}

function handleAddSupplier() {
    const nom = prompt("Nom du nouveau fournisseur :");
    if (!nom || nom.trim() === '') {
        showToast("Le nom est obligatoire.", "error");
        return;
    }
    const contact = prompt("Nom du contact (optionnel) :");
    const email = prompt("Email (optionnel) :");
    const telephone = prompt("Téléphone (optionnel) :");

    addDoc(collection(db, "boutiques", state.currentBoutiqueId, "fournisseurs"), {
        nom: nom.trim(),
        contact: contact || '',
        email: email || '',
        telephone: telephone || '',
        createdAt: serverTimestamp()
    }).then(() => {
        showToast("Fournisseur ajouté avec succès !", "success");
    }).catch(err => {
        console.error("Erreur ajout fournisseur:", err);
        showToast("Erreur lors de l'ajout.", "error");
    });
}

export function setupSuppliersPage() {
    if (!state.currentBoutiqueId) return;

    const addBtn = document.getElementById('add-supplier-btn');
    if (addBtn) {
        addBtn.addEventListener('click', handleAddSupplier);
    }
    
    const q = collection(db, "boutiques", state.currentBoutiqueId, "fournisseurs");
    onSnapshot(q, (snapshot) => {
        allSuppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allSuppliers.sort((a, b) => a.nom.localeCompare(b.nom));
        renderSuppliersTable();
    });
}
