import {
  createCategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  updateCategoryRule,
} from "../services/category-rule.service.js";

export async function list(request, response) {
  const rules = await listCategoryRules(request.auth.userId, request.validated.query);
  return response.status(200).json({ rules });
}

export async function create(request, response) {
  const rule = await createCategoryRule(request.auth.userId, request.validated.body);
  return response.status(201).json({ rule });
}

export async function update(request, response) {
  const rule = await updateCategoryRule(
    request.auth.userId,
    request.validated.params.id,
    request.validated.body,
  );
  return response.status(200).json({ rule });
}

export async function remove(request, response) {
  await deleteCategoryRule(request.auth.userId, request.validated.params.id);
  return response.status(204).send();
}
