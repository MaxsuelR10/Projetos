import { createRecurrence, createSubscription, generateRecurrences, listRecurrences, listSubscriptions, updateRecurrence, updateSubscription } from "../services/recurrence.service.js";
export async function listRecurrence(request, response) { return response.status(200).json({ recurrences: await listRecurrences(request.auth.userId, request.validated.query.status) }); }
export async function createRecurrenceHandler(request, response) { return response.status(201).json({ recurrence: await createRecurrence(request.auth.userId, request.validated.body) }); }
export async function updateRecurrenceHandler(request, response) { return response.status(200).json({ recurrence: await updateRecurrence(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function generateHandler(request, response) { return response.status(200).json(await generateRecurrences(request.auth.userId, request.validated.body.through)); }
export async function listSubscription(request, response) { return response.status(200).json(await listSubscriptions(request.auth.userId, request.validated.query.status)); }
export async function createSubscriptionHandler(request, response) { return response.status(201).json({ subscription: await createSubscription(request.auth.userId, request.validated.body) }); }
export async function updateSubscriptionHandler(request, response) { return response.status(200).json({ subscription: await updateSubscription(request.auth.userId, request.validated.params.id, request.validated.body) }); }
