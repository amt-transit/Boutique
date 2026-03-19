// src/pages/suppliers.js
import { db, collection, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from '../firebase.js';
import * as state from '../state.js';
import { showToast, showConfirmModal } from '../ui.js';

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
                <button class="text-blue-500 hover:text-blue-700 font-bold text-xs" onclick="openEditSupplier('${supplier.id}')">Détails</button>
            </td>
        </tr>
    `).join('');
}

window.openEditSupplier = (id) => {
    const supplier = allSuppliers.find(s => s.id === id);
    if (!supplier) return;
    document.getElementById('edit-supplier-id').value = supplier.id;
    document.getElementById('edit-supplier-nom').value = supplier.nom || '';
    document.getElementById('edit-supplier-contact').value = supplier.contact || '';
    document.getElementById('edit-supplier-email').value = supplier.email || '';
    document.getElementById('edit-supplier-tel').value = supplier.telephone || '';
    document.getElementById('edit-supplier-modal').classList.remove('hidden');
};

export function setupSuppliersPage() {
    if (!state.currentBoutiqueId) return;

    const addBtn = document.getElementById('add-supplier-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const modal = document.getElementById('add-supplier-modal');
            if (modal) modal.classList.remove('hidden');
        });
    }
    
    const formSupplier = document.getElementById('form-supplier');
    if(formSupplier) {
        const newForm = formSupplier.cloneNode(true);
        formSupplier.parentNode.replaceChild(newForm, formSupplier);
        
        newForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const nom = document.getElementById('supplier-nom').value.trim();
            const contact = document.getElementById('supplier-contact').value.trim();
            const email = document.getElementById('supplier-email').value.trim();
            const telephone = document.getElementById('supplier-tel').value.trim();

            if (!nom) return showToast("Le nom est obligatoire", "error");

            addDoc(collection(db, "boutiques", state.currentBoutiqueId, "fournisseurs"), {
                nom, contact, email, telephone, createdAt: serverTimestamp()
            }).then(() => {
                showToast("Fournisseur ajouté avec succès !", "success");
                document.getElementById('add-supplier-modal').classList.add('hidden');
                newForm.reset();
            }).catch(err => {
                console.error("Erreur ajout fournisseur:", err);
                showToast("Erreur lors de l'ajout.", "error");
            });
        });
    }

    const editFormSupplier = document.getElementById('form-edit-supplier');
    if(editFormSupplier) {
        const newEditForm = editFormSupplier.cloneNode(true);
        editFormSupplier.parentNode.replaceChild(newEditForm, editFormSupplier);
        
        newEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-supplier-id').value;
            const nom = document.getElementById('edit-supplier-nom').value.trim();
            const contact = document.getElementById('edit-supplier-contact').value.trim();
            const email = document.getElementById('edit-supplier-email').value.trim();
            const telephone = document.getElementById('edit-supplier-tel').value.trim();

            if (!nom) return showToast("Le nom est obligatoire", "error");

            try {
                await updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "fournisseurs", id), {
                    nom, contact, email, telephone, lastModified: serverTimestamp()
                });
                showToast("Fournisseur mis à jour", "success");
                document.getElementById('edit-supplier-modal').classList.add('hidden');
            } catch(err) {
                console.error("Erreur modification fournisseur:", err);
                showToast("Erreur lors de la modification.", "error");
            }
        });
    }

    const deleteSupplierBtn = document.getElementById('btn-delete-supplier');
    if (deleteSupplierBtn) {
        const newDelBtn = deleteSupplierBtn.cloneNode(true);
        deleteSupplierBtn.parentNode.replaceChild(newDelBtn, deleteSupplierBtn);
        newDelBtn.addEventListener('click', () => {
            const id = document.getElementById('edit-supplier-id').value;
            showConfirmModal("Supprimer le fournisseur", "Voulez-vous archiver ce fournisseur ?", async () => {
                try {
                    await updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "fournisseurs", id), { deleted: true });
                    showToast("Fournisseur supprimé", "success");
                    document.getElementById('edit-supplier-modal').classList.add('hidden');
                } catch (e) {
                    showToast("Erreur lors de la suppression", "error");
                }
            });
        });
    }

    const q = collection(db, "boutiques", state.currentBoutiqueId, "fournisseurs");
    onSnapshot(q, (snapshot) => {
        allSuppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => !s.deleted);
        allSuppliers.sort((a, b) => a.nom.localeCompare(b.nom));
        renderSuppliersTable();
    });
}
