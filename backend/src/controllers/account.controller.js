import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "../services/account.service.js";

export async function list(request, response) {
  const accounts = await listAccounts(request.auth.userId, request.validated.query.status);
  return response.status(200).json({ accounts });
}

export async function getById(request, response) {
  const account = await getAccount(request.auth.userId, request.validated.params.id);
  return response.status(200).json({ account });
}

export async function create(request, response) {
  const account = await createAccount(request.auth.userId, request.validated.body);
  return response.status(201).json({ account });
}

export async function update(request, response) {
  const account = await updateAccount(
    request.auth.userId,
    request.validated.params.id,
    request.validated.body,
  );
  return response.status(200).json({ account });
}

export async function remove(request, response) {
  await deleteAccount(request.auth.userId, request.validated.params.id);
  return response.status(204).send();
}
