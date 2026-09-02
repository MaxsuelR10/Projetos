import { createInvestment, listInvestments, updateInvestment } from "../services/investment.service.js";
export async function listInvestmentHandler(request, response) { return response.json(await listInvestments(request.auth.userId)); }
export async function createInvestmentHandler(request, response) { return response.status(201).json({ investment: await createInvestment(request.auth.userId, request.validated.body) }); }
export async function updateInvestmentHandler(request, response) { return response.json({ investment: await updateInvestment(request.auth.userId, request.validated.params.id, request.validated.body) }); }
