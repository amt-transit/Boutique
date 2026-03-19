// src/pages/sales.js
import { db, collection, doc, getDocs, setDoc, writeBatch, increment, serverTimestamp, onSnapshot } from '../firebase.js'; 
import { showToast, formatPrice, showConfirmModal, showPromptModal } from '../ui.js';
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

function showInvoiceModal(items, total, discount, type, clientName) {
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
    if (discount > 0) {
        receiptText += `🎁 Remise: -${formatPrice(discount)}\n`;
        itemsHtml += `<div class="flex justify-between text-red-500 font-bold border-t border-gray-200 mt-2 pt-2"><span>Remise</span><span>-${formatPrice(discount)}</span></div>`;
    }
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
                            ${discount > 0 ? `
                                <tr>
                                    <td colspan="2" style="text-align: right; font-weight: bold;">Remise</td>
                                    <td class="col-price" style="color: red;">-${formatPrice(discount)}</td>
                                </tr>
                            ` : ''}
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
        let rawTotal = 0, profit = 0;
        const itemsForInvoice = JSON.parse(JSON.stringify(state.saleCart)); 
        const discount = state.cartDiscount || 0;
        
        for (const item of state.saleCart) {
            rawTotal += item.prixVente * item.qty;
            profit += (item.prixVente - (item.prixAchat || 0)) * item.qty;
            const pRef = doc(db, "boutiques", state.currentBoutiqueId, "products", item.id);
            batch.update(pRef, { stock: increment(-item.qty), quantiteVendue: increment(item.qty) });
        }
        
        const finalTotal = Math.max(0, rawTotal - discount);
        profit -= discount; // La remise diminue directement le bénéfice final

        if (type === 'credit' && clientId) {
            batch.update(doc(db, "boutiques", state.currentBoutiqueId, "clients", clientId), { dette: increment(finalTotal) });
        }
        
        batch.set(saleRef, { items: state.saleCart, total: finalTotal, remise: discount, profit, date: serverTimestamp(), vendeurId: state.userId, type, clientId: clientId || null, clientName: clientName || null, deleted: false, isReturned: false });
        
        await batch.commit();
        showInvoiceModal(itemsForInvoice, finalTotal, discount, type, clientName);
        state.clearCart(); 
        renderCart();
    } catch (err) { 
        console.error(err); 
        showToast("Erreur vente", "error"); 
    }
}

export function setupSalesPage() {
    if (!state.currentBoutiqueId) return;

    // Charger et surveiller les produits pour la grille de la caisse
    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "products"), (snap) => {
        const products = [];
        snap.forEach(d => {
            const p = { id: d.id, ...d.data() };
            if (!p.deleted && p.stock > 0) products.push(p);
        });
        // Tri alphabétique
        products.sort((a,b) => (a.nomDisplay||"").localeCompare(b.nomDisplay||""));
        state.setAllProducts(products);
        renderProductGrid();
    });

    const searchInput = document.getElementById('sale-search');
    const btnCash = document.getElementById('btn-validate-cash');
    const btnCredit = document.getElementById('btn-open-credit-modal');
    const btnQuickAdd = document.getElementById('btn-quick-add-client');
    const dateDisplay = document.getElementById('current-date-display');
    const btnScan = document.getElementById('btn-scan-product');

    if (btnScan) btnScan.addEventListener('click', window.startScanner);
    if(dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
    
    searchInput.addEventListener('input', (e) => {
        renderProductGrid(e.target.value);
    });

    btnCash.addEventListener('click', () => { 
        if (state.saleCart.length === 0) return showToast("Vide", "error"); 
        showConfirmModal("Confirmer l'encaissement", `Total à encaisser : ${document.getElementById('cart-total-display').textContent}`, () => processSale('cash', null, null)); 
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

    const confirmCreditBtn = document.getElementById('confirm-credit-sale-btn');
    if (confirmCreditBtn) {
        confirmCreditBtn.addEventListener('click', async () => { 
            const sel = document.getElementById('credit-client-select'); 
            if (!sel.value) return showToast("Client?", "error"); 
            document.getElementById('credit-sale-modal').classList.add('hidden'); 
            await processSale('credit', sel.value, sel.options[sel.selectedIndex]?.text); 
        });
    }

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

export function renderProductGrid(searchTerm = "") {
    const grid = document.getElementById('pos-product-grid');
    if(!grid) return;
    
    const term = searchTerm.toLowerCase();
    const filtered = state.allProducts.filter(p => p.nomDisplay.toLowerCase().includes(term));

    if(filtered.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center p-10 text-gray-400 font-bold">Aucun article trouvé.</div>';
        return;
    }

    // Couleurs dynamiques pour les icônes afin d'aider à la mémorisation visuelle
    const colors = ['bg-red-100 text-red-600', 'bg-blue-100 text-blue-600', 'bg-green-100 text-green-600', 'bg-purple-100 text-purple-600', 'bg-orange-100 text-orange-600', 'bg-teal-100 text-teal-600', 'bg-pink-100 text-pink-600'];

    grid.innerHTML = filtered.map(p => {
        const init = p.nomDisplay.substring(0, 2).toUpperCase();
        const colorClass = colors[p.nomDisplay.charCodeAt(0) % colors.length];
        
        return `
        <div onclick="window.addToCartById('${p.id}')" class="bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:shadow-md active:scale-95 transition h-32 select-none">
            <div class="w-12 h-12 rounded-full ${colorClass} flex items-center justify-center font-extrabold text-xl mb-2 shadow-sm pointer-events-none">${init}</div>
            <div class="text-[11px] font-bold text-center text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight pointer-events-none">${p.nomDisplay}</div>
            <div class="text-sm text-blue-600 dark:text-blue-400 font-extrabold mt-1 pointer-events-none">${formatPrice(p.prixVente)}</div>
        </div>`;
    }).join('');
}

window.addToCartById = (id) => {
    const p = state.allProducts.find(x => x.id === id);
    if(p) {
        if (state.addToCart(p)) {
            renderCart();
        } else {
            showToast("Stock insuffisant !", "warning");
        }
    }
};

export function renderCart() {
    const tb = document.getElementById('cart-table-body');
    if (!tb) return;
    const rawTotal = state.getCartTotal();
    const finalTotal = Math.max(0, rawTotal - state.cartDiscount);
    
    document.getElementById('cart-total-display').textContent = formatPrice(finalTotal);
    
    const discountDisplay = document.getElementById('cart-discount-display');
    if(discountDisplay) {
        if(state.cartDiscount > 0) {
            discountDisplay.textContent = `Remise: -${formatPrice(state.cartDiscount)}`;
            discountDisplay.classList.remove('hidden');
        } else discountDisplay.classList.add('hidden');
    }
    
    if (state.saleCart.length === 0) {
        tb.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-gray-400 italic font-medium">Panier vide.</td></tr>';
        return;
    }
    
    tb.innerHTML = state.saleCart.map((i, x) => {
        return `<tr class="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition">
            <td class="p-2 border-b dark:border-slate-700"><div class="font-bold text-xs text-gray-800 dark:text-gray-200">${i.nomDisplay}</div><div class="text-[10px] text-blue-500 font-bold cursor-pointer inline-flex items-center gap-1 hover:text-blue-700" onclick="promptEditPrice(${x})" title="Modifier le prix de cet article">${formatPrice(i.prixVente)}/u <i data-lucide="edit-2" class="w-3 h-3"></i></div></td>
            <td class="p-2 border-b dark:border-slate-700 text-center"><div class="flex justify-center items-center gap-1 bg-gray-100 dark:bg-slate-900 rounded p-1"><button onclick="updateQty(${x}, -1)" class="w-6 h-6 bg-white dark:bg-slate-700 rounded shadow-sm text-gray-700 dark:text-gray-300 font-bold">-</button><span class="w-6 font-extrabold text-sm text-center dark:text-white">${i.qty}</span><button onclick="updateQty(${x}, 1)" class="w-6 h-6 bg-white dark:bg-slate-700 rounded shadow-sm text-gray-700 dark:text-gray-300 font-bold">+</button></div></td>
            <td class="p-2 border-b dark:border-slate-700 text-right font-extrabold text-blue-600 dark:text-blue-400 text-sm">${formatPrice(i.prixVente * i.qty)}</td>
            <td class="p-2 border-b dark:border-slate-700 text-right"><button onclick="removeItemFromCart(${x})" class="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition"><i data-lucide="x" class="w-4 h-4"></i></button></td>
        </tr>`;
    }).join('');
    if(window.lucide) window.lucide.createIcons();
}

window.promptEditPrice = (index) => {
    const item = state.saleCart[index];
    if(!item) return;
    showPromptModal("Négociation", `Nouveau prix unitaire pour ${item.nomDisplay} :`, "number", (val) => {
        const newPrice = parseFloat(val);
        if (!isNaN(newPrice) && newPrice >= 0) {
            state.updateCartItemPrice(index, newPrice);
            renderCart();
        } else showToast("Prix invalide", "error");
    });
};

window.promptGlobalDiscount = () => {
    showPromptModal("Remise Globale", "Entrez le montant de la remise à retirer (en CFA) :", "number", (val) => {
        const discount = parseFloat(val) || 0;
        const rawTotal = state.getCartTotal();
        if (discount < 0 || discount > rawTotal) {
            return showToast("Montant de la remise invalide.", "error");
        }
        state.setCartDiscount(discount);
        renderCart();
    });
};

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
    if (state.saleCart.length > 0) {
        showConfirmModal("Annuler", "Vider complètement le panier ?", () => {
            state.clearCart();
            renderCart();
        });
    }
};
