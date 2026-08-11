import {
  cancelPurchase,
  createCard,
  createPurchase,
  deleteCard,
  getCard,
  listCards,
  listInvoices,
  listPurchases,
  payInvoice,
  updateCard,
  updatePurchase,
} from "../services/card.service.js";

export async function list(request, response) { return response.status(200).json({ cards: await listCards(request.auth.userId, request.validated.query.status) }); }
export async function getById(request, response) { return response.status(200).json({ card: await getCard(request.auth.userId, request.validated.params.id) }); }
export async function create(request, response) { return response.status(201).json({ card: await createCard(request.auth.userId, request.validated.body) }); }
export async function update(request, response) { return response.status(200).json({ card: await updateCard(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function remove(request, response) { await deleteCard(request.auth.userId, request.validated.params.id); return response.status(204).send(); }
export async function createPurchaseHandler(request, response) { return response.status(201).json({ purchase: await createPurchase(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function listPurchasesHandler(request, response) { return response.status(200).json({ purchases: await listPurchases(request.auth.userId, request.validated.params.id, request.validated.query.includeCancelled) }); }
export async function updatePurchaseHandler(request, response) { return response.status(200).json({ purchase: await updatePurchase(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function cancelPurchaseHandler(request, response) { await cancelPurchase(request.auth.userId, request.validated.params.id); return response.status(204).send(); }
export async function listInvoicesHandler(request, response) { return response.status(200).json({ invoices: await listInvoices(request.auth.userId, request.validated.params.id) }); }
export async function payInvoiceHandler(request, response) { return response.status(200).json({ invoice: await payInvoice(request.auth.userId, request.validated.params.id, request.validated.body) }); }
