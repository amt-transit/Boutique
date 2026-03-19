// src/pages/audit.js
import { db, getDoc, doc, getDocs, collection } from '../firebase.js';
import { formatPrice } from '../ui.js';
import * as state from '../state.js';

let auditChart = null;

async function loadAudit() { 
    if(!state.currentBoutiqueId) return;
    
    const tableBody = document.getElementById('audit-table-body');
    const shopDoc = await getDoc(doc(db, "boutiques", state.currentBoutiqueId));
    let balance = shopDoc.exists() ? (shopDoc.data().caisseInitiale || 0) : 0;

    const salesSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "ventes"));
    const expSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "expenses"));
    const stockSnap = await getDocs(collection(db, "boutiques", state.currentBoutiqueId, "mouvements_stock"));
    
    let movements = [];

    salesSnap.forEach(d => {
        const s = d.data();
        if(s.deleted) return;
        if(s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement' || s.type === 'mobile_money') {
            let details = s.clientName || 'Vente';
            if (s.type === 'remboursement') {
                details = `Remboursement (${s.clientName || 'Client'})`;
            } else if (s.items && s.items.length > 0) {
                let pList = s.items.map(i => {
                    let nom = i.nomDisplay || i.nom;
                    if (i.basePrice !== undefined && i.prixVente !== i.basePrice) {
                        nom = `<span class="text-purple-600 font-bold bg-purple-50 border border-purple-200 px-1 rounded-md" title="Prix de base: ${formatPrice(i.basePrice)}">🏷️ ${nom}</span>`;
                    }
                    return `${nom} (x${i.qty})`;
                }).join(', ');
                details = s.clientName ? `${s.clientName} : ${pList}` : pList;
                if (s.remise > 0) {
                    details += ` <span class="text-red-500 font-bold text-[10px] bg-red-50 border border-red-100 px-1 rounded ml-1">Remise: -${formatPrice(s.remise)}</span>`;
                }
            }
            movements.push({ date: s.date?.toDate(), amount: s.total || 0, type: 'ENTRÉE', details: details });
        } else if (s.type === 'retour') {
            let details = 'Retour article';
            if (s.items && s.items.length > 0) {
                details = s.items.map(i => `${i.nomDisplay || i.nom} (x${i.qty})`).join(', ');
            }
            movements.push({ date: s.date?.toDate(), amount: -(s.total || 0), type: 'SORTIE (RETOUR)', details: details });
        }
    });

    expSnap.forEach(d => {
        const e = d.data();
        if(!e.deleted) {
            if(e.type === 'entree') {
                movements.push({ date: e.date?.toDate(), amount: (e.montant || 0), type: 'APPORT EXTERNE', details: e.motif });
            } else {
                movements.push({ date: e.date?.toDate(), amount: -(e.montant || 0), type: 'SORTIE', details: e.motif });
            }
        }
    });
    
    stockSnap.forEach(d => {
        const m = d.data();
        if (m.type === 'ajout' && m.prixAchat > 0 && m.quantite > 0) {
            const totalAchat = (m.prixAchat || 0) * (m.quantite || 0);
            movements.push({ date: m.date?.toDate(), amount: -totalAchat, type: 'ACHAT STOCK', details: `${m.nom} (x${m.quantite})` });
        }
    });

    movements.sort((a,b) => a.date - b.date);

    const labels = ["Départ"];
    const dataPoints = [balance];
    const tableRows = [];
    
    movements.forEach(m => {
        balance += m.amount;
        labels.push(m.date.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}));
        dataPoints.push(balance);
        tableRows.push({ date: m.date, type: m.type, amount: m.amount, balance: balance, details: m.details });
    });

    const ctx = document.getElementById('audit-chart')?.getContext('2d');
    if(ctx) {
        if(auditChart) auditChart.destroy();
        auditChart = new Chart(ctx, { 
            type: 'line', 
            data: { 
                labels, 
                datasets: [{ 
                    label: 'Solde Trésorerie (CFA)', 
                    data: dataPoints, 
                    borderColor: '#10b981', 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                    fill: true, 
                    tension: 0.1, 
                    pointRadius: 2 
                }] 
            }, 
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, 
                scales: { y: { beginAtZero: false } } 
            } 
        });
    }

    if(tableBody) {
        tableBody.innerHTML = '';
        [...tableRows].reverse().forEach(row => {
            const tr = document.createElement('tr');
            const isPositive = row.amount >= 0;
            const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
            const sign = isPositive ? '+' : '';
            
            tr.className = "hover:bg-gray-50 transition border-b border-gray-100";
            tr.innerHTML = `
                <td class="p-3 text-xs text-gray-500">${row.date.toLocaleString()}</td>
                <td class="p-3 text-xs font-bold text-gray-700">${row.type} <span class="font-normal text-gray-400">- ${row.details}</span></td>
                <td class="p-3 text-right font-mono font-bold ${colorClass}">${sign}${formatPrice(row.amount)}</td>
                <td class="p-3 text-right font-mono font-bold text-blue-800 bg-blue-50">${formatPrice(row.balance)}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
};

export function setupAudit() {
    const page = document.getElementById('page-audit');
    if (!page) return;

    const observer = new MutationObserver((mutations) => { 
        mutations.forEach((mutation) => { 
            if (!mutation.target.classList.contains('hidden')) {
                loadAudit();
            }
        }); 
    });
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
}
