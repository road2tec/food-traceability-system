import { get, post } from './api';

export const login = async (payload) => (await post('/auth/login', payload)).data;
export const register = async (payload) => (await post('/auth/register', payload)).data;
export const logout = async () => (await post('/auth/logout')).data;
export const me = async () => (await get('/auth/me')).data;
