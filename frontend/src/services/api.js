// src/services/api.js

const API_BASE_URL = 'http://localhost:8000/api';

// ============================================
// QUOTATIONS API
// ============================================

export const quotationsAPI = {
  // Get all quotations
  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/quotations/`);
    if (!response.ok) throw new Error('Failed to fetch quotations');
    return response.json();
  },

  // Get single quotation with all details
  getById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/quotations/${id}`);
    if (!response.ok) throw new Error('Failed to fetch quotation');
    return response.json();
  },

  // Create new quotation
  create: async (data) => {
    const response = await fetch(`${API_BASE_URL}/quotations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create quotation');
    return response.json();
  },

  // Update quotation
  update: async (id, data) => {
    const response = await fetch(`${API_BASE_URL}/quotations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update quotation');
    return response.json();
  },

  // Delete quotation
  delete: async (id) => {
    const response = await fetch(`${API_BASE_URL}/quotations/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete quotation');
  },

  // Change status
  changeStatus: async (id, newStatus) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${id}/status?new_status=${newStatus}`,
      { method: 'PATCH' }
    );
    if (!response.ok) throw new Error('Failed to change status');
    return response.json();
  },

  // Execute Rule Engine
  executeRules: async (id) => {
    const response = await fetch(`${API_BASE_URL}/rules/execute/${id}`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to execute rules');
    return response.json();
  },
};

// ============================================
// MATERIALS API
// ============================================

export const materialsAPI = {
  // Get all materials for a quotation
  getAll: async (quotationId) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/materials/`
    );
    if (!response.ok) throw new Error('Failed to fetch materials');
    return response.json();
  },

  // Get materials summary
  getSummary: async (quotationId) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/materials/summary/totals`
    );
    if (!response.ok) throw new Error('Failed to fetch summary');
    return response.json();
  },

  // Create material
  create: async (quotationId, data) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/materials/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to create material');
    return response.json();
  },

  // Delete material
  delete: async (quotationId, materialId) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/materials/${materialId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error('Failed to delete material');
  },
};

// ============================================
// ORDER DETAILS API
// ============================================

export const orderDetailsAPI = {
  get: async (quotationId) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/order-details/`
    );
    if (!response.ok) throw new Error('Failed to fetch order details');
    return response.json();
  },

  create: async (quotationId, data) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/order-details/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to create order details');
    return response.json();
  },

  update: async (quotationId, data) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/order-details/`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to update order details');
    return response.json();
  },
};

// ============================================
// MAIN DATA API
// ============================================

export const mainDataAPI = {
  get: async (quotationId) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/main-data/`
    );
    if (!response.ok) throw new Error('Failed to fetch main data');
    return response.json();
  },

  create: async (quotationId, data) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/main-data/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to create main data');
    return response.json();
  },

  update: async (quotationId, data) => {
    const response = await fetch(
      `${API_BASE_URL}/quotations/${quotationId}/main-data/`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to update main data');
    return response.json();
  },
};
