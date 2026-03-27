// src/pages/stock.js
import { db, onSnapshot, collection, query, where, getDocs, doc, writeBatch, increment, serverTimestamp, updateDoc, storage, ref, uploadString, getDownloadURL } from '../firebase.js'; 
import { showToast, formatPrice, showPromptModal, showConfirmModal } from '../ui.js';
import * as state from '../state.js';

// --- COMPRESSEUR D'IMAGE ---
// Prend un fichier image et le réduit à ~50-100Ko max
function compressImage(file, maxSize = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Redimensionnement
                if (width > height) {
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                } else {
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compression en JPEG qualité moyenne (0.7)
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = e => reject(e);
        };
        reader.onerror = e => reject(e);
    });
}

export function setupStockManagement() {
    if (!state.currentBoutiqueId) return;

    const stockForm = document.getElementById('form-stock');
    const editForm = document.getElementById('form-edit-product');
    const searchInput = document.getElementById('stock-search-input');
    const sortSelect = document.getElementById('stock-sort-select');
    const btnScanNew = document.getElementById('btn-scan-new-prod');
    if (btnScanNew) {
        btnScanNew.addEventListener('click', () => {
            state.setIsScanningForNewProduct(true);
            window.startScanner();
        });
    }

        const LOW_STOCK_THRESHOLD = 5;
    let notifiedLowStock = new Set();

    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "products"), (snap) => {
        const products = [];
        snap.forEach(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            if (p.deleted && state.userRole === 'seller') return;
            products.push(p);

            // --- Real-time Low Stock Notification Logic ---
            if (!p.deleted && !p.discontinued && p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD) {
                if (!notifiedLowStock.has(p.id)) {
                    // Only show toast if not on the stock page
                    const stockPage = document.getElementById('page-stock');
                    if (stockPage && stockPage.classList.contains('hidden')) {
                         showToast(`Stock faible: ${p.nomDisplay} (reste ${p.stock})`, 'warning');
                    }
                    notifiedLowStock.add(p.id);
                }
            } else if (p.stock >= LOW_STOCK_THRESHOLD) {
                // If product is restocked, remove it from the notified set to allow future notifications
                if (notifiedLowStock.has(p.id)) {
                    notifiedLowStock.delete(p.id);
                }
            }
            // --- End of Notification Logic ---
        });
        state.setAllProducts(products);

        const lowStockBadge = document.getElementById('dash-low-stock-badge');
        if (lowStockBadge) {
            const lowCount = state.allProducts.filter(p => !p.deleted && !p.discontinued && p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD).length;
            lowStockBadge.textContent = lowCount;
            lowStockBadge.classList.toggle('hidden', lowCount === 0);
        }
        renderStockTable();
    });

    if(searchInput) searchInput.addEventListener('input', renderStockTable);
    if(sortSelect) sortSelect.addEventListener('change', renderStockTable);

    const nameInput = document.getElementById('prod-nom');
    const suggestionsDiv = document.getElementById('prod-nom-suggestions');
    if(nameInput && suggestionsDiv) {
        nameInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            suggestionsDiv.innerHTML = '';
            if (val.length < 1) { suggestionsDiv.classList.add('hidden'); return; }
            const uniqueNames = [...new Set(state.allProducts.map(p => p.nomDisplay))];
            const matches = uniqueNames.filter(n => n.toLowerCase().includes(val));
            if (matches.length > 0) {
                suggestionsDiv.classList.remove('hidden');
                matches.forEach(matchName => {
                    const div = document.createElement('div');
                    div.className = "p-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 border-b last:border-0";
                    div.textContent = matchName;
                    div.onclick = () => {
                        nameInput.value = matchName;
                        suggestionsDiv.classList.add('hidden');
                        const existingProduct = state.allProducts.find(p => p.nomDisplay === matchName);
                        if(existingProduct) {
                            document.getElementById('prod-achat').value = existingProduct.prixAchat;
                            document.getElementById('prod-prix').value = existingProduct.prixVente;
                            showToast("Produit existant détecté", "success");
                        }
                    };
                    suggestionsDiv.appendChild(div);
                });
            } else { suggestionsDiv.classList.add('hidden'); }
        });
        document.addEventListener('click', (e) => { if(e.target !== nameInput && e.target !== suggestionsDiv) suggestionsDiv.classList.add('hidden'); });
    }

    const checkboxVariants = document.getElementById('has-variants-checkbox');
    const zoneStandard = document.getElementById('standard-inputs-zone');
    const zoneVariants = document.getElementById('variants-inputs-zone');
    const btnAddVariant = document.getElementById('btn-add-variant');
    const variantsList = document.getElementById('variants-list');

    if(checkboxVariants) {
        checkboxVariants.addEventListener('change', (e) => {
            zoneStandard.classList.toggle('hidden', e.target.checked);
            zoneVariants.classList.toggle('hidden', !e.target.checked);
            document.getElementById('prod-qte').required = !e.target.checked;
        });
    }

    if(btnAddVariant) {
        btnAddVariant.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = "flex gap-2 items-center variant-row animate-fade-in-up mt-2";
            row.innerHTML = `
                <input type="text" placeholder="Ex: 43 Rouge" class="var-nom p-2 border rounded flex-1 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-300" required>
                <input type="text" placeholder="Code barre (opt.)" class="var-code p-2 border rounded w-1/3 text-sm bg-gray-50 outline-none">
                <input type="number" placeholder="Qté" class="var-qte p-2 border rounded w-20 text-sm font-bold text-center border-green-300 outline-none" required min="0">
                <button type="button" class="text-gray-400 hover:text-red-500 p-1" onclick="if(document.querySelectorAll('.variant-row').length>1) this.parentElement.remove()"><i data-lucide="x-circle" class="w-5 h-5"></i></button>
            `;
            variantsList.appendChild(row);
            if(window.lucide) window.lucide.createIcons();
        });
    }

    // --- GESTION DE L'IMAGE DU PRODUIT ---
    const imageInput = document.getElementById('prod-image');
    const imagePreview = document.getElementById('prod-image-preview');
    let compressedImageDataUrl = null;

    if (imageInput) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                compressedImageDataUrl = await compressImage(file);
                imagePreview.src = compressedImageDataUrl;
                imagePreview.classList.remove('hidden');
            } catch(err) { console.error(err); showToast("Erreur de compression d'image", "error"); }
        });
    }

    // --- GESTION DE L'IMAGE D'EDITION ---
    const editImageInput = document.getElementById('edit-prod-image');
    const editImagePreview = document.getElementById('edit-prod-image-preview');
    let compressedEditImageDataUrl = null;

    if (editImageInput) {
        editImageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                compressedEditImageDataUrl = await compressImage(file);
                editImagePreview.src = compressedEditImageDataUrl;
                editImagePreview.classList.remove('hidden');
            } catch(err) { console.error(err); showToast("Erreur compression d'image", "error"); }
        });
    }

    if(stockForm) {
        stockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const nomBaseBrut = document.getElementById('prod-nom').value.trim();
            const pAchat = parseFloat(document.getElementById('prod-achat').value)||0;
            const pVente = parseFloat(document.getElementById('prod-prix').value)||0;
            const isVariantMode = checkboxVariants.checked;

            try {
                // --- UPLOAD IMAGE (SI EXISTANTE) ---
                let finalImageUrl = null;
                if (compressedImageDataUrl) {
                    showToast("Envoi de l'image en cours...", "info");
                    const fileName = `products/${state.currentBoutiqueId}_${Date.now()}.jpg`;
                    const storageRef = ref(storage, fileName);
                    try {
                        await uploadString(storageRef, compressedImageDataUrl, 'data_url');
                        finalImageUrl = await getDownloadURL(storageRef);
                    } catch(uploadErr) {
                        console.error("Erreur Upload:", uploadErr);
                        showToast("L'image n'a pas pu être envoyée.", "warning");
                    }
                }

                const batch = writeBatch(db);
                let productsToCreate = [];

                if (isVariantMode) {
                    const rows = document.querySelectorAll('.variant-row');
                    rows.forEach(row => {
                        const vNom = row.querySelector('.var-nom').value.trim();
                        if(vNom) {
                            const fullName = `${nomBaseBrut} - ${vNom}`;
                            productsToCreate.push({
                                nomBrut: fullName,
                                nom: fullName.toLowerCase(),
                                codeBarre: row.querySelector('.var-code').value.trim(),
                                qte: parseInt(row.querySelector('.var-qte').value) || 0,
                                isVariant: true,
                                parentName: nomBaseBrut,
                                image: finalImageUrl
                            });
                        }
                    });
                } else {
                    productsToCreate.push({
                        nomBrut: nomBaseBrut,
                        nom: nomBaseBrut.toLowerCase(),
                        codeBarre: document.getElementById('prod-code').value.trim(),
                        qte: parseInt(document.getElementById('prod-qte').value) || 0,
                        isVariant: false,
                        parentName: null,
                        image: finalImageUrl
                    });
                }

                for (const item of productsToCreate) {
                    let existingByCode = null;
                    if (item.codeBarre) {
                        existingByCode = state.allProducts.find(p => p.codeBarre === item.codeBarre && !p.deleted);
                    }
                    
                    const q = query(collection(db, "boutiques", state.currentBoutiqueId, "products"), where("nom", "==", item.nom), where("deleted", "==", false));
                    const snap = await getDocs(q);

                    let productId = null;

                    if (!snap.empty || existingByCode) {
                        const docExist = snap.empty ? null : snap.docs[0];
                        const existingData = existingByCode || (docExist ? {id: docExist.id, ...docExist.data()} : null);
                        
                        if (existingData) {
                            productId = existingData.id;
                            const ref = doc(db, "boutiques", state.currentBoutiqueId, "products", productId);
                            let updateData = { stock: increment(item.qte), prixAchat: pAchat, prixVente: pVente, codeBarre: item.codeBarre || existingData.codeBarre, lastRestock: serverTimestamp() };
                            if (item.image) updateData.image = item.image;
                            batch.update(ref, updateData);
                        }
                    } else {
                        const newRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "products"));
                        productId = newRef.id;
                        batch.set(newRef, { nom: item.nom, nomDisplay: item.nomBrut, codeBarre: item.codeBarre, prixVente: pVente, prixAchat: pAchat, stock: item.qte, quantiteVendue: 0, isVariant: item.isVariant, parentName: item.parentName, image: item.image || null, createdAt: serverTimestamp(), deleted: false });
                    }

                    if (item.qte > 0 && productId) {
                        const histRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"));
                        batch.set(histRef, { productId: productId, nom: item.nomBrut, type: 'ajout', quantite: item.qte, prixAchat: pAchat, date: serverTimestamp(), user: state.userId });
                    }
                }

                await batch.commit();
                
                showToast(`${productsToCreate.length} article(s) enregistré(s) !`);
                
                stockForm.reset(); 
                document.getElementById('add-product-form').classList.add('hidden'); 
                if (checkboxVariants) checkboxVariants.checked = false;
                zoneStandard.classList.remove('hidden');
                zoneVariants.classList.add('hidden');
                const rows = document.querySelectorAll('.variant-row');
                for (let i = 1; i < rows.length; i++) rows[i].remove();
                if(suggestionsDiv) suggestionsDiv.classList.add('hidden');
                state.setIsScanningForNewProduct(false);
                
                if (imagePreview) {
                    imagePreview.src = '';
                    imagePreview.classList.add('hidden');
                    compressedImageDataUrl = null;
                }

            } catch (err) { 
                console.error(err); 
                showToast("Erreur lors de l'enregistrement", "error"); 
            }
        });
    }

    setupLabelPrinting();

    if(editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-prod-id').value;
            const nom = document.getElementById('edit-prod-nom').value;
            const newAchat = parseFloat(document.getElementById('edit-prod-achat').value) || 0;
            const newVente = parseFloat(document.getElementById('edit-prod-vente').value) || 0;
            const newStock = parseInt(document.getElementById('edit-prod-stock').value) || 0;
            const oldAchat = parseFloat(editForm.dataset.oldAchat) || 0;
            const oldVente = parseFloat(editForm.dataset.oldVente) || 0;
            const oldStock = parseInt(editForm.dataset.oldStock) || 0;
            const discontinued = document.getElementById('edit-prod-discontinued').checked;

            try {
                let finalImageUrl = null;
                if (compressedEditImageDataUrl) {
                    showToast("Envoi de la nouvelle image...", "info");
                    const fileName = `products/${state.currentBoutiqueId}_${id}_${Date.now()}.jpg`;
                    const storageRef = ref(storage, fileName);
                    try {
                        await uploadString(storageRef, compressedEditImageDataUrl, 'data_url');
                        finalImageUrl = await getDownloadURL(storageRef);
                    } catch(uploadErr) {
                        console.error("Erreur Upload Édition:", uploadErr);
                        showToast("La nouvelle image n'a pas pu être envoyée.", "warning");
                    }
                }

                const batch = writeBatch(db);
                const prodRef = doc(db, "boutiques", state.currentBoutiqueId, "products", id);
                
                let updateData = { prixAchat: newAchat, prixVente: newVente, stock: newStock, discontinued: discontinued, lastModified: serverTimestamp() };
                if (finalImageUrl) {
                    updateData.image = finalImageUrl;
                }
                
                batch.update(prodRef, updateData);
                
                let changes = [];
                if (newAchat !== oldAchat) changes.push(`Achat`);
                if (newVente !== oldVente) changes.push(`Vente`);
                if (newStock !== oldStock) changes.push(`Stock`);
                if (discontinued) changes.push(`Arrêt Appro.`);
                if (finalImageUrl) changes.push(`Photo`);

                if (changes.length > 0) {
                    const traceRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"));
                    batch.set(traceRef, { productId: id, productName: nom, type: 'modif', details: changes.join(', '), user: state.userId, date: serverTimestamp() });
                }
                await batch.commit();
                showToast("Modifié avec succès");
                compressedEditImageDataUrl = null; // Reset de la compression temporaire
                document.getElementById('edit-product-modal').classList.add('hidden');
            } catch (err) { console.error(err); showToast("Erreur modification", "error"); }
        });
    }
}

