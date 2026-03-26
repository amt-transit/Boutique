import { db, onSnapshot, query, collection, where, doc, getDoc, writeBatch, increment, serverTimestamp } from '../firebase.js';
import { showToast, formatPrice, showConfirmModal } from '../ui.js';
import * as state from '../state.js';

export function setupOrdersListener() {
    const container = document.getElementById('orders-list-container');
    if(!container) return;

    // Make sure we only set up the listener if we have a boutiqueId
    if (!state.currentBoutiqueId) return;

    // Demander la permission pour les notifications navigateur (Push)
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    let isInitialOrdersLoad = true;

    onSnapshot(query(collection(db, "boutiques", state.currentBoutiqueId, "commandes"), where("status", "==", "en_attente")), (snap) => {
        container.innerHTML = '';
        
        // --- GESTION DU BADGE ROUGE ---
        const pendingCount = snap.size;
        const mainBadge = document.getElementById('badge-commandes-main');
        const drawerBadge = document.getElementById('badge-commandes-drawer');
        
        if (mainBadge) {
            mainBadge.textContent = pendingCount;
            mainBadge.classList.toggle('hidden', pendingCount === 0);
        }
        if (drawerBadge) {
            drawerBadge.textContent = pendingCount;
            drawerBadge.classList.toggle('hidden', pendingCount === 0);
        }

        // --- NOTIFICATION SONORE ET VISUELLE POUR LES NOUVELLES COMMANDES ---
        if (!isInitialOrdersLoad) {
            let hasNewOrder = false;
            // On vérifie s'il y a eu un AJOUT dans la base de données
            snap.docChanges().forEach(change => {
                if (change.type === 'added') hasNewOrder = true;
            });
            
            if (hasNewOrder) {
                new Audio('https://actions.google.com/sounds/v1/ui/message_notification.ogg').play().catch(e => console.log('Audio blocked', e));
                
                if (Notification.permission === "granted") {
                    new Notification("Nouvelle Commande !", { body: "Une nouvelle commande est en attente dans votre boutique." });
                }
            }
        }
        isInitialOrdersLoad = false;

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
                <div class="grid grid-cols-4 gap-2 mt-2">
                    <button onclick="cancelOrder('${order.id}')" class="bg-red-50 text-red-600 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition">Annuler</button>
                    <button onclick="shareOrderWhatsApp('${order.id}')" class="bg-green-50 text-green-600 py-2 rounded-lg text-sm font-bold hover:bg-green-100 transition flex justify-center items-center gap-1" title="Envoyer sur WhatsApp"><i data-lucide="message-circle" class="w-4 h-4"></i></button>
                    <button onclick="printOrderReceipt('${order.id}')" class="bg-blue-50 text-blue-600 py-2 rounded-lg text-sm font-bold hover:bg-blue-100 transition flex justify-center items-center gap-1" title="Imprimer le ticket"><i data-lucide="printer" class="w-4 h-4"></i></button>
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

window.saveCartAsOrder = () => {
    if (state.saleCart.length === 0) {
        return showToast("Le panier est vide. Ajoutez des articles d'abord.", "error");
    }
    const modal = document.getElementById('order-modal');
    if (modal) {
        document.getElementById('order-client-name').value = '';
        document.getElementById('order-client-tel').value = '';
        modal.classList.remove('hidden');
    }
};

window.finalizeOrder = async () => {
    const clientName = document.getElementById('order-client-name').value.trim();
    const clientTel = document.getElementById('order-client-tel').value.trim();

    if (!clientName) {
        return showToast("Le nom du client est requis.", "error");
    }

    try {
        const batch = writeBatch(db);
        const orderRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "commandes"));
        
        let total = 0;
        const items = [...state.saleCart];
        
        for (const item of items) {
            total += item.prixVente * item.qty;
            // On retire les articles du stock car ils sont réservés pour la commande
            const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(-item.qty) });
        }

        batch.set(orderRef, {
            client: clientName,
            telephone: clientTel,
            items: items,
            total: total,
            status: 'en_attente',
            date: serverTimestamp(),
            vendeurId: state.userId
        });

        await batch.commit();
        
        document.getElementById('order-modal').classList.add('hidden');
        showToast("Commande enregistrée avec succès !", "success");
        
        state.clearCart();
        if (typeof window.renderCart === 'function') window.renderCart(); 
        
        // Impression optionnelle du ticket de commande
        showConfirmModal("Imprimer le reçu ?", "Voulez-vous imprimer un reçu pour cette commande ?", () => {
            const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Ma Boutique";
            const dateStr = new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
            
            let itemsHtml = items.map(i => `<tr><td class="col-qty">${i.qty}</td><td>${i.nomDisplay || i.nom}</td><td class="col-price">${formatPrice(i.prixVente * i.qty)}</td></tr>`).join('');

            const printableArea = document.getElementById('printable-area');
            if (printableArea) {
                printableArea.innerHTML = `
                    <div class="receipt-header"><h1>${shopName}</h1><p>${dateStr}</p><p style="font-weight: bold; margin-top: 2mm;">Ticket - COMMANDE</p><p>Client: ${clientName}</p>${clientTel ? `<p>Tel: ${clientTel}</p>` : ''}</div>
                    <div class="receipt-items"><table><thead><tr><th class="col-qty">Qté</th><th>Désignation</th><th class="col-price">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>
                    <div class="receipt-total">TOTAL: ${formatPrice(total)}</div>
                    <div class="receipt-footer"><p>Commande non payée</p><p>Merci de votre confiance !</p></div>
                `;
                window.print();
            }
        });
    } catch (e) {
        console.error(e);
        showToast("Erreur lors de l'enregistrement de la commande", "error");
    }
};

