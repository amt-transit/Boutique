// src/globalSearch.js
import * as state from './state.js';
import { switchTab } from './ui.js';

export function setupGlobalSearch() {
    const searchInput = document.getElementById('global-search-input');
    const resultsContainer = document.getElementById('global-search-results'); 

    if (!searchInput || !resultsContainer) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();

        if (term.length < 2) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        const productResults = state.allProducts
            .filter(p => !p.deleted && p.nomDisplay.toLowerCase().includes(term))
            .slice(0, 5);

        const clientResults = state.allClients
            .filter(c => !c.deleted && c.nom.toLowerCase().includes(term))
            .slice(0, 5);

        if (productResults.length === 0 && clientResults.length === 0) {
            resultsContainer.innerHTML = '<div class="p-4 text-center text-gray-500">Aucun résultat</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }

        let html = '';

        if (productResults.length > 0) {
            html += `<div class="p-2 text-xs font-bold text-gray-400 uppercase border-b dark:border-slate-700">Produits</div>`;
            html += productResults.map(p => `
                <div class="p-4 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer flex justify-between items-center search-result-item" data-type="product" data-id="${p.id}">
                    <div>
                        <div class="font-semibold">${p.nomDisplay}</div>
                        <div class="text-xs text-gray-500">${p.codeBarre || ''}</div>
                    </div>
                    <span class="text-sm font-bold text-gray-500 dark:text-gray-400">Stock: ${p.stock}</span>
                </div>
            `).join('');
        }

        if (clientResults.length > 0) {
            html += `<div class="p-2 text-xs font-bold text-gray-400 uppercase border-b dark:border-slate-700 mt-2">Clients</div>`;
            html += clientResults.map(c => `
                <div class="p-4 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer flex justify-between items-center search-result-item" data-type="client" data-id="${c.id}">
                    <div class="font-semibold">${c.nom}</div>
                    ${c.dette > 0 
                        ? `<span class="text-sm font-bold text-orange-500">Dette: ${new Intl.NumberFormat().format(c.dette)} CFA</span>` 
                        : '<span class="text-xs text-green-500">Aucune dette</span>'
                    }
                </div>
            `).join('');
        }
        
        resultsContainer.innerHTML = html;
        resultsContainer.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        const searchContainer = document.getElementById('global-search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });

    resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (!item) return;

        const type = item.dataset.type;
        const id = item.dataset.id;
        
        if (type === 'product') {
            const product = state.allProducts.find(p => p.id === id);
            if (product && typeof window.openEditProduct === 'function') {
                const productData = encodeURIComponent(JSON.stringify(product));
                window.openEditProduct(productData);
            }
        }

        if (type === 'client') {
            switchTab('credits');
            const searchInput = document.getElementById('credits-search');
            const client = state.allClients.find(c => c.id === id);
            if (searchInput && client) {
                searchInput.value = client.nom;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        searchInput.value = '';
        resultsContainer.classList.add('hidden');
    });
}