function renderStockTable() {
    const listContainer = document.getElementById('stock-list-container');
    const tbody = document.getElementById('stock-table-body');
    
    if(!listContainer && !tbody) return;
    
    if(listContainer) listContainer.innerHTML = '';
    if(tbody) tbody.innerHTML = '';

    let filteredData = [...state.allProducts];
    const searchInput = document.getElementById('stock-search-input');
    if (searchInput && searchInput.value) {
        const term = searchInput.value.toLowerCase();
        filteredData = filteredData.filter(p => p.nom.includes(term));
    }
    const sortSelect = document.getElementById('stock-sort-select');
    if (sortSelect) {
        const sortType = sortSelect.value;
        filteredData.sort((a, b) => {
            if (sortType === 'name_asc') return a.nom.localeCompare(b.nom);
            if (sortType === 'stock_asc') return a.stock - b.stock;
            if (sortType === 'stock_desc') return b.stock - a.stock;
            return 0;
        });
    }

    filteredData.forEach(p => {
        const reste = p.stock || 0; 
        const vendu = p.quantiteVendue || 0; 
        const total = reste + vendu;
        const dateStr = p.createdAt ? new Date(p.createdAt.seconds*1000).toLocaleDateString() : '-';

        const deleteBtn = (state.userRole === 'admin' && !p.deleted) ? `<button class="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 p-2 rounded-lg transition shadow-sm" onclick="event.stopPropagation(); deleteProduct('${p.id}')" title="Archiver"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';

        let statusBadge = p.discontinued ? '<span class="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[9px] font-bold border border-gray-300 ml-1">⛔ Fin</span>' : "";
        let variantBadge = p.isVariant ? '<span class="bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded text-[9px] font-bold ml-1 uppercase tracking-wide">Var.</span>' : '';

        const colors = ['bg-red-100 text-red-600', 'bg-blue-100 text-blue-600', 'bg-green-100 text-green-600', 'bg-purple-100 text-purple-600', 'bg-orange-100 text-orange-600', 'bg-teal-100 text-teal-600'];
        let visualElementList = '';
        let visualElementTable = '';
        if (p.image) {
            visualElementList = `<img src="${p.image}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-slate-600 shadow-sm" alt="img">`;
            visualElementTable = `<img src="${p.image}" class="w-8 h-8 rounded object-cover border border-gray-200 shadow-sm flex-shrink-0">`;
        } else {
            const init = (p.nomDisplay || "?").substring(0, 2).toUpperCase();
            const colorClass = colors[(p.nomDisplay || "A").charCodeAt(0) % colors.length];
            visualElementList = `<div class="w-12 h-12 rounded-lg flex-shrink-0 ${colorClass} flex items-center justify-center font-extrabold text-lg shadow-sm">${init}</div>`;
            visualElementTable = `<div class="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200 shadow-sm flex-shrink-0"><i data-lucide="image" class="w-4 h-4"></i></div>`;
        }

        const resteClassList = reste < 5 && !p.deleted ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700';
        const resteClassTable = reste < 5 && !p.deleted ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';

        // --- 1. Rendu Ligne du Tableau (PC) ---
        if (tbody) {
            const tr = document.createElement('tr');
            let rowClass = p.deleted ? "deleted-row opacity-50" : "border-b border-gray-100 hover:bg-gray-50 transition";
            let rowAction = "";
            
            if (state.userRole === 'admin' && !p.deleted) { 
                const productData = encodeURIComponent(JSON.stringify(p)); 
                rowAction = `onclick="openEditProduct('${productData}')"`; 
                rowClass += " cursor-pointer hover:bg-blue-50"; 
            }

            tr.className = rowClass;
            tr.innerHTML = `<td ${rowAction} class="p-4 text-xs uppercase tracking-wider text-gray-400">${dateStr}</td>
            <td ${rowAction} class="p-4 font-medium text-gray-800">
                <div class="flex items-center gap-3">
                    ${visualElementTable}
                    <div>
                        <div class="text-sm font-extrabold">${p.nomDisplay || p.nom}</div> ${variantBadge} ${statusBadge} <span class="text-xs uppercase text-red-500">${p.deleted ? '(Archivé)' : ''}</span>
                    </div>
                </div>
            </td>
            <td ${rowAction} class="p-4 font-extrabold text-blue-600 text-sm">${formatPrice(p.prixAchat || 0)}</td>
            <td ${rowAction} class="p-4 font-extrabold text-gray-700 text-sm">${formatPrice(p.prixVente || 0)}</td>
            <td ${rowAction} class="p-4 text-center font-bold text-gray-500 text-sm">${total}</td>
            <td ${rowAction} class="p-4 text-center font-bold text-orange-600 text-sm">${vendu}</td>
            <td ${rowAction} class="p-4 text-center"><span class="${resteClassTable} px-3 py-1 rounded-full text-sm font-extrabold">${reste}</span></td>
            <td class="p-4 text-right">${deleteBtn}</td>`;
            tbody.appendChild(tr);
        }

        // --- 2. Rendu Liste (Mobile) ---
        if (listContainer) {
            const div = document.createElement('div');
            let cardClass = "flex items-center gap-3 p-3 bg-white dark:bg-slate-800 transition";
            
            if (p.deleted) cardClass += " opacity-50 grayscale bg-gray-50 dark:bg-slate-900";
            else cardClass += " hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer";
            
            div.className = cardClass;

            if (state.userRole === 'admin' && !p.deleted) { 
                const productData = encodeURIComponent(JSON.stringify(p)); 
                div.setAttribute('onclick', `openEditProduct('${productData}')`);
            }

            div.innerHTML = `
                ${visualElementList}
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <div class="font-bold text-sm text-gray-800 dark:text-gray-100 leading-tight flex items-center truncate">
                        <span class="truncate">${p.nomDisplay || p.nom}</span> ${variantBadge} ${statusBadge} <span class="text-[10px] uppercase text-red-500 font-bold ml-1">${p.deleted ? '(Archivé)' : ''}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Achat: ${formatPrice(p.prixAchat || 0)}</span>
                        <span class="text-sm font-extrabold text-blue-600 dark:text-blue-400">${formatPrice(p.prixVente || 0)}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-[10px] text-orange-500 font-medium">Vendu: ${vendu}</span>
                        <span class="text-[10px] font-bold ${resteClassList} px-1.5 py-0.5 rounded">Reste: ${reste}</span>
                    </div>
                </div>
                <div class="flex-shrink-0 pl-2">
                    ${deleteBtn}
                </div>
            `;
            listContainer.appendChild(div);
        }
    });
    
    if (window.lucide) window.lucide.createIcons();
    
    let totalAchat = 0, totalVente = 0, totalItems = 0;
    state.allProducts.forEach(p => { if(!p.deleted) { totalAchat += (p.prixAchat||0)*(p.stock||0); totalVente += (p.prixVente||0)*(p.stock||0); totalItems += (p.stock||0); }});
    if(document.getElementById('stock-total-value')) document.getElementById('stock-total-value').textContent = formatPrice(totalAchat);
    if(document.getElementById('stock-potential-value')) document.getElementById('stock-potential-value').textContent = formatPrice(totalVente);
    if(document.getElementById('stock-total-count')) document.getElementById('stock-total-count').textContent = totalItems;
};

// Génère un code-barres interne unique (format EAN-13 commençant par 200)
function generateInternalBarcode() {
    // Préfixe 200 réservé aux codes internes, suivi de 9 chiffres aléatoires
    const digits = '200' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    // Calcul du chiffre de contrôle EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return digits + checkDigit;
}

function setupLabelPrinting() {
    const modal = document.getElementById('print-labels-modal');
    const openBtn = document.getElementById('open-print-labels-modal');
    const closeBtn1 = document.getElementById('close-print-labels-modal');
    const closeBtn2 = document.getElementById('close-print-labels-modal-2');
    const generateBtn = document.getElementById('generate-labels-btn');
    const productListDiv = document.getElementById('product-list-for-labels');

    if (!modal || !openBtn || !closeBtn1 || !closeBtn2 || !generateBtn || !productListDiv) return;

    const openModal = () => {
        const activeProducts = state.allProducts.filter(p => !p.deleted);

        if (activeProducts.length === 0) {
            showToast("Aucun produit disponible.", "warning");
            return;
        }

        productListDiv.innerHTML = `
            <div class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-slate-700 mb-1">
                <div class="flex items-center gap-2">
                    <input type="checkbox" id="select-all-labels" class="h-4 w-4 rounded accent-blue-600">
                    <label for="select-all-labels" class="text-sm font-bold text-blue-700 dark:text-blue-300 cursor-pointer">Tout sélectionner</label>
                </div>
                <span class="text-xs text-gray-500">${activeProducts.length} produit(s)</span>
            </div>
            ${activeProducts.map(p => {
                const hasBarcode = !!p.codeBarre;
                return `
                <div class="flex items-center justify-between p-2 border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50" data-product-id="${p.id}" data-has-barcode="${hasBarcode}">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <input type="checkbox" class="h-4 w-4 rounded flex-shrink-0 label-checkbox accent-blue-600">
                        <div class="min-w-0">
                            <div class="font-semibold text-sm truncate">${p.nomDisplay}</div>
                            <div class="text-xs text-gray-500 flex items-center gap-2">
                                <span>Stock: ${p.stock}</span>
                                ${hasBarcode 
                                    ? `<span class="text-green-600 font-bold">✓ ${p.codeBarre}</span>` 
                                    : `<span class="text-orange-500 font-bold">⚡ Code auto-généré</span>`
                                }
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                        <label class="text-xs text-gray-500">Qté:</label>
                        <input type="number" value="1" min="1" max="100" class="w-16 p-1 text-center border rounded text-sm label-quantity" style="border-radius:6px;">
                    </div>
                </div>
            `}).join('')}
        `;

        // "Tout sélectionner" checkbox
        const selectAll = productListDiv.querySelector('#select-all-labels');
        selectAll.addEventListener('change', (e) => {
            productListDiv.querySelectorAll('.label-checkbox').forEach(cb => cb.checked = e.target.checked);
        });

        modal.classList.remove('hidden');
    };

    const closeModal = () => modal.classList.add('hidden');

    const generateLabels = async () => {
        const printableArea = document.getElementById('printable-area');
        if (!printableArea) return;

        const productRows = productListDiv.querySelectorAll('[data-product-id]');
        const selectedRows = [...productRows].filter(row => row.querySelector('.label-checkbox').checked);

        if (selectedRows.length === 0) {
            showToast("Veuillez sélectionner au moins un produit.", "warning");
            return;
        }

        // Générer et sauvegarder les codes-barres manquants
        const toSave = [];
        for (const row of selectedRows) {
            const productId = row.dataset.productId;
            const hasBarcode = row.dataset.hasBarcode === 'true';
            if (!hasBarcode) {
                const newCode = generateInternalBarcode();
                // Sauvegarder dans Firebase
                try {
                    await updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "products", productId), {
                        codeBarre: newCode,
                        lastModified: serverTimestamp()
                    });
                    // Mettre à jour en mémoire
                    const idx = state.allProducts.findIndex(p => p.id === productId);
                    if (idx !== -1) state.allProducts[idx].codeBarre = newCode;
                    toSave.push({ productId, newCode });
                } catch(e) {
                    console.error("Erreur sauvegarde code:", e);
                }
            }
        }

        if (toSave.length > 0) {
            showToast(`${toSave.length} code(s)-barres généré(s) et sauvegardé(s) !`, "success");
        }

        // Construire le HTML des étiquettes
        let labelsHtml = '';
        for (const row of selectedRows) {
            const productId = row.dataset.productId;
            const product = state.allProducts.find(p => p.id === productId);
            const quantity = parseInt(row.querySelector('.label-quantity').value) || 1;

            if (product && product.codeBarre && quantity > 0) {
                for (let i = 0; i < quantity; i++) {
                    labelsHtml += `
                        <div class="label">
                            <div class="label-product-name">${product.nomDisplay}</div>
                            <div class="label-product-price">${formatPrice(product.prixVente)}</div>
                            <svg class="barcode"
                                jsbarcode-format="EAN13"
                                jsbarcode-value="${product.codeBarre}"
                                jsbarcode-textmargin="0"
                                jsbarcode-fontoptions="bold"
                                jsbarcode-width="1.5"
                                jsbarcode-height="40"
                                jsbarcode-fontSize="12"
                                jsbarcode-margin="5">
                            </svg>
                        </div>
                    `;
                }
            }
        }

        if (!labelsHtml) {
            showToast("Erreur lors de la génération des étiquettes.", "error");
            return;
        }

        printableArea.innerHTML = `<div class="label-sheet">${labelsHtml}</div>`;
        printableArea.classList.remove('hidden'); // ← AJOUTER cette ligne

        try {
            JsBarcode(".barcode").init();
            closeModal();
            setTimeout(() => {
                window.print();
                printableArea.classList.add('hidden'); // ← remettre hidden après impression
            }, 200);
        } catch (e) {
            console.error("JsBarcode error:", e);
            showToast("Erreur lors de la génération des codes-barres.", "error");
        }
    };

    openBtn.addEventListener('click', openModal);
    closeBtn1.addEventListener('click', closeModal);
    closeBtn2.addEventListener('click', closeModal);
    generateBtn.addEventListener('click', generateLabels);
}

window.openEditProduct = async (encodedProduct) => {
    const p = JSON.parse(decodeURIComponent(encodedProduct));
    document.getElementById('edit-prod-id').value = p.id;
    document.getElementById('edit-prod-nom').value = p.nomDisplay;
    document.getElementById('edit-prod-achat').value = p.prixAchat;
    document.getElementById('edit-prod-vente').value = p.prixVente;
    document.getElementById('edit-prod-stock').value = p.stock;
    document.getElementById('edit-prod-discontinued').checked = p.discontinued || false;
    
    const editImagePreview = document.getElementById('edit-prod-image-preview');
    const editImageInput = document.getElementById('edit-prod-image');
    
    // Réinitialiser la zone d'image ou afficher l'image existante
    if (editImageInput) editImageInput.value = '';
    if (editImagePreview) {
        if (p.image) {
            editImagePreview.src = p.image;
            editImagePreview.classList.remove('hidden');
        } else {
            editImagePreview.src = '';
            editImagePreview.classList.add('hidden');
        }
    }

    const form = document.getElementById('form-edit-product');
    if(form) { form.dataset.oldAchat = p.prixAchat; form.dataset.oldVente = p.prixVente; form.dataset.oldStock = p.stock; }
    document.getElementById('edit-product-modal').classList.remove('hidden');

    const historyBody = document.getElementById('product-history-body');
    if(historyBody) {
        historyBody.innerHTML = '<tr><td colspan="3" class="p-2 text-center text-gray-500">Chargement...</td></tr>';
        try {
            const q = query(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"), where("productId", "==", p.id));
            const snap = await getDocs(q);
            let moves = [];
            snap.forEach(d => moves.push(d.data()));
            moves.sort((a,b) => (b.date?.seconds||0) - (a.date?.seconds||0));

            historyBody.innerHTML = moves.length === 0 
                ? '<tr><td colspan="3" class="p-2 text-center text-[10px] uppercase text-gray-400 italic">Aucun historique</td></tr>'
                : moves.map(m => {
                    const dateStr = m.date ? new Date(m.date.seconds*1000).toLocaleDateString() : '-';
                    let label = "", color = "text-gray-600", details = "";
                    if (m.type === 'ajout') { label = `📥 Appro.`; color = "text-green-600 font-bold"; details = `+${m.quantite} (Achat: ${formatPrice(m.prixAchat)})`; } 
                    else if (m.type === 'perime') { label = `🗑️ Perte`; color = "text-red-600 font-bold"; details = `-${m.quantite}`; } 
                    else if (m.type === 'modif') { label = `✏️ Modif`; color = "text-blue-600"; details = "Infos"; }
                    else if (m.type === 'retour') { label = `↩️ Retour`; color = "text-blue-600 font-bold"; details = `+${m.quantite}`; }
                    return `<tr class="border-b last:border-0 hover:bg-gray-50"><td class="p-2 text-gray-500 text-[10px] uppercase tracking-widest">${dateStr}</td><td class="p-2 text-[10px] uppercase font-bold ${color}">${label}</td><td class="p-2 text-[10px] text-right font-bold">${details}</td></tr>`;
                }).join('');
        } catch (e) { console.error(e); }
    }
};

window.signalerPerime = () => {
    const id = document.getElementById('edit-prod-id').value;
    const nom = document.getElementById('edit-prod-nom').value;
    
    showPromptModal("Signaler une perte", "Quantité périmée ou cassée à retirer du stock :", "number", async (qteStr) => {
        if(!qteStr) return;
        const qte = parseInt(qteStr);
        if(isNaN(qte) || qte <= 0) return showToast("Quantité invalide", "error");
        try {
            const batch = writeBatch(db);
            const prodRef = doc(db, "boutiques", state.currentBoutiqueId, "products", id);
            batch.update(prodRef, { stock: increment(-qte) });
            const traceRef = doc(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"));
            batch.set(traceRef, { productId: id, productName: nom, type: 'perime', quantite: qte, date: serverTimestamp(), user: state.userId });
            await batch.commit();
            showToast(`${qte} produits retirés`);
            document.getElementById('edit-product-modal').classList.add('hidden');
        } catch(e) { console.error(e); showToast("Erreur", "error"); }
    });
};

window.deleteProduct = (id) => { 
    showConfirmModal("Retirer", "Retirer ce produit du catalogue ?", () => {
        updateDoc(doc(db, "boutiques", state.currentBoutiqueId, "products", id), { deleted: true }); 
    }); 
};