import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  listCategories,
  updateCategory,
  updateSubcategory,
} from "../services/category.service.js";

export async function list(request, response) {
  const categories = await listCategories(request.auth.userId, request.validated.query);
  return response.status(200).json({ categories });
}

export async function create(request, response) {
  const category = await createCategory(request.auth.userId, request.validated.body);
  return response.status(201).json({ category });
}

export async function update(request, response) {
  const category = await updateCategory(
    request.auth.userId,
    request.validated.params.id,
    request.validated.body,
  );
  return response.status(200).json({ category });
}

export async function remove(request, response) {
  await deleteCategory(request.auth.userId, request.validated.params.id);
  return response.status(204).send();
}

export async function createChild(request, response) {
  const subcategory = await createSubcategory(
    request.auth.userId,
    request.validated.params.categoryId,
    request.validated.body,
  );
  return response.status(201).json({ subcategory });
}

export async function updateChild(request, response) {
  const subcategory = await updateSubcategory(
    request.auth.userId,
    request.validated.params.categoryId,
    request.validated.params.id,
    request.validated.body,
  );
  return response.status(200).json({ subcategory });
}

export async function removeChild(request, response) {
  await deleteSubcategory(
    request.auth.userId,
    request.validated.params.categoryId,
    request.validated.params.id,
  );
  return response.status(204).send();
}
