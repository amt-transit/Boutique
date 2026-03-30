import { db, onSnapshot, query, collection, where, doc, addDoc, getDoc, getDocs, writeBatch, increment, serverTimestamp, updateDoc } from '../firebase.js';
import { showToast, formatPrice, showConfirmModal, formatWhatsAppNumber } from '../ui.js';
import * as state from '../state.js';

let currentOrderFilter = 'en_attente';
let allActiveOrders = [];

export function setupOrdersListener() {
    const container = document.getElementById('orders-list-container');
    if(!container) return;

    if (!state.currentBoutiqueId) return;

    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    let isInitialOrdersLoad = true;

    // On écoute les 3 statuts actifs
    onSnapshot(query(collection(db, "boutiques", state.currentBoutiqueId, "commandes"), where("status", "in", ["en_attente", "en_preparation", "en_route"])), (snap) => {
        allActiveOrders = [];
        let hasNewOrder = false;

        snap.forEach(docSnap => {
            allActiveOrders.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (!isInitialOrdersLoad) {
            snap.docChanges().forEach(change => {
                if (change.type === 'added' && change.doc.data().status === 'en_attente') hasNewOrder = true;
            });
            
            if (hasNewOrder) {
                new Audio('https://actions.google.com/sounds/v1/ui/message_notification.ogg').play().catch(e => console.log('Audio blocked', e));
                if (Notification.permission === "granted") {
                    new Notification("Nouvelle Commande !", { body: "Une nouvelle commande est en attente dans votre boutique." });
                }
            }
        }
        isInitialOrdersLoad = false;

        updateOrderBadges();
        renderOrdersList();
    });
}

window.setOrderFilter = (status) => {
    currentOrderFilter = status;
    
    ['en_attente', 'en_preparation', 'en_route'].forEach(s => {
        const tab = document.getElementById(`tab-${s}`);
        if (tab) {
            if (s === status) {
                tab.className = "px-4 py-2 rounded-full font-bold bg-slate-900 text-white shadow-md transition whitespace-nowrap flex items-center gap-2";
            } else {
                tab.className = "px-4 py-2 rounded-full font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition whitespace-nowrap flex items-center gap-2";
            }
        }
    });
    renderOrdersList();
};

function updateOrderBadges() {
    const countAttente = allActiveOrders.filter(o => o.status === 'en_attente').length;
    const countPrepa = allActiveOrders.filter(o => o.status === 'en_preparation').length;
    const countRoute = allActiveOrders.filter(o => o.status === 'en_route').length;

    const b1 = document.getElementById('badge-nouvelles');
    const b2 = document.getElementById('badge-prepa');
    const b3 = document.getElementById('badge-route');
    
    const mainBadge = document.getElementById('badge-commandes-main');
    const drawerBadge = document.getElementById('badge-commandes-drawer');

    if (b1) { b1.textContent = countAttente; b1.classList.toggle('hidden', countAttente === 0); }
    if (b2) { b2.textContent = countPrepa; b2.classList.toggle('hidden', countPrepa === 0); }
    if (b3) { b3.textContent = countRoute; b3.classList.toggle('hidden', countRoute === 0); }

    // Alerte uniquement sur "Nouvelles" et "En prépa"
    const totalActionNeeded = countAttente + countPrepa; 
    if (mainBadge) { mainBadge.textContent = totalActionNeeded; mainBadge.classList.toggle('hidden', totalActionNeeded === 0); }
    if (drawerBadge) { drawerBadge.textContent = totalActionNeeded; drawerBadge.classList.toggle('hidden', totalActionNeeded === 0); }
}

function renderOrdersList() {
    const container = document.getElementById('orders-list-container');
    if(!container) return;

    const filteredOrders = allActiveOrders.filter(o => o.status === currentOrderFilter);
    
    // Les plus anciennes en premier (Priorité de traitement)
    filteredOrders.sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));

    if (filteredOrders.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center text-gray-400 p-8 bg-white rounded-xl border border-gray-100">Aucune commande dans cette section.</div>';
        return;
    }

    container.innerHTML = '';
    filteredOrders.forEach(order => {
        const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString('fr-FR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '-';
        
        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between hover:shadow-md transition";
        
        let itemsHtml = order.items.map(i => `<div class="flex justify-between text-sm font-bold text-gray-900"><span>${i.qty}x ${i.nomDisplay}${i.variant ? ` <span class="text-blue-500 font-normal">(${i.variant})</span>` : ''}</span><span class="text-slate-600">${formatPrice(i.prixVente * i.qty)}</span></div>`).join('');

        let contactHtml = '<div class="text-xs text-gray-400 mb-1">Aucun numéro</div>';
        if (order.telephone) {
            contactHtml = `<div class="flex items-center gap-2 text-gray-700 mb-2">
                <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                <a href="tel:${order.telephone}" class="hover:text-blue-600 hover:underline font-semibold font-mono tracking-tight">${order.telephone}</a>
            </div>`;
        }
        let addressHtml = order.adresse ? `<div class="flex items-start gap-2 text-gray-500 text-xs mb-2 bg-slate-50 p-2 rounded-lg"><i data-lucide="map-pin" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-400"></i> <span>${order.adresse}</span></div>` : '';
        let paymentHtml = order.paymentMethod && order.paymentMethod !== 'Non spécifié' ? `<div class="flex items-start gap-2 text-gray-500 text-xs bg-slate-50 p-2 rounded-lg"><i data-lucide="credit-card" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500"></i> <span>Paiement prévu : <strong class="text-gray-700">${order.paymentMethod}</strong></span></div>` : '';

        let deliveryHtml = '';
        if (order.status === 'en_route') {
            deliveryHtml = `
            <div class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
                <div class="text-[10px] text-blue-600 font-bold uppercase mb-1">Livreur assigné</div>
                <div class="font-bold text-slate-800 flex items-center gap-2"><i data-lucide="truck" class="w-4 h-4"></i> ${order.livreurNom}</div>
                ${order.livreurTel ? `<div class="text-slate-600 text-xs mt-1">${order.livreurTel}</div>` : ''}
            </div>`;
        }

        let buttonsHtml = '';
        if (order.status === 'en_attente') {
            buttonsHtml = `
                <button onclick="cancelOrder('${order.id}')" class="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition" title="Annuler"><i data-lucide="x" class="w-5 h-5 mx-auto"></i></button>
                <button onclick="shareOrderWhatsApp('${order.id}')" class="bg-green-50 text-green-600 p-2 rounded-lg hover:bg-green-100 transition" title="Contacter"><i data-lucide="message-circle" class="w-5 h-5 mx-auto"></i></button>
                <button onclick="printOrderReceipt('${order.id}')" class="bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition" title="Imprimer"><i data-lucide="printer" class="w-5 h-5 mx-auto"></i></button>
                <button onclick="changeOrderStatus('${order.id}', 'en_preparation')" class="bg-slate-900 text-white py-2 px-4 rounded-lg text-sm font-bold shadow-md hover:bg-slate-800 transition flex-1 flex justify-center items-center gap-2"><i data-lucide="box"></i> Préparer</button>
            `;
        } else if (order.status === 'en_preparation') {
            buttonsHtml = `
                <button onclick="cancelOrder('${order.id}')" class="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition" title="Annuler"><i data-lucide="x" class="w-5 h-5 mx-auto"></i></button>
                <button onclick="shareOrderWhatsApp('${order.id}')" class="bg-green-50 text-green-600 p-2 rounded-lg hover:bg-green-100 transition" title="Contacter"><i data-lucide="message-circle" class="w-5 h-5 mx-auto"></i></button>
                <button onclick="openDeliveryModal('${order.id}')" class="bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition flex-1 flex justify-center items-center gap-2"><i data-lucide="truck"></i> Expédier</button>
            `;
        } else if (order.status === 'en_route') {
            buttonsHtml = `
                <button onclick="cancelOrder('${order.id}')" class="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition" title="Annuler livraison"><i data-lucide="x" class="w-5 h-5 mx-auto"></i></button>
                <button onclick="sendTrackingWhatsApp('${order.id}')" class="bg-[#25D366] text-white py-2 px-3 rounded-lg hover:bg-[#20bd5a] transition text-xs font-bold flex items-center gap-1 shadow"><i data-lucide="message-circle" class="w-4 h-4"></i> Suivi</button>
                <button onclick="validateOrder('${order.id}')" class="bg-emerald-500 text-white py-2 px-4 rounded-lg text-sm font-bold shadow-md hover:bg-emerald-600 transition flex-1 flex justify-center items-center gap-2"><i data-lucide="check-circle"></i> Livrée</button>
            `;
        }

        card.innerHTML = `
            <div class="mb-4 flex-1">
                <div class="flex justify-between items-start mb-3">
                    <h4 class="font-extrabold text-lg text-slate-800 line-clamp-1">${order.client}</h4>
                    <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold whitespace-nowrap">${dateStr}</span>
                </div>
                <div class="mb-3">
                    ${contactHtml}
                    ${addressHtml}
                    ${paymentHtml}
                    ${deliveryHtml}
                </div>
                <div class="space-y-1.5 border-t border-b py-3 my-3 border-slate-100 max-h-40 overflow-y-auto no-scrollbar">
                    ${itemsHtml}
                </div>
                <div class="flex justify-between font-bold text-lg mt-2 items-end">
                    <span class="text-sm text-slate-500">Total</span>
                    <span class="text-slate-900 tracking-tight">${formatPrice(order.total)}</span>
                </div>
            </div>
            <div class="flex gap-2 mt-2">
                ${buttonsHtml}
            </div>
        `;
        container.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
}

window.changeOrderStatus = async (orderId, newStatus) => {
    try {
        await updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId), { status: newStatus, lastUpdate: serverTimestamp() });
        showToast("Statut mis à jour !");
    } catch(e) { console.error(e); showToast("Erreur", "error"); }
};

window.openDeliveryModal = (orderId) => {
    document.getElementById('delivery-order-id').value = orderId;
    document.getElementById('delivery-person-name').value = '';
    document.getElementById('delivery-person-tel').value = '';
    document.getElementById('delivery-modal').classList.remove('hidden');
};

window.confirmExpedition = async () => {
    const orderId = document.getElementById('delivery-order-id').value;
    const name = document.getElementById('delivery-person-name').value.trim();
    const tel = document.getElementById('delivery-person-tel').value.trim();

    if(!name) return showToast("Le nom du livreur est requis", "error");

    try {
        await updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId), { 
            status: 'en_route', livreurNom: name, livreurTel: tel, expedieLe: serverTimestamp()
        });
        document.getElementById('delivery-modal').classList.add('hidden');
        showToast("Commande expédiée !", "success");
    } catch(e) { console.error(e); showToast("Erreur d'expédition", "error"); }
};

