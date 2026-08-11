import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeName } from "../utils/normalize-name.js";

function nullable(value) {
  return value?.trim() || null;
}

function serializeSubcategory(subcategory) {
  const { normalizedName: _normalizedName, userId: _userId, categoryId: _categoryId, ...publicSubcategory } = subcategory;
  return publicSubcategory;
}

function serializeCategory(category) {
  const { normalizedName: _normalizedName, userId: _userId, subcategories = [], ...publicCategory } = category;
  return {
    ...publicCategory,
    subcategories: subcategories.map(serializeSubcategory),
  };
}

function categoryInclude(includeInactive) {
  return {
    subcategories: {
      ...(includeInactive ? {} : { where: { isActive: true } }),
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    },
  };
}

async function findCategory(userId, id, includeInactive = true) {
  const category = await prisma.category.findFirst({
    where: { id, userId, ...(includeInactive ? {} : { isActive: true }) },
    include: categoryInclude(includeInactive),
  });

  if (!category) {
    throw new AppError("Categoria não encontrada", 404, "CATEGORY_NOT_FOUND");
  }

  return category;
}

async function ensureUniqueCategory(userId, name, type, ignoredId) {
  const category = await prisma.category.findFirst({
    where: {
      userId,
      type,
      normalizedName: normalizeName(name),
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
    },
    select: { id: true },
  });

  if (category) {
    throw new AppError("Já existe uma categoria com este nome", 409, "CATEGORY_NAME_IN_USE");
  }
}

async function ensureUniqueSubcategory(userId, categoryId, name, ignoredId) {
  const subcategory = await prisma.subcategory.findFirst({
    where: {
      userId,
      categoryId,
      normalizedName: normalizeName(name),
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
    },
    select: { id: true },
  });

  if (subcategory) {
    throw new AppError("Já existe uma subcategoria com este nome", 409, "SUBCATEGORY_NAME_IN_USE");
  }
}

export async function listCategories(userId, { type, status }) {
  const isActive = status === "all" ? undefined : status === "active";

  const categories = await prisma.category.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
      ...(isActive === undefined ? {} : { isActive }),
    },
    include: categoryInclude(status === "all"),
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  });

  return categories.map(serializeCategory);
}

export async function createCategory(userId, data) {
  await ensureUniqueCategory(userId, data.name, data.type);

  try {
    const category = await prisma.category.create({
      data: {
        userId,
        name: data.name,
        normalizedName: normalizeName(data.name),
        type: data.type,
        color: data.color || null,
        icon: nullable(data.icon),
      },
      include: categoryInclude(true),
    });
    return serializeCategory(category);
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Já existe uma categoria com este nome", 409, "CATEGORY_NAME_IN_USE");
    }

    throw error;
  }
}

export async function updateCategory(userId, id, data) {
  const category = await findCategory(userId, id);
  const nextName = data.name ?? category.name;
  const nextType = data.type ?? category.type;

  if (nextName !== category.name || nextType !== category.type) {
    await ensureUniqueCategory(userId, nextName, nextType, id);
  }

  const updatedCategory = await prisma.category.update({
    where: { id: category.id },
    data: {
      ...(data.name !== undefined
        ? { name: data.name, normalizedName: normalizeName(data.name) }
        : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.color !== undefined ? { color: data.color || null } : {}),
      ...(data.icon !== undefined ? { icon: nullable(data.icon) } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include: categoryInclude(true),
  });

  return serializeCategory(updatedCategory);
}

export async function deleteCategory(userId, id) {
  const category = await findCategory(userId, id);

  if (category.isDefault) {
    throw new AppError(
      "Categorias padrão podem ser desativadas, mas não excluídas",
      409,
      "DEFAULT_CATEGORY_PROTECTED",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const [transactionCount, subcategoryCount] = await Promise.all([
      transaction.transaction.count({ where: { categoryId: category.id, userId } }),
      transaction.subcategory.count({ where: { categoryId: category.id, userId } }),
    ]);

    if (transactionCount > 0 || subcategoryCount > 0) {
      throw new AppError(
        "Esta categoria possui registros relacionados e só pode ser desativada",
        409,
        "CATEGORY_HAS_RECORDS",
      );
    }

    const deletedCategory = await transaction.category.delete({ where: { id: category.id } });
    return serializeCategory(deletedCategory);
  });
}

export async function createSubcategory(userId, categoryId, data) {
  await findCategory(userId, categoryId);
  await ensureUniqueSubcategory(userId, categoryId, data.name);

  try {
    const subcategory = await prisma.subcategory.create({
      data: {
        userId,
        categoryId,
        name: data.name,
        normalizedName: normalizeName(data.name),
        color: data.color || null,
        icon: nullable(data.icon),
      },
    });
    return serializeSubcategory(subcategory);
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Já existe uma subcategoria com este nome", 409, "SUBCATEGORY_NAME_IN_USE");
    }

    throw error;
  }
}

export async function updateSubcategory(userId, categoryId, id, data) {
  await findCategory(userId, categoryId);
  const subcategory = await prisma.subcategory.findFirst({
    where: { id, categoryId, userId },
  });

  if (!subcategory) {
    throw new AppError("Subcategoria não encontrada", 404, "SUBCATEGORY_NOT_FOUND");
  }

  if (data.name !== undefined && data.name !== subcategory.name) {
    await ensureUniqueSubcategory(userId, categoryId, data.name, id);
  }

  const updatedSubcategory = await prisma.subcategory.update({
    where: { id: subcategory.id },
    data: {
      ...(data.name !== undefined
        ? { name: data.name, normalizedName: normalizeName(data.name) }
        : {}),
      ...(data.color !== undefined ? { color: data.color || null } : {}),
      ...(data.icon !== undefined ? { icon: nullable(data.icon) } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  return serializeSubcategory(updatedSubcategory);
}

export async function deleteSubcategory(userId, categoryId, id) {
  await findCategory(userId, categoryId);
  const subcategory = await prisma.subcategory.findFirst({
    where: { id, categoryId, userId },
  });

  if (!subcategory) {
    throw new AppError("Subcategoria não encontrada", 404, "SUBCATEGORY_NOT_FOUND");
  }

  const transactionCount = await prisma.transaction.count({
    where: { subcategoryId: subcategory.id, userId },
  });

  if (transactionCount > 0) {
    throw new AppError(
      "Esta subcategoria possui movimentações e só pode ser desativada",
      409,
      "SUBCATEGORY_HAS_RECORDS",
    );
  }

  const deletedSubcategory = await prisma.subcategory.delete({ where: { id: subcategory.id } });
  return serializeSubcategory(deletedSubcategory);
}
