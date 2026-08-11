import { getDashboard } from "../services/dashboard.service.js";
export async function get(request, response) { return response.status(200).json(await getDashboard(request.auth.userId, request.validated.query.month)); }
