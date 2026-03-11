// src/pages/sales.js
import { db, collection, doc, getDocs, setDoc, writeBatch, increment, serverTimestamp } from '../firebase.js';
import { showToast, formatPrice, showConfirmModal } from '../ui.js';
import * as state from '../state.js';

let isQuickAddMode = false;

async function loadClientsIntoSelect() {
    const select = document.getElementById('credit-client-select');
    select.innerHTML = '<option value="">Chargement...</option>';
    const clientsSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "clients"));
    if (clientsSnap.empty) { 
        select.innerHTML = '<option value="">Aucun client</option>'; 
        return; 
    }
    select.innerHTML = '<option value="">-- Choisir un client --</option>';
    clientsSnap.forEach(doc => { 
        if(!doc.data().deleted) { 
            const opt = document.createElement('option'); 
            opt.value = doc.id; 
            opt.textContent = doc.data().nom; 
            select.appendChild(opt); 
        }
    });
}

function showInvoiceModal(items, total, type, clientName) {
    const modal = document.getElementById('invoice-modal');
    if (!modal) return;

    document.getElementById('invoice-amount').textContent = formatPrice(total);
    
    const shopName = document.getElementById('dashboard-user-name').textContent.trim();
    const date = new Date();
    const dateStr = date.toLocaleDateString('fr-FR') + ' à ' + date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    
    // --- WhatsApp Message ---
    let receiptText = `🧾 *REÇU*\n🏪 ${shopName}\n📅 ${dateStr}\n`;
    if(clientName) receiptText += `👤 Client: ${clientName}\n`;
    receiptText += `----------------\n`;
    let itemsHtml = "";
    items.forEach(i => { 
        receiptText += `${i.qty}x ${i.nomDisplay}: ${formatPrice(i.prixVente*i.qty)}\n`; 
        itemsHtml += `<div class="flex justify-between"><span>${i.qty}x ${i.nomDisplay}</span><span>${formatPrice(i.prixVente*i.qty)}</span></div>`; 
    });
    receiptText += `----------------\n💰 TOTAL: ${formatPrice(total)}\n`;
    
    document.getElementById('invoice-preview').innerHTML = itemsHtml;
    document.getElementById('btn-whatsapp-share').href = `https://wa.me/?text=${encodeURIComponent(receiptText)}`;

    // --- Print Logic ---
    const printBtn = document.getElementById('btn-print-receipt');
    const printableArea = document.getElementById('printable-area');

    if (printBtn && printableArea) {
        printBtn.onclick = () => {
            let receiptContent = `
                <div class="receipt-header">
                    <h1>${shopName}</h1>
                    <p>${dateStr}</p>
                    ${clientName ? `<p>Client: ${clientName}</p>` : ''}
                </div>
                <div class="receipt-items">
                    <table>
                        <thead>
                            <tr>
                                <th class="col-qty">Qté</th>
                                <th>Produit</th>
                                <th class="col-price">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(i => `
                                <tr>
                                    <td class="col-qty">${i.qty}</td>
                                    <td>${i.nomDisplay}</td>
                                    <td class="col-price">${formatPrice(i.prixVente * i.qty)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="receipt-total">
                    TOTAL: ${formatPrice(total)}
                </div>
                <div class="receipt-footer">
                    <p>Merci pour votre achat !</p>
                </div>
            `;
            printableArea.innerHTML = receiptContent;
            window.print();
        };
    }

    modal.classList.remove('hidden');
}

async function processSale(type, clientId, clientName) {
    try {
        const batch = writeBatch(db);
        const saleRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
        let total = 0, profit = 0;
        const itemsForInvoice = JSON.parse(JSON.stringify(state.saleCart)); 
        
        for (const item of state.saleCart) {
            total += item.prixVente * item.qty;
            profit += (item.prixVente - (item.prixAchat || 0)) * item.qty;
            const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(-item.qty), quantiteVendue: increment(item.qty) });
        }
        
        if (type === 'credit' && clientId) {
            batch.update(doc(db, "boutiques", state.currentBoutiqueId, "clients", clientId), { dette: increment(total) });
        }
        
        batch.set(saleRef, { items: state.saleCart, total, profit, date: serverTimestamp(), vendeurId: state.userId, type, clientId: clientId || null, clientName: clientName || null, deleted: false, isReturned: false });
        
        await batch.commit();
        showInvoiceModal(itemsForInvoice, total, type, clientName);
        state.clearCart(); 
        renderCart();
    } catch (err) { 
        console.error(err); 
        showToast("Erreur vente", "error"); 
    }
}

export function setupSalesPage() {
    if (!state.currentBoutiqueId) return;

    const searchInput = document.getElementById('sale-search');
    const resultsDiv = document.getElementById('sale-search-results');
    const btnCash = document.getElementById('btn-validate-cash');
    const btnCredit = document.getElementById('btn-open-credit-modal');
    const btnQuickAdd = document.getElementById('btn-quick-add-client');
    const dateDisplay = document.getElementById('current-date-display');
    const btnScan = document.getElementById('btn-scan-product');

    if (btnScan) btnScan.addEventListener('click', window.startScanner);
    if(dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
    
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        resultsDiv.innerHTML = '';
        if (term.length < 1) { 
            resultsDiv.classList.add('hidden'); 
            return; 
        }
        const matches = state.allProducts.filter(p => p.nom.includes(term) && !p.deleted && p.stock > 0);
        if (matches.length > 0) {
            resultsDiv.classList.remove('hidden');
            matches.forEach(p => {
                const div = document.createElement('div');
                div.className = "p-3 hover:bg-blue-50 cursor-pointer border-b flex justify-between";
                div.innerHTML = `<span>${p.nomDisplay}</span><span class="text-green-600 font-bold">${p.stock}</span>`;
                div.onclick = () => {
                    if (state.addToCart(p)) {
                        renderCart();
                        searchInput.value = '';
                        resultsDiv.classList.add('hidden');
                    } else {
                        showToast("Stock insuffisant", "error");
                    }
                };
                resultsDiv.appendChild(div);
            });
        } else { 
            resultsDiv.classList.add('hidden'); 
        }
    });

    document.addEventListener('click', (e) => { 
        if (!searchInput.contains(e.target)) resultsDiv.classList.add('hidden'); 
    });

    btnCash.addEventListener('click', () => { 
        if (state.saleCart.length === 0) return showToast("Vide", "error"); 
        showConfirmModal("Encaisser ?", `Total: ${document.getElementById('cart-total-display').textContent}`, () => processSale('cash', null, null)); 
    });
    
    btnCredit.addEventListener('click', async () => { 
        if (state.saleCart.length === 0) return showToast("Vide", "error"); 
        await loadClientsIntoSelect(); 
        document.getElementById('credit-sale-modal').classList.remove('hidden'); 
    });

    if(btnQuickAdd) btnQuickAdd.addEventListener('click', () => { 
        document.getElementById('credit-sale-modal').classList.add('hidden'); 
        document.getElementById('add-client-modal').classList.remove('hidden'); 
        isQuickAddMode = true; 
    });

    document.getElementById('confirm-credit-sale-btn').addEventListener('click', async () => { 
        const sel = document.getElementById('credit-client-select'); 
        if (!sel.value) return showToast("Client?", "error"); 
        document.getElementById('credit-sale-modal').classList.add('hidden'); 
        await processSale('credit', sel.value, sel.options[sel.selectedIndex]?.text); 
    });

    // Handle quick add client form
    const clientForm = document.getElementById('form-client');
    if(clientForm) {
        clientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await setDoc(doc(collection(db, "boutiques", state.currentBoutiqueId, "clients")), { 
                    nom: document.getElementById('client-nom').value, 
                    telephone: document.getElementById('client-tel').value, 
                    dette: 0, 
                    createdAt: serverTimestamp(), 
                    deleted: false 
                });
                clientForm.reset();
                document.getElementById('add-client-modal').classList.add('hidden');
                showToast("Client ajouté");
                if (isQuickAddMode) {
                    await loadClientsIntoSelect();
                    document.getElementById('credit-sale-modal').classList.remove('hidden');
                    isQuickAddMode = false;
                }
            } catch(e) {
                showToast("Erreur", "error");
            }
        });
    }

    // Mobile Money Modal
    const btnMomo = document.getElementById('btn-open-momo-modal');
    const momoModal = document.getElementById('momo-modal');
    const momoNetBtns = document.querySelectorAll('.momo-net-btn');
    const momoNetworkInput = document.getElementById('momo-selected-network');
    const btnConfirmMomo = document.getElementById('btn-confirm-momo');

    if(btnMomo) {
        btnMomo.addEventListener('click', () => {
            if (state.saleCart.length === 0) return showToast("Le panier est vide", "error");
            momoModal.classList.remove('hidden');
            momoNetworkInput.value = "";
            document.getElementById('momo-client-phone').value = "";
            momoNetBtns.forEach(b => b.classList.remove('border-teal-500', 'bg-teal-50'));
        });
    }

    momoNetBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            momoNetBtns.forEach(b => b.classList.remove('border-teal-500', 'bg-teal-50'));
            this.classList.add('border-teal-500', 'bg-teal-50');
            momoNetworkInput.value = this.getAttribute('data-net');
        });
    });

    if(btnConfirmMomo) {
        btnConfirmMomo.addEventListener('click', async () => {
            const network = momoNetworkInput.value;
            const phone = document.getElementById('momo-client-phone').value.trim();

            if(!network) return showToast("Veuillez choisir un opérateur", "error");
            if(!phone || phone.length < 8) return showToast("Numéro de téléphone invalide", "error");

            momoModal.classList.add('hidden');
            
            await processSale('mobile_money', null, `Client ${network} (${phone})`);
        });
    }
}

export function renderCart() {
    const tb = document.getElementById('cart-table-body');
    const total = state.getCartTotal();
    document.getElementById('cart-total-display').textContent = formatPrice(total);
    
    if (state.saleCart.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">Le panier est vide.</td></tr>';
        return;
    }
    
    tb.innerHTML = state.saleCart.map((i, x) => {
        const ts = i.addedAt ? new Date(i.addedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
        return `<tr class="border-b last:border-0">
            <td class="p-3"><div>${i.nomDisplay}</div><small class="text-gray-400">${ts}</small></td>
            <td class="p-3 text-center"><input type="number" value="${i.prixVente}" onchange="updateItemPrice(${x}, this.value)" class="w-24 p-1 border rounded text-center"></td>
            <td class="p-3 text-center flex justify-center items-center gap-1"><button onclick="updateQty(${x}, -1)" class="w-6 bg-gray-200 rounded">-</button><span class="w-8 font-bold text-sm text-center">${i.qty}</span><button onclick="updateQty(${x}, 1)" class="w-6 bg-gray-200 rounded">+</button></td>
            <td class="p-3 text-right font-bold">${formatPrice(i.prixVente * i.qty)}</td>
            <td class="p-3 text-right"><button onclick="removeItemFromCart(${x})" class="text-red-500 p-1">X</button></td>
        </tr>`;
    }).join('');
}

window.updateItemPrice = (index, value) => {
    state.updateCartItemPrice(index, parseFloat(value));
    renderCart();
};

window.updateQty = (index, delta) => {
    if (state.updateCartItemQty(index, delta)) {
        renderCart();
    } else {
        showToast("Stock maximum atteint", "error");
    }
};

window.removeItemFromCart = (index) => {
    state.saleCart.splice(index, 1);
    renderCart();
}

window.clearCart = () => {
    if (state.saleCart.length > 0 && confirm("Vider le panier ?")) {
        state.clearCart();
        renderCart();
    }
};
