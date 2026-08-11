import bcrypt from "bcrypt";
import { prisma } from "../config/database.js";
import { defaultCategories } from "../constants/default-categories.js";
import { AppError } from "../utils/app-error.js";

const BCRYPT_ROUNDS = 12;

function toPublicUser(user) {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function registerUser({ name, email, password, currency }) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError("Já existe uma conta com este email", 409, "EMAIL_IN_USE");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: { name, email, passwordHash, currency },
      });

      await transaction.category.createMany({
        data: defaultCategories.map((category) => ({
          ...category,
          userId: createdUser.id,
        })),
      });

      return createdUser;
    });

    return toPublicUser(user);
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError("Já existe uma conta com este email", 409, "EMAIL_IN_USE");
    }

    throw error;
  }
}

export async function authenticateUser({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError("Email ou senha inválidos", 401, "INVALID_CREDENTIALS");
  }

  return toPublicUser(user);
}

export async function getUserById(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError("Usuário não encontrado", 401, "INVALID_SESSION");
  }

  return user;
}