window.sendTrackingWhatsApp = (orderId) => {
    const order = allActiveOrders.find(o => o.id === orderId);
    if(!order) return;

    const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "La Boutique";
    let text = `📦 *SUIVI DE COMMANDE* - ${shopName}\n\n`;
    text += `Bonjour ${order.client},\nVotre commande est actuellement *EN ROUTE* 🚚 vers vous !\n\n`;
    text += `👤 *Livreur* : ${order.livreurNom || 'Non spécifié'}\n`;
    if (order.livreurTel) text += `📞 *Contact Livreur* : ${order.livreurTel}\n`;
    text += `\n💰 *Total à payer* : ${formatPrice(order.total)}\n`;
    text += `💳 *Paiement prévu* : ${order.paymentMethod || 'Espèces'}\n\n`;
    text += `Merci de préparer le montant. À très vite !`;

    const formattedPhone = formatWhatsAppNumber(order.telephone);
    const waUrl = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
};

window.validateOrder = (orderId) => {
    const modal = document.getElementById('validate-order-modal');
    if (modal) {
        document.getElementById('validate-order-id').value = orderId;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeValidateOrderModal = () => {
    const modal = document.getElementById('validate-order-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = '';
    }
};

window.confirmValidateOrder = async () => {
    const orderId = document.getElementById('validate-order-id').value;
    const paymentMethod = document.getElementById('validate-order-payment').value;
    
    const order = allActiveOrders.find(o => o.id === orderId);
    if (!order) return;

    try {
        const batch = writeBatch(db);
        
        let finalClientId = order.clientId || null;
        let profitTotal = 0; 
        order.items.forEach(i => { profitTotal += ((i.prixVente || 0) - (i.prixAchat || 0)) * i.qty; });

        // --- INTELLIGENCE CRM : SYNC CATALOGUE -> CLIENTS ---
        if (order.telephone && !finalClientId) {
            const q = query(collection(db, "boutiques", state.currentBoutiqueId, "clients"), where("telephone", "==", order.telephone));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                finalClientId = querySnapshot.docs[0].id;
                // Le client existe, on met à jour sa rentabilité
                batch.update(doc(db, "boutiques", state.currentBoutiqueId, "clients", finalClientId), {
                    totalAchats: increment(order.total),
                    totalProfit: increment(profitTotal)
                });
            } else {
                // Création d'un nouveau profil VIP
                const newClientRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "clients"));
                batch.set(newClientRef, {
                    nom: order.client,
                    telephone: order.telephone,
                    adresse: order.adresse || "",
                    dette: 0,
                    totalAchats: order.total,
                    totalProfit: profitTotal,
                    createdAt: serverTimestamp(),
                    deleted: false,
                    source: 'catalogue_web'
                });
                finalClientId = newClientRef.id;
            }
        } else if (finalClientId) {
            batch.update(doc(db, "boutiques", state.currentBoutiqueId, "clients", finalClientId), {
                totalAchats: increment(order.total),
                totalProfit: increment(profitTotal)
            });
        }
        // ----------------------------------------------------

        // Créer la vente
        const saleRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
        batch.set(saleRef, {
            date: serverTimestamp(), items: order.items, total: order.total, profit: profitTotal, remise: 0, type: paymentMethod, 
            clientId: finalClientId, clientName: order.client, vendeurId: state.userId, deleted: false, isReturned: false, source: 'catalogue_web'
        });

        // Update stock & Delete Order
        order.items.forEach(item => {
            if (!order.stockReserved) {
                const prodRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
                const pDoc = state.allProducts.find(p => p.id === item.id);
                if (pDoc && item.variant && pDoc.variants) {
                    let updatedVariants = [...pDoc.variants];
                    let vIndex = updatedVariants.findIndex(v => v.nom === item.variant);
                    if (vIndex !== -1) {
                        updatedVariants[vIndex].qte = Math.max(0, (updatedVariants[vIndex].qte || updatedVariants[vIndex].stock || 0) - item.qty);
                        updatedVariants[vIndex].stock = updatedVariants[vIndex].qte;
                        batch.update(prodRef, { stock: increment(-item.qty), variants: updatedVariants });
                        return;
                    }
                }
                batch.update(prodRef, { stock: increment(-item.qty) });
            }
        });
        batch.delete(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));

        await batch.commit();
        closeValidateOrderModal();
        showToast("Commande validée et statistiques clients mises à jour !", "success");
    } catch (e) {
        console.error("Erreur validation commande", e);
        showToast("Erreur lors de la validation", "error");
    }
};

