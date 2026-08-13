import {
  adoptLegacyGoal,
  createContribution,
  createInvestment,
  deleteContribution,
  deleteInvestment,
  getInvestment,
  listInvestments,
  refreshIndices,
  updateContribution,
  updateInvestment,
} from "../services/investment.service.js";

export async function list(request, response) { return response.status(200).json(await listInvestments(request.auth.userId)); }
export async function getById(request, response) { return response.status(200).json(await getInvestment(request.auth.userId, request.validated.params.id)); }
export async function create(request, response) { return response.status(201).json({ investment: await createInvestment(request.auth.userId, request.validated.body) }); }
export async function update(request, response) { return response.status(200).json({ investment: await updateInvestment(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function remove(request, response) { await deleteInvestment(request.auth.userId, request.validated.params.id); return response.status(204).send(); }
export async function createContributionHandler(request, response) { return response.status(201).json({ contribution: await createContribution(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function updateContributionHandler(request, response) { return response.status(200).json({ contribution: await updateContribution(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function removeContributionHandler(request, response) { await deleteContribution(request.auth.userId, request.validated.params.id); return response.status(204).send(); }
export async function adoptLegacyGoalHandler(request, response) { return response.status(200).json({ investment: await adoptLegacyGoal(request.auth.userId, request.validated.params.id, request.validated.params.goalId) }); }
export async function refreshIndicesHandler(_request, response) { return response.status(200).json(await refreshIndices()); }
