// src/state.js

// This file will hold the global state of the application.
// Other modules can import these variables and functions.

export let userId = null;
export let currentBoutiqueId = null;
export let userRole = null;
export let isScanningForNewProduct = false;
export let currentAccessShopId = null;

export let allProducts = [];
export let saleCart = [];
export let cartDiscount = 0;
export let allClients = [];
export let allExpenses = [];
export let loadedTransactions = [];
export let allShopsList = [];

// Setters to modify the state
export const setUserId = (id) => userId = id;
export const setCurrentBoutiqueId = (id) => currentBoutiqueId = id;
export const setUserRole = (role) => userRole = role;
export const setIsScanningForNewProduct = (value) => isScanningForNewProduct = value; 
export const setCurrentAccessShopId = (id) => currentAccessShopId = id;

export const setAllProducts = (products) => allProducts = products;
export const setSaleCart = (cart) => saleCart = cart;
export const setCartDiscount = (val) => cartDiscount = val;
export const setAllClients = (clients) => allClients = clients;
export const setAllExpenses = (expenses) => allExpenses = expenses;
export const setLoadedTransactions = (transactions) => loadedTransactions = transactions;
export const setAllShopsList = (shops) => allShopsList = shops;

// Cart specific functions
export const addToCart = (product) => {
    if (product.stock <= 0) {
        // We need showToast here, this creates a circular dependency if we import it.
        // For now, we'll rely on the caller to show the toast.
        console.error("Epuisé");
        return false;
    }
    const existingItem = saleCart.find(item => item.id === product.id);
    if (existingItem) {
        if (existingItem.qty >= product.stock) {
            console.error("Max atteint");
            return false;
        }
        existingItem.qty++;
    } else {
        saleCart.push({ ...product, qty: 1, basePrice: product.prixVente, addedAt: new Date() });
    }
    return true;
};

export const clearCart = () => {
    saleCart = [];
    cartDiscount = 0;
};

export const updateCartItemPrice = (index, price) => {
    if (price < 0 || isNaN(price)) return;
    if (saleCart[index]) {
        saleCart[index].prixVente = price;
    }
};

export const updateCartItemQty = (index, delta) => {
    const item = saleCart[index];
    if (!item) return false;

    const product = allProducts.find(p => p.id === item.id);
    const stock = product ? product.stock : 0;

    if (delta > 0 && item.qty >= stock) {
        console.error("Stock max");
        return false;
    }

    item.qty += delta;

    if (item.qty <= 0) {
        saleCart.splice(index, 1);
    }
    return true;
};

export const getCartTotal = () => {
    return saleCart.reduce((acc, item) => acc + (item.prixVente * item.qty), 0);
};
