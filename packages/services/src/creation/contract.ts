import { createServiceDescriptor } from "../descriptors.js";

export type CreationKind = "image" | "video";
export type CreationProtocol = "openai-images" | "comfyui" | "json-api";
export interface CreationApiMapping {
  requestPath: string;
  requestTemplate: string;
  outputPath: string;
  taskIdPath?: string;
  pollPath?: string;
  statusPath?: string;
  successValues?: string[];
  failureValues?: string[];
}
export type CreationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface CreationModel {
  id: string;
  name: string;
  kind: CreationKind;
  protocol: CreationProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  configured: boolean;
  /** ComfyUI API-format graph. The API key is never returned. */
  workflowJson?: string;
  apiMapping?: CreationApiMapping;
}

export interface CreationModelInput {
  id?: string;
  name: string;
  kind: CreationKind;
  protocol: CreationProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  workflowJson?: string;
  apiMapping?: CreationApiMapping;
  /** Write-only. Empty value preserves an existing key. */
  apiKey?: string;
}

export interface CreationOutput {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  size: number;
}

export interface CreationJob {
  id: string;
  requestId: string;
  kind: CreationKind;
  modelId: string;
  prompt: string;
  status: CreationJobStatus;
  createdAt: string;
  updatedAt: string;
  outputs: CreationOutput[];
  error?: string;
  referenceName?: string;
}

export interface CreateCreationJobInput {
  requestId: string;
  kind: CreationKind;
  modelId: string;
  prompt: string;
  reference?: { name: string; mimeType: string; dataBase64: string };
}

export interface ICreationService {
  listModels(): Promise<CreationModel[]>;
  saveModel(input: CreationModelInput): Promise<CreationModel>;
  deleteModel(id: string): Promise<void>;
  listJobs(): Promise<CreationJob[]>;
  getJob(id: string): Promise<CreationJob | null>;
  createJob(input: CreateCreationJobInput): Promise<CreationJob>;
  cancelJob(id: string): Promise<CreationJob>;
}

export const ICreationService = createServiceDescriptor<ICreationService>("studio-creation");
