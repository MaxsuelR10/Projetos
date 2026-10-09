import { prisma } from "../config/database.js";
import { AppError } from "../utils/app-error.js";
import { normalizeCategoryRulePattern } from "../utils/normalize-category-rule.js";

const include = {
  category: { select: { id: true, name: true, type: true, isActive: true } },
  account: { select: { id: true, name: true, isActive: true } },
};

function invalidReason(rule) {
  if (!rule.category.isActive) return "A categoria desta regra está inativa";
  if (rule.category.type !== rule.type) return "A categoria não é compatível com o tipo da regra";
  if (rule.account && !rule.account.isActive) return "A conta desta regra está inativa";
  return null;
}

function conflictKey(rule) {
  return [
    rule.accountId || "GLOBAL",
    rule.type,
    rule.matchType,
    rule.normalizedPattern,
  ].join("|");
}

function serializeRules(rules) {
  const groups = new Map();
  for (const rule of rules.filter((item) => item.isActive)) {
    const key = conflictKey(rule);
    const group = groups.get(key) || [];
    group.push(rule);
    groups.set(key, group);
  }

  return rules.map((rule) => {
    const {
      userId: _userId,
      normalizedPattern: _normalizedPattern,
      sourceImportId: _sourceImportId,
      sourceImportRowKey: _sourceImportRowKey,
      ...publicRule
    } = rule;
    const group = groups.get(conflictKey(rule)) || [];
    const conflict = rule.isActive
      && new Set(group.map((item) => item.categoryId)).size > 1;
    return {
      ...publicRule,
      conflict,
      invalidReason: invalidReason(rule),
      source: rule.sourceImportId ? "IMPORT" : "MANUAL",
    };
  });
}

async function findRule(userId, id) {
  const rule = await prisma.categoryRule.findFirst({ where: { id, userId }, include });
  if (!rule) throw new AppError("Regra de categorização não encontrada", 404, "CATEGORY_RULE_NOT_FOUND");
  return rule;
}

async function validateLinks(userId, data) {
  const [category, account] = await Promise.all([
    prisma.category.findFirst({
      where: { id: data.categoryId, userId },
      select: { id: true, type: true, isActive: true },
    }),
    data.accountId
      ? prisma.account.findFirst({
          where: { id: data.accountId, userId },
          select: { id: true, isActive: true },
        })
      : null,
  ]);

  if (!category) throw new AppError("Categoria não encontrada", 404, "CATEGORY_NOT_FOUND");
  if (!category.isActive) throw new AppError("Selecione uma categoria ativa", 400, "CATEGORY_RULE_CATEGORY_INACTIVE");
  if (category.type !== data.type) {
    throw new AppError("A categoria precisa ter o mesmo tipo da regra", 400, "CATEGORY_RULE_TYPE_MISMATCH");
  }
  if (data.accountId && !account) throw new AppError("Conta não encontrada", 404, "ACCOUNT_NOT_FOUND");
  if (account && !account.isActive) throw new AppError("Selecione uma conta ativa", 400, "CATEGORY_RULE_ACCOUNT_INACTIVE");
}

export async function listCategoryRules(userId, { status, type, accountId }) {
  const isActive = status === "all" ? undefined : status === "active";
  const rules = await prisma.categoryRule.findMany({
    where: {
      userId,
      ...(isActive === undefined ? {} : { isActive }),
      ...(type ? { type } : {}),
      ...(accountId ? { OR: [{ accountId }, { accountId: null }] } : {}),
    },
    include,
    orderBy: [
      { isActive: "desc" },
      { priority: "desc" },
      { updatedAt: "desc" },
    ],
  });
  return serializeRules(rules);
}

export async function createCategoryRule(userId, data) {
  await validateLinks(userId, data);
  const normalizedPattern = normalizeCategoryRulePattern(data.pattern);
  if (normalizedPattern.length < 2) {
    throw new AppError("Informe um padrão com ao menos 2 caracteres úteis", 400, "CATEGORY_RULE_PATTERN_INVALID");
  }

  const rule = await prisma.categoryRule.create({
    data: {
      userId,
      accountId: data.accountId || null,
      categoryId: data.categoryId,
      type: data.type,
      matchType: data.matchType,
      pattern: data.pattern,
      normalizedPattern,
      priority: data.priority,
    },
    include,
  });
  return serializeRules([rule])[0];
}

export async function updateCategoryRule(userId, id, data) {
  const current = await findRule(userId, id);
  const next = {
    accountId: data.accountId !== undefined ? data.accountId : current.accountId,
    categoryId: data.categoryId ?? current.categoryId,
    type: data.type ?? current.type,
  };
  await validateLinks(userId, next);

  const normalizedPattern = data.pattern === undefined
    ? undefined
    : normalizeCategoryRulePattern(data.pattern);
  if (normalizedPattern !== undefined && normalizedPattern.length < 2) {
    throw new AppError("Informe um padrão com ao menos 2 caracteres úteis", 400, "CATEGORY_RULE_PATTERN_INVALID");
  }

  const rule = await prisma.categoryRule.update({
    where: { id: current.id },
    data: {
      ...(data.accountId !== undefined ? { accountId: data.accountId || null } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.matchType !== undefined ? { matchType: data.matchType } : {}),
      ...(data.pattern !== undefined ? { pattern: data.pattern, normalizedPattern } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
    include,
  });
  return serializeRules([rule])[0];
}

export async function deleteCategoryRule(userId, id) {
  const rule = await findRule(userId, id);
  await prisma.categoryRule.delete({ where: { id: rule.id } });
}
