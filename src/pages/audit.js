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
    
    let movements = [];

    salesSnap.forEach(d => {
        const s = d.data();
        if(s.deleted) return;
        if(s.type === 'cash' || s.type === 'cash_import' || s.type === 'remboursement' || s.type === 'mobile_money') {
            movements.push({ date: s.date?.toDate(), amount: s.total || 0, type: 'ENTRÉE', details: s.clientName || 'Vente' });
        } else if (s.type === 'retour') {
            movements.push({ date: s.date?.toDate(), amount: -(s.total || 0), type: 'SORTIE', details: 'Retour article' });
        }
    });

    expSnap.forEach(d => {
        const e = d.data();
        if(!e.deleted) movements.push({ date: e.date?.toDate(), amount: -(e.montant || 0), type: 'SORTIE', details: e.motif });
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
