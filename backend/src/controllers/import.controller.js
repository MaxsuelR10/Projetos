import { commitCsvImport, previewCsvImport } from "../services/import.service.js";

export async function previewCsv(request, response) {
  return response.status(200).json(await previewCsvImport(request.auth.userId, request.validated.body));
}

export async function commitCsv(request, response) {
  return response.status(201).json(await commitCsvImport(request.auth.userId, request.validated.body));
}
