// src/pages/dashboard.js
import { db, onSnapshot, doc, collection, updateDoc, serverTimestamp } from '../firebase.js';
import { formatPrice, showToast } from '../ui.js';
import * as state from '../state.js';

let salesChartInstance = null;
let topProductsChartInstance = null;

// Store raw data from Firebase
let allSalesData = [];
let allExpensesData = [];
let allCreditsData = [];
let allProductsData = [];
let caisseInitiale = 0;
let currentFondDeCaisse = 0;
let dateFondDeCaisse = new Date(0);

// Central rendering function
function updateDashboardUI() {
    const dateStartInput = document.getElementById('dash-date-start');
    const dateEndInput = document.getElementById('dash-date-end');

    if (!dateStartInput.value || !dateEndInput.value) return;

    const startDate = new Date(dateStartInput.value);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateEndInput.value);
    endDate.setHours(23, 59, 59, 999);

    // --- 1. Filter Data based on date range ---
    const filteredSales = allSalesData.filter(s => {
        const d = s.date?.toDate ? s.date.toDate() : new Date();
        return d >= startDate && d <= endDate;
    });
    const filteredExpenses = allExpensesData.filter(e => {
        const d = e.date?.toDate ? e.date.toDate() : new Date();
        return d >= startDate && d <= endDate;
    });
    const filteredCredits = allCreditsData.filter(c => {
        // We only care about credits created in the period for the total credits KPI
        const createdAt = c.createdAt?.toDate ? c.createdAt.toDate() : new Date();
        return createdAt && createdAt >= startDate && createdAt <= endDate;
    });

    // --- 2. Recalculate Stats ---
    let totalVentesEncaissees = 0;
    const productStats = {};
    
    filteredSales.forEach(s => {
        if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement' || s.type === 'mobile_money') {
            totalVentesEncaissees += s.total || 0;
        }
        if (s.type === 'retour') {
            totalVentesEncaissees -= (s.total || 0);
        }

        if(s.items && Array.isArray(s.items) && s.type !== 'remboursement') {
            const multiplier = (s.type === 'retour' || s.type === 'retour_credit') ? -1 : 1;
            s.items.forEach(item => {
                const keyName = (item.nomDisplay || item.nom || "Inconnu").trim().toUpperCase();
                if (!productStats[keyName]) productStats[keyName] = { name: keyName, qty: 0, revenue: 0 };
                productStats[keyName].qty += (item.qty || 0) * multiplier;
                productStats[keyName].revenue += (s.type === 'cash_import' ? s.total : ((item.prixVente || 0) * (item.qty || 0))) * multiplier;
            });
        }
    });

    let periodDepenses = 0;
    filteredExpenses.forEach(e => {
        if(e.type !== 'entree') periodDepenses += (e.montant || 0);
    });

    // --- Calcul de l'Investissement en Marchandises (Stock) ---
    // Considéré comme une charge pour le commerçant lambda
    let investissementStockGlobal = 0;
    let valeurStockActuel = 0;
    if (allProductsData) {
        allProductsData.forEach(p => {
            // L'argent total sorti pour acquérir la marchandise (vendue ou non)
            investissementStockGlobal += (p.prixAchat || 0) * ((p.stock || 0) + (p.quantiteVendue || 0));
            // Valeur immobilisée actuellement
            if (!p.deleted) {
                valeurStockActuel += (p.prixAchat || 0) * (p.stock || 0);
            }
        });
    }

    // --- Calcul du Solde Global (Prend en compte toute la durée de vie) ---
    let globalEncaisse = 0;
    allSalesData.forEach(s => {
        if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement' || s.type === 'mobile_money') globalEncaisse += (s.total || 0);
        if (s.type === 'retour') globalEncaisse -= (s.total || 0);
    });
    
    let globalDepenses = 0;
    let globalApports = 0;
    allExpensesData.forEach(e => {
        if(e.type === 'entree') globalApports += (e.montant || 0);
        else globalDepenses += (e.montant || 0);
    });

    // Le stock est considéré comme une charge (dépense). On le soustrait donc du solde global.
    const soldeGlobal = caisseInitiale + globalEncaisse + globalApports - globalDepenses - investissementStockGlobal;
    const totalCredits = allCreditsData.reduce((acc, c) => acc + (c.dette || 0), 0); // Total debt is global, not date-filtered

    // --- 3. Update UI Elements ---
    document.getElementById('dash-caisse-initiale').textContent = formatPrice(caisseInitiale);
    document.getElementById('dash-total-sales').textContent = formatPrice(totalVentesEncaissees);
    document.getElementById('dash-total-expenses').textContent = formatPrice(periodDepenses);
    
    const stockInfoEl = document.getElementById('dash-stock-value-info');
    if (stockInfoEl) {
        stockInfoEl.innerHTML = `Immobilisé en stock: <span class="font-bold">${formatPrice(valeurStockActuel)}</span>`;
        stockInfoEl.classList.remove('hidden');
    }

    document.getElementById('dash-total-credits').textContent = formatPrice(totalCredits);
    
    const elProfit = document.getElementById('dash-total-profit');
    elProfit.textContent = formatPrice(soldeGlobal);
    elProfit.className = `kpi-value ${soldeGlobal < 0 ? 'text-red-600' : 'text-green-600'}`;

    // --- 4. Re-render charts and modals with filtered data ---
    renderDashboardCharts(filteredSales, productStats, startDate, endDate);
    setupClickableModals(filteredSales, productStats);
    applyRoleBasedVisibility();
}

