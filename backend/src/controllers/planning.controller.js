import { createGoal, listBudgets, listGoals, saveBudget } from "../services/planning.service.js";
export async function listBudgetHandler(request, response) { return response.json({ budgets: await listBudgets(request.auth.userId, request.validated.query.year, request.validated.query.month) }); }
export async function saveBudgetHandler(request, response) { return response.status(201).json({ budget: await saveBudget(request.auth.userId, request.validated.body) }); }
export async function listGoalHandler(request, response) { return response.json({ goals: await listGoals(request.auth.userId) }); }
export async function createGoalHandler(request, response) { return response.status(201).json({ goal: await createGoal(request.auth.userId, request.validated.body) }); }
