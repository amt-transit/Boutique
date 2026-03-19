import { db, onSnapshot, query, collection, where, doc, getDoc, writeBatch, increment, serverTimestamp } from '../firebase.js';
import { showToast, formatPrice, showConfirmModal } from '../ui.js';
import * as state from '../state.js';

export function setupOrdersListener() {
    const container = document.getElementById('orders-list-container');
    if(!container) return;

    // Make sure we only set up the listener if we have a boutiqueId
    if (!state.currentBoutiqueId) return;

    onSnapshot(query(collection(db, "boutiques", state.currentBoutiqueId, "commandes"), where("status", "==", "en_attente")), (snap) => {
        container.innerHTML = '';
        
        if (snap.empty) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-400 p-8 bg-white rounded-xl">Aucune commande en attente.</div>';
            return;
        }

        snap.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString() : '-';
            
            const card = document.createElement('div');
            card.className = "bg-white p-5 rounded-xl shadow border border-indigo-100 flex flex-col justify-between";
            
            let itemsHtml = order.items.map(i => `<div class="flex justify-between text-sm text-gray-600"><span>${i.qty}x ${i.nomDisplay}</span><span>${formatPrice(i.prixVente * i.qty)}</span></div>`).join('');

            card.innerHTML = `
                <div class="mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-lg text-indigo-900">${order.client}</h4>
                        <span class="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded">${dateStr}</span>
                    </div>
                    <div class="text-xs text-gray-400 mb-3">${order.telephone}</div>
                    <div class="space-y-1 border-t border-b py-2 my-2 border-gray-100 max-h-32 overflow-y-auto">
                        ${itemsHtml}
                    </div>
                    <div class="flex justify-between font-bold text-lg mt-2">
                        <span>Total:</span>
                        <span class="text-indigo-600">${formatPrice(order.total)}</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-2">
                    <button onclick="cancelOrder('${order.id}')" class="bg-red-50 text-red-600 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition">Annuler</button>
                    <button onclick="validateOrder('${order.id}')" class="bg-green-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition shadow">Encaisser</button>
                </div>
            `;
            container.appendChild(card);
        });
        if (window.lucide) window.lucide.createIcons();
    });
}

window.validateOrder = (orderId) => {
    showConfirmModal("Encaisser la commande", "Le client a payé ? Confirmer la vente ?", async () => {
        try {
            const orderDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));
            if(!orderDoc.exists()) return;
            const order = orderDoc.data();

            const batch = writeBatch(db);

            const saleRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
            
            let profit = 0;
            for(const item of order.items) {
                profit += (item.prixVente - (item.prixAchat || 0)) * item.qty;
                
                const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
                batch.update(pRef, { quantiteVendue: increment(item.qty) });
            }

            batch.set(saleRef, {
                items: order.items,
                total: order.total,
                profit: profit,
                date: serverTimestamp(),
                vendeurId: state.userId,
                type: 'cash',
                clientName: order.client,
                deleted: false
            });

            batch.delete(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));

            await batch.commit();
            showToast("Vente encaissée avec succès !", "success");

        } catch (e) {
            console.error(e);
            showToast("Erreur validation", "error");
        }
    });
};

window.cancelOrder = (orderId) => {
    showConfirmModal("Annuler la commande", "Annuler cette commande et remettre les articles en stock ?", async () => {
        try {
            const orderDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));
            if(!orderDoc.exists()) return;
            const order = orderDoc.data();

            const batch = writeBatch(db);

            for (const item of order.items) {
                const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
                batch.update(pRef, { stock: increment(item.qty) });
            }

            batch.delete(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));

            await batch.commit();
            showToast("Commande annulée, stock restauré.");

        } catch (e) {
            console.error(e);
            showToast("Erreur annulation", "error");
        }
    });
};