function applyRoleBasedVisibility() {
    const isSeller = state.userRole === 'seller';

    // IDs des éléments sensibles à masquer pour les vendeurs
    const sensitiveElements = [
        'card-caisse', 
        'card-profit', 
        'card-expenses',
        'dash-top-profit-trigger',
        'admin-capital-box'
    ];

    sensitiveElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', isSeller);
    });

    // Ajustement de la grille pour les vendeurs (pour éviter les trous)
    // On masque les parents des cartes si nécessaire, ici fait via classes hidden
    // Ajustement visuel : si vendeur, on peut agrandir les cartes restantes ou les centrer
    // Le CSS grid s'adapte, mais on peut forcer un layout plus sympa.
    
    // Optionnel : Masquer le graphique "Top Produits (Revenu)" ou changer son titre
    const topProductsCard = document.getElementById('top-products-chart')?.closest('.bg-white');
    if(topProductsCard) {
        if(isSeller) {
            // On pourrait le garder car le CA n'est pas le bénéfice, mais si vous voulez masquer :
            // topProductsCard.classList.add('hidden');
        }
    }
}

function renderDashboardCharts(sales, productStats, startDate, endDate) {
    if (typeof Chart === 'undefined') return;

    // --- Sales Chart ---
    const salesCanvas = document.getElementById('sales-over-time-chart');
    if (salesCanvas) {
        const salesCtx = salesCanvas.getContext('2d');
        const timeDiff = endDate.getTime() - startDate.getTime();
        const dayDiff = timeDiff / (1000 * 3600 * 24);

        const salesByDate = {};
        // Group sales by day or month depending on range
        const formatOptions = dayDiff > 60 
            ? { year: '2-digit', month: 'short' } // Group by month
            : { day: '2-digit', month: 'short' }; // Group by day

        sales.forEach(s => {
            if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement' || s.type === 'mobile_money') {
                const d = s.date?.toDate ? s.date.toDate() : new Date();
                const dateKey = d.toLocaleDateString('fr-FR', formatOptions);
                if (!salesByDate[dateKey]) salesByDate[dateKey] = 0;
                salesByDate[dateKey] += s.total;
            }
        });
        
        const labels = Object.keys(salesByDate);
        const data = Object.values(salesByDate);

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                // Click interaction can be complex with dynamic grouping,
                // for now, we disable it to avoid bugs. It can be re-enabled with more logic.
            }
        };

        if (salesChartInstance) {
            salesChartInstance.data.labels = labels;
            salesChartInstance.data.datasets[0].data = data;
            salesChartInstance.update();
        } else {
            const existing = Chart.getChart(salesCanvas);
            if (existing) existing.destroy();
            salesChartInstance = new Chart(salesCtx, {
                type: 'line',
                data: { labels, datasets: [{ label: 'CA (Ventes)', data, backgroundColor: 'rgba(37, 99, 235, 0.1)', borderColor: '#2563eb', fill: true, tension: 0.3, pointBackgroundColor: '#2563eb', pointRadius: 3, borderWidth: 2 }] },
                options: chartOptions
            });
        }
    }

    // --- Top Products Chart ---
    const topCanvas = document.getElementById('top-products-chart');
    if (topCanvas) {
        const topProductsCtx = topCanvas.getContext('2d');
        const top5 = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
        const labels = top5.map(p => p.name);
        const data = top5.map(p => p.revenue);

        const chartOptions = {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
            onClick: (event, elements) => {
                if (elements.length === 0) return;
                const index = elements[0].index;
                const productName = labels[index];
                const product = allProductsData.find(p => p.nomDisplay.toUpperCase() === productName);
                if (product && typeof window.openEditProduct === 'function') {
                    window.openEditProduct(encodeURIComponent(JSON.stringify(product)));
                }
            }
        };

        if (topProductsChartInstance) {
            topProductsChartInstance.data.labels = labels;
            topProductsChartInstance.data.datasets[0].data = data;
            topProductsChartInstance.options = chartOptions;
            topProductsChartInstance.update();
        } else {
            const existing = Chart.getChart(topCanvas);
            if (existing) existing.destroy();
            topProductsChartInstance = new Chart(topProductsCtx, {
                type: 'doughnut',
                data: { labels, datasets: [{ data, backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'], borderWidth: 0 }] },
                options: chartOptions
            });
        }
    }
}

function setupClickableModals(sales, productStats) {
    const setup = (triggerId, modalId, title, data, renderer) => {
        const trigger = document.getElementById(triggerId);
        if (trigger) trigger.onclick = () => {
            document.getElementById(modalId + '-title').textContent = title;
            document.getElementById(modalId + '-body').innerHTML = renderer(data);
            document.getElementById(modalId).classList.remove('hidden');
        };
    };

    // 1. Low Stock
    setup('dash-low-stock-trigger', 'dashboard-generic-modal', 'Produits en Stock Faible', null, () => {
        const low = allProductsData.filter(p => !p.deleted && !p.discontinued && p.stock > 0 && p.stock < 5).sort((a, b) => a.stock - b.stock);
        if (low.length === 0) return '<p class="p-4 text-center text-gray-500">Aucun produit en stock faible.</p>';
        return `
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 dark:bg-slate-700"><tr><th class="p-3 font-semibold text-gray-600 dark:text-gray-300">Produit</th><th class="p-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Stock Restant</th></tr></thead>
                <tbody>${low.map(p => `<tr class="border-b dark:border-slate-700"><td class="p-3 dark:text-slate-200">${p.nomDisplay}</td><td class="p-3 text-right font-bold text-red-600">${p.stock}</td></tr>`).join('')}</tbody>
            </table>`;
    });

    // 2. Recent Sales
    setup('dash-recent-sales-trigger', 'dashboard-generic-modal', 'Dernières Ventes de la Période', sales, (d) => {
        const recent = d.slice(0, 20); // Already sorted by date desc
        if (recent.length === 0) return '<p class="p-4 text-center text-gray-500">Aucune vente sur cette période.</p>';
        return `
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 dark:bg-slate-700"><tr><th class="p-3 font-semibold text-gray-600 dark:text-gray-300">Date</th><th class="p-3 font-semibold text-gray-600 dark:text-gray-300">Description</th><th class="p-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Total</th></tr></thead>
                <tbody>${recent.map(s => {
                    let desc = s.items?.map(i => i.nomDisplay).join(', ') || 'Vente';
                    if (s.type === 'retour' || s.type === 'retour_credit') desc = `↩️ Retour: ${desc}`;
                    const d = s.date?.toDate ? s.date.toDate() : new Date();
                    const isReturn = s.type === 'retour' || s.type === 'retour_credit';
                    return `<tr class="border-b dark:border-slate-700"><td class="p-3 text-xs dark:text-slate-300">${d.toLocaleString('fr-FR')}</td><td class="p-3 dark:text-slate-200">${desc}</td><td class="p-3 text-right font-bold ${isReturn ? 'text-red-500' : ''}">${isReturn ? '-' : ''}${formatPrice(s.total)}</td></tr>`;
                }).join('')}</tbody>
            </table>`;
    });

    // 3. Top Profitability
    setup('dash-top-profit-trigger', 'dashboard-generic-modal', 'Top 10 Rentabilité de la Période', productStats, (d) => {
        const top = Object.values(d).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        if (top.length === 0) return '<p class="p-4 text-center text-gray-500">Aucune donnée de rentabilité sur cette période.</p>';
        return `
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 dark:bg-slate-700"><tr><th class="p-3 font-semibold text-gray-600 dark:text-gray-300">Produit</th><th class="p-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Revenu Généré</th></tr></thead>
                <tbody>${top.map(p => `<tr class="border-b dark:border-slate-700"><td class="p-3 dark:text-slate-200">${p.name}</td><td class="p-3 text-right font-bold text-green-600">${formatPrice(p.revenue)}</td></tr>`).join('')}</tbody>
            </table>`;
    });

    // 4. Top Quantities
    setup('dash-top-qty-trigger', 'dashboard-generic-modal', 'Top 10 Ventes (Volume) de la Période', productStats, (d) => {
        const top = Object.values(d).sort((a, b) => b.qty - a.qty).slice(0, 10);
        if (top.length === 0) return '<p class="p-4 text-center text-gray-500">Aucun produit vendu sur cette période.</p>';
        return `
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 dark:bg-slate-700"><tr><th class="p-3 font-semibold text-gray-600 dark:text-gray-300">Produit</th><th class="p-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Quantité Vendue</th></tr></thead>
                <tbody>${top.map(p => `<tr class="border-b dark:border-slate-700"><td class="p-3 dark:text-slate-200">${p.name}</td><td class="p-3 text-right font-bold text-blue-600">${p.qty}</td></tr>`).join('')}</tbody>
            </table>`;
    });
}

export function setupDashboard() {
    if (!state.currentBoutiqueId) return;

    const dateStartInput = document.getElementById('dash-date-start');
    const dateEndInput = document.getElementById('dash-date-end');
    const filterBtn = document.getElementById('btn-dash-filter');

    const today = new Date();
    dateEndInput.valueAsDate = today;
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    dateStartInput.valueAsDate = startOfMonth;

    filterBtn.addEventListener('click', updateDashboardUI);
    
    // Enregistrement du Fond de Caisse (Monnaie du matin) depuis l'onglet Ventes
    const btnSaveFondCaisse = document.getElementById('btn-save-fond-caisse');
    const inputFondCaisse = document.getElementById('fond-caisse-input');
    if (btnSaveFondCaisse && inputFondCaisse) {
        btnSaveFondCaisse.addEventListener('click', async () => {
            try {
                await updateDoc(doc(db, "boutiques", state.currentBoutiqueId), { 
                    fondDeCaisse: parseFloat(inputFondCaisse.value) || 0,
                    dateFondDeCaisse: serverTimestamp() 
                });
                if (typeof showToast === 'function') showToast("Fond de caisse enregistré avec succès !", "success");
            } catch (e) { console.error(e); }
        });
    }
    
    // Listeners just update data arrays and trigger a UI update
    onSnapshot(doc(db, "boutiques", state.currentBoutiqueId), (docSnap) => {
        if (docSnap.exists()) {
            caisseInitiale = docSnap.data().caisseInitiale || 0;
            const logoImg = document.getElementById('dash-shop-logo');
            if(logoImg && docSnap.data().logo) { logoImg.src = docSnap.data().logo; logoImg.classList.remove('hidden'); }
            else if(logoImg) { logoImg.classList.add('hidden'); }
            
            // Met à jour l'affichage du fond de caisse s'il a été changé par un autre appareil
            if (inputFondCaisse && document.activeElement !== inputFondCaisse) {
                inputFondCaisse.value = docSnap.data().fondDeCaisse || 0;
            }
            
            currentFondDeCaisse = docSnap.data().fondDeCaisse || 0;
            dateFondDeCaisse = docSnap.data().dateFondDeCaisse?.toDate() || new Date(0);
            
            window.shopGlobalInfo = {
                nom: docSnap.data().nom || "Ma Boutique",
                telephone: docSnap.data().telephone || "",
                adresse: docSnap.data().adresse || "",
                messageTicket: docSnap.data().messageTicket || "Merci pour votre achat !"
            };
            
            updateDashboardUI();
            applyRoleBasedVisibility();
            updateSoldeTheorique();
        }
    });

    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "expenses"), (snap) => {
        allExpensesData = snap.docs.map(d => ({...d.data(), id: d.id}));
        updateDashboardUI();
        updateSoldeTheorique();
    });

    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "ventes"), (snap) => {
        allSalesData = snap.docs.map(d => ({...d.data(), id: d.id}));
        updateDashboardUI();
        updateSoldeTheorique();
    });

    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "clients"), (snap) => {
        allCreditsData = snap.docs.map(d => ({...d.data(), id: d.id}));
        updateDashboardUI();
    });
    
    // NEW : Écoute les changements de stock en temps réel
    onSnapshot(collection(db, "boutiques", state.currentBoutiqueId, "products"), (snap) => {
        allProductsData = snap.docs.map(d => ({...d.data(), id: d.id}));
        updateDashboardUI();
    });
}

function updateSoldeTheorique() {
    const display = document.getElementById('solde-theorique-display');
    if (!display) return;

    let cashIn = 0;
    let cashOut = 0;

    allSalesData.forEach(s => {
        const d = s.date?.toDate() || new Date(0);
        if (d >= dateFondDeCaisse) {
            if (s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement') {
                cashIn += s.total || 0;
            } else if (s.type === 'retour') {
                cashIn -= s.total || 0;
            }
        }
    });

    allExpensesData.forEach(e => {
        const d = e.date?.toDate() || new Date(0);
        // On ne soustrait l'argent du tiroir QUE si la dépense a été faite avec l'argent de la caisse
        // (Les anciennes dépenses sans e.source sont considérées comme caisse par défaut)
        if (d >= dateFondDeCaisse && (!e.source || e.source === 'caisse')) {
            cashOut += e.montant || 0;
        }
    });

    const expectedBalance = currentFondDeCaisse + cashIn - cashOut;
    display.textContent = formatPrice(expectedBalance);
}
