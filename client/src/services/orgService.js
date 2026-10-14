import { get, patch, post, put } from './api';

export const listOrganisations = (params) => get('/organisations', params);
export const updateOrganisation = async (id, payload) => (await patch(`/organisations/${id}`, payload)).data;
export const listUsers = (params) => get('/users', params);
export const setUserStatus = async (id, status) => (await patch(`/users/${id}/status`, { status })).data;
export const listProductTypes = (params) => get('/product-types', params);
export const createProductType = async (payload) => (await post('/product-types', payload)).data;
export const updateProductType = async (id, payload) => (await put(`/product-types/${id}`, payload)).data;
