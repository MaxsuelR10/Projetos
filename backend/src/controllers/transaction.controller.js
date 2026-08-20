import {
  cancelTransaction,
  createTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "../services/transaction.service.js";
import { deleteTransaction } from "../services/transaction.service.js";
import { createTransfer, listTransfers, reverseTransfer } from "../services/transfer.service.js";

export async function list(request, response) {
  const result = await listTransactions(request.auth.userId, request.validated.query);
  return response.status(200).json(result);
}

export async function create(request, response) {
  const transaction = await createTransaction(request.auth.userId, request.validated.body);
  return response.status(201).json({ transaction });
}

export async function getById(request, response) {
  const transaction = await getTransaction(request.auth.userId, request.validated.params.id);
  return response.status(200).json({ transaction });
}

export async function update(request, response) {
  const transaction = await updateTransaction(request.auth.userId, request.validated.params.id, request.validated.body);
  return response.status(200).json({ transaction });
}

export async function remove(request, response) {
  await deleteTransaction(request.auth.userId, request.validated.params.id);
  return response.status(204).send();
}

export async function cancel(request, response) {
  await cancelTransaction(request.auth.userId, request.validated.params.id);
  return response.status(204).send();
}

export async function listTransfersHandler(request, response) {
  const transfers = await listTransfers(request.auth.userId, request.validated.query);
  return response.status(200).json({ transfers });
}

export async function createTransferHandler(request, response) {
  const result = await createTransfer(request.auth.userId, request.validated.body);
  return response.status(result.idempotent ? 200 : 201).json(result);
}

export async function reverseTransferHandler(request, response) {
  const transfer = await reverseTransfer(request.auth.userId, request.validated.params.id);
  return response.status(200).json({ transfer });
}