window.cancelOrder = (orderId) => {
    showConfirmModal("Annuler la commande", "Annuler cette commande et remettre les articles en stock ?", async () => {
        try {
            const orderDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId, "commandes", orderId));
            if(!orderDoc.exists()) return;
            const order = orderDoc.data();

            const batch = writeBatch(db);

            const isStockAlreadyReserved = order.stockReserved === true || (order.stockReserved === undefined && !!order.vendeurId);
            
            if (isStockAlreadyReserved) {
                for (const item of order.items) {
                    const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
                    const pDoc = await getDoc(pRef);
                    if(pDoc.exists() && item.variant && pDoc.data().variants) {
                        let updatedVariants = [...pDoc.data().variants];
                        let vIndex = updatedVariants.findIndex(v => v.nom === item.variant);
                        if (vIndex !== -1) {
                            updatedVariants[vIndex].qte = (updatedVariants[vIndex].qte || updatedVariants[vIndex].stock || 0) + item.qty;
                            updatedVariants[vIndex].stock = updatedVariants[vIndex].qte;
                            batch.update(pRef, { stock: increment(item.qty), variants: updatedVariants });
                            continue;
                        }
                    }
                    batch.update(pRef, { stock: increment(item.qty) });
                }
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
    const paymentMethod = document.getElementById('order-payment-method')?.value || 'Non spécifié';

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
            const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
            const prodInState = state.allProducts.find(p => p.id === item.id);

            if (item.variant && prodInState && prodInState.variants) {
                let updatedVariants = [...prodInState.variants];
                let vIndex = updatedVariants.findIndex(v => v.nom === item.variant);
                if (vIndex !== -1) {
                    updatedVariants[vIndex].qte = Math.max(0, (updatedVariants[vIndex].qte || updatedVariants[vIndex].stock || 0) - item.qty);
                    updatedVariants[vIndex].stock = updatedVariants[vIndex].qte;
                    batch.update(pRef, { stock: increment(-item.qty), variants: updatedVariants });
                } else {
                    batch.update(pRef, { stock: increment(-item.qty) });
                }
            } else {
                batch.update(pRef, { stock: increment(-item.qty) });
            }
        }

        batch.set(orderRef, {
            client: clientName,
            telephone: clientTel,
            items: items,
            total: total,
            status: 'en_attente',
            date: serverTimestamp(),
            vendeurId: state.userId,
            stockReserved: true,
            paymentMethod: paymentMethod
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
            
            let itemsHtml = items.map(i => `<tr><td class="col-qty">${i.qty}</td><td>${i.nomDisplay || i.nom}${i.variant ? ` (${i.variant})` : ''}</td><td class="col-price">${formatPrice(i.prixVente * i.qty)}</td></tr>`).join('');

            const printableArea = document.getElementById('printable-area');
            if (printableArea) {
                printableArea.innerHTML = `
                    <div class="receipt-header"><h1>${shopName}</h1><p>${dateStr}</p><p style="font-weight: bold; margin-top: 2mm;">Ticket - COMMANDE</p><p>Client: ${clientName}</p>${clientTel ? `<p>Tel: ${clientTel}</p>` : ''}${paymentMethod !== 'Non spécifié' ? `<p>Paiement prévu: ${paymentMethod}</p>` : ''}</div>
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
        const order = allActiveOrders.find(o => o.id === orderId);
        if(!order) return showToast("Commande introuvable", "error");
        
        const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Ma Boutique";
        const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString('fr-FR') + ' à ' + new Date(order.date.seconds * 1000).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';

        let itemsHtml = order.items.map(i => `<tr><td class="col-qty">${i.qty}</td><td>${i.nomDisplay || i.nom}${i.variant ? ` (${i.variant})` : ''}</td><td class="col-price">${formatPrice(i.prixVente * i.qty)}</td></tr>`).join('');

        const printableArea = document.getElementById('printable-area');
        if (printableArea) {
            printableArea.innerHTML = `
                <div class="receipt-header"><h1>${shopName}</h1><p>${dateStr}</p><p style="font-weight: bold; margin-top: 2mm;">Ticket - COMMANDE</p><p>Client: ${order.client}</p>${order.telephone ? `<p>Tel: ${order.telephone}</p>` : ''}${order.paymentMethod && order.paymentMethod !== 'Non spécifié' ? `<p>Paiement prévu: ${order.paymentMethod}</p>` : ''}</div>
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
        const order = allActiveOrders.find(o => o.id === orderId);
        if(!order) return showToast("Commande introuvable", "error");
        
        const shopName = document.getElementById('dashboard-user-name')?.textContent.trim() || "Ma Boutique";
        const dateStr = order.date ? new Date(order.date.seconds * 1000).toLocaleDateString('fr-FR') + ' à ' + new Date(order.date.seconds * 1000).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '';

        let text = `🧾 *REÇU DE COMMANDE*\n🏪 ${shopName}\n📅 ${dateStr}\n`;
        text += `👤 Client: ${order.client}\n`;
        if(order.telephone) text += `📞 Tel: ${order.telephone}\n`;
        if(order.paymentMethod && order.paymentMethod !== 'Non spécifié') text += `💳 Paiement: ${order.paymentMethod}\n`;
        text += `----------------\n`;
        order.items.forEach(i => {
            text += `${i.qty}x ${i.nomDisplay || i.nom}${i.variant ? ` (${i.variant})` : ''} : ${formatPrice(i.prixVente * i.qty)}\n`;
        });
        text += `----------------\n`;
        text += `💰 TOTAL: ${formatPrice(order.total)}\n`;
        text += `📌 Statut: En attente (Non payé)\n\n`;
        text += `Merci de votre confiance !`;

        const formattedPhone = formatWhatsAppNumber(order.telephone);
        const waUrl = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
    } catch (e) {
        console.error(e);
        showToast("Erreur lors du partage", "error");
    }
};
