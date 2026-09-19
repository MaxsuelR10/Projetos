import { createReminder, createWish, deleteReminder, deleteWish, listReminders, listWishes, updateReminder, updateWish } from "../services/wish.service.js";

export async function listHandler(request, response) {
  const [wishes, reminders] = await Promise.all([listWishes(request.auth.userId), listReminders(request.auth.userId)]);
  return response.json({ wishes, reminders });
}
export async function createWishHandler(request, response) { return response.status(201).json({ wish: await createWish(request.auth.userId, request.validated.body) }); }
export async function updateWishHandler(request, response) { return response.json({ wish: await updateWish(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function deleteWishHandler(request, response) { await deleteWish(request.auth.userId, request.validated.params.id); return response.status(204).send(); }
export async function createReminderHandler(request, response) { return response.status(201).json({ reminder: await createReminder(request.auth.userId, request.validated.body) }); }
export async function updateReminderHandler(request, response) { return response.json({ reminder: await updateReminder(request.auth.userId, request.validated.params.id, request.validated.body) }); }
export async function deleteReminderHandler(request, response) { await deleteReminder(request.auth.userId, request.validated.params.id); return response.status(204).send(); }