window.printOrderReceipt = async (orderId) => {
    try {
        const orderDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));
        if(!orderDoc.exists()) return showToast("Commande introuvable", "error");
        
        const order = orderDoc.data();
        const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Ma Boutique";
        const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString('fr-FR') + ' à ' + new Date(order.date.seconds * 1000).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';

        let itemsHtml = order.items.map(i => `<tr><td class="col-qty">${i.qty}</td><td>${i.nomDisplay || i.nom}</td><td class="col-price">${formatPrice(i.prixVente * i.qty)}</td></tr>`).join('');

        const printableArea = document.getElementById('printable-area');
        if (printableArea) {
            printableArea.innerHTML = `
                <div class="receipt-header"><h1>${shopName}</h1><p>${dateStr}</p><p style="font-weight: bold; margin-top: 2mm;">Ticket - COMMANDE</p><p>Client: ${order.client}</p>${order.telephone ? `<p>Tel: ${order.telephone}</p>` : ''}</div>
                <div class="receipt-items"><table><thead><tr><th class="col-qty">Qté</th><th>Désignation</th><th class="col-price">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>
                <div class="receipt-total">TOTAL: ${formatPrice(order.total)}</div>
                <div class="receipt-footer"><p>Commande non payée</p><p>Merci de votre confiance !</p></div>
            `;
            window.print();
        }
    } catch (e) {
        console.error(e);
        showToast("Erreur lors de l'impression", "error");
    }
};

window.shareOrderWhatsApp = async (orderId) => {
    try {
        const orderDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));
        if(!orderDoc.exists()) return showToast("Commande introuvable", "error");
        
        const order = orderDoc.data();
        const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Ma Boutique";
        const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString('fr-FR') + ' à ' + new Date(order.date.seconds * 1000).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';

        let text = `🧾 *REÇU DE COMMANDE*\n🏪 ${shopName}\n📅 ${dateStr}\n`;
        text += `👤 Client: ${order.client}\n`;
        if(order.telephone) text += `📞 Tel: ${order.telephone}\n`;
        text += `----------------\n`;
        order.items.forEach(i => {
            text += `${i.qty}x ${i.nomDisplay || i.nom} : ${formatPrice(i.prixVente * i.qty)}\n`;
        });
        text += `----------------\n`;
        text += `💰 TOTAL: ${formatPrice(order.total)}\n`;
        text += `📌 Statut: En attente (Non payé)\n\n`;
        text += `Merci de votre confiance !`;

        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } catch (e) {
        console.error(e);
        showToast("Erreur lors du partage", "error");
    }
};
