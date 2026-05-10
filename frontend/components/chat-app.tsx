"use client";

import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  History,
  KeyRound,
  Loader2,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Play,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  UploadCloud,
  User,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { chatHistory } from "@/lib/mock-data";

type Panel = "documents" | "settings";
type DocStatus = "PENDING_UPLOAD" | "UPLOADED" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

type Citation = {
  chunk_id: string;
  document_id: string;
  file_name?: string;
  page_number?: number;
  score?: number;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  citations?: Citation[];
};

type StoredDocument = {
  document_id: string;
  file_name: string;
  s3_bucket?: string;
  s3_key?: string;
  upload_status: string;
  processing_status: string;
  latest_process_id?: string | null;
  s3_object_exists?: boolean;
};

type ApiDocument = StoredDocument & {
  upload?: {
    url: string;
    fields: Record<string, string>;
  };
};

const DEFAULT_API_BASE_URL = "https://xqyn795842.execute-api.ap-south-1.amazonaws.com/dev";
const PROCESSING_STATUSES = new Set(["QUEUED", "PROCESSING", "TEXT_EXTRACTION_STARTED", "TEXT_EXTRACTION_COMPLETED", "CHUNKING_STARTED", "CHUNKING_COMPLETED", "EMBEDDING_STARTED", "INDEXING_STARTED"]);

export function ChatApp() {
  const [panel, setPanel] = useState<Panel>("documents");
  const [input, setInput] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [userId, setUserId] = useState("user_123");
  const [llmModel, setLlmModel] = useState("gpt-4.1-mini");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "CloudRAG is connected. Upload a PDF or DOCX, start processing, then ask a grounded question from the indexed document.",
    },
  ]);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.document_id === selectedDocumentId) ?? documents[0],
    [documents, selectedDocumentId],
  );

  const completedDocuments = useMemo(
    () => documents.filter((doc) => doc.processing_status === "COMPLETED").map((doc) => doc.document_id),
    [documents],
  );

  useEffect(() => {
    if (!processingId) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const job = await apiFetch<{
          process_id: string;
          document_id: string;
          status: string;
          stage: string;
          total_chunks?: number;
          error_message?: string | null;
        }>(apiBaseUrl, `/process/${processingId}/status`);

        setDocuments((current) =>
          current.map((doc) =>
            doc.document_id === job.document_id
              ? {
                  ...doc,
                  processing_status: normalizeStatus(job.status),
                  latest_process_id: job.process_id,
                }
              : doc,
          ),
        );

        if (job.status === "COMPLETED") {
          setProcessingId(null);
          setNotice(`Processing completed. ${job.total_chunks ?? "Your"} chunks are ready for chat.`);
        }

        if (job.status === "FAILED") {
          setProcessingId(null);
          setError(job.error_message || "Processing failed. Check the worker Lambda logs.");
        }
      } catch (err) {
        setError(formatError(err));
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [apiBaseUrl, processingId]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploading(true);
    setError("");
    setNotice(`Uploading ${file.name}...`);

    try {
      const uploadUrl = await apiFetch<{ documents: ApiDocument[] }>(apiBaseUrl, "/documents/upload-url", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          files: [
            {
              file_name: file.name,
              content_type: file.type || contentTypeForFile(file.name),
              file_size_bytes: file.size,
            },
          ],
        }),
      });

      const document = uploadUrl.documents[0];
      if (!document?.upload) {
        throw new Error("Upload URL response did not include S3 form fields.");
      }

      const form = new FormData();
      Object.entries(document.upload.fields).forEach(([key, value]) => {
        form.append(key, value);
      });
      form.append("file", file);

      const s3Response = await fetch(regionalS3PostUrl(document.upload.url, apiBaseUrl), {
        method: "POST",
        body: form,
      });

      if (!s3Response.ok) {
        throw new Error(`S3 upload failed with status ${s3Response.status}`);
      }

      const status = await apiFetch<StoredDocument>(apiBaseUrl, `/documents/${document.document_id}`);
      setDocuments((current) => [status, ...current.filter((doc) => doc.document_id !== status.document_id)]);
      setSelectedDocumentId(status.document_id);
      setNotice(`${file.name} uploaded. Start processing when you are ready.`);
      setPanel("documents");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setUploading(false);
    }
  }

  async function startProcessing(documentId: string) {
    setError("");
    setNotice("Starting async processing...");

    try {
      const response = await apiFetch<{
        process_id: string;
        document_id: string;
        status: string;
      }>(apiBaseUrl, `/documents/${documentId}/process`, {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          embedding_model: embeddingModel,
          chunking_strategy: "recursive",
          chunk_size: 800,
          chunk_overlap: 120,
        }),
      });

      setProcessingId(response.process_id);
      setDocuments((current) =>
        current.map((doc) =>
          doc.document_id === documentId
            ? { ...doc, processing_status: normalizeStatus(response.status), latest_process_id: response.process_id }
            : doc,
        ),
      );
      setNotice(`Processing queued: ${response.process_id}`);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = input.trim();

    if (!query || asking) {
      return;
    }

    const documentIds = selectedDocument?.processing_status === "COMPLETED" ? [selectedDocument.document_id] : completedDocuments;
    if (documentIds.length === 0) {
      setError("Process at least one document before asking questions.");
      return;
    }

    setAsking(true);
    setError("");
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: query }]);

    try {
      const response = await apiFetch<{
        answer: string;
        citations: Citation[];
        retrieved_chunks: number;
      }>(apiBaseUrl, "/ask", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          query,
          document_ids: documentIds,
          top_k: 5,
          llm_model: llmModel,
        }),
      });

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.answer,
          citations: response.citations,
        },
      ]);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="sidebarTop">
          <button className="iconButton" aria-label="Toggle sidebar">
            <Menu size={18} />
          </button>
          <button
            className="newChat"
            onClick={() =>
              setMessages([
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: "New chat started. I will answer from your completed documents.",
                },
              ])
            }
          >
            <MessageSquarePlus size={17} />
            New chat
          </button>
        </div>

        <div className="navBlock">
          <button className={panel === "documents" ? "navItem active" : "navItem"} onClick={() => setPanel("documents")}>
            <FileText size={18} />
            Document store
          </button>
          <button className={panel === "settings" ? "navItem active" : "navItem"} onClick={() => setPanel("settings")}>
            <Settings size={18} />
            Settings
          </button>
          <button className="navItem">
            <Search size={18} />
            Search
          </button>
        </div>

        <section className="history">
          <div className="sectionTitle">
            <span>Chats</span>
            <History size={15} />
          </div>
          {chatHistory.map((chat, index) => (
            <button className={index === 0 ? "chatRow selected" : "chatRow"} key={chat.id}>
              <span>{chat.title}</span>
              <small>{chat.time}</small>
            </button>
          ))}
        </section>
      </aside>

      <section className="chatColumn">
        <header className="chatHeader">
          <div>
            <p className="eyebrow">CloudRAG Agent</p>
            <h1>Document chat</h1>
          </div>
          <button className="modelSelect" onClick={() => setPanel("settings")}>
            {llmModel}
            <ChevronDown size={16} />
          </button>
        </header>

        {(notice || error) && (
          <div className={error ? "appNotice error" : "appNotice"}>
            {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{error || notice}</span>
          </div>
        )}

        <div className="conversation">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="avatar">{message.role === "assistant" ? <Bot size={18} /> : <User size={18} />}</div>
              <div className="bubble">
                {message.content.split("\n").map((line) => (
                  <p key={line || crypto.randomUUID()}>{line}</p>
                ))}
                {message.citations && message.citations.length > 0 && (
                  <div className="citations">
                    {message.citations.map((citation, index) => (
                      <span key={citation.chunk_id}>
                        [{index + 1}] {citation.file_name || citation.document_id} p.{citation.page_number ?? "?"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
          {asking && (
            <article className="message assistant">
              <div className="avatar">
                <Bot size={18} />
              </div>
              <div className="bubble mutedBubble">
                <Loader2 size={16} className="spin" />
                Thinking with retrieved chunks...
              </div>
            </article>
          )}
        </div>

        <form className="composer" onSubmit={handleAsk}>
          <textarea
            aria-label="Message"
            placeholder="Ask your processed documents anything..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="composerActions">
            <label className="iconButton" aria-label="Attach document">
              <Paperclip size={18} />
              <input className="hiddenFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleUpload} />
            </label>
            <button type="button" className="filterButton" onClick={() => setPanel("documents")}>
              <SlidersHorizontal size={16} />
              {selectedDocument ? selectedDocument.file_name : "All indexed docs"}
            </button>
            <button type="submit" className="sendButton" aria-label="Send message" disabled={asking}>
              {asking ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </section>

      <aside className="workspace">
        <div className="workspaceHeader">
          <div>
            <p className="eyebrow">{panel === "documents" ? "Library" : "Runtime"}</p>
            <h2>{panel === "documents" ? "Document store" : "Settings"}</h2>
          </div>
          <button className="iconButton" aria-label="More options">
            <MoreHorizontal size={18} />
          </button>
        </div>

        {panel === "documents" ? (
          <DocumentStore
            documents={documents}
            selectedDocumentId={selectedDocument?.document_id}
            uploading={uploading}
            onUpload={handleUpload}
            onSelect={setSelectedDocumentId}
            onProcess={startProcessing}
          />
        ) : (
          <SettingsPanel
            apiBaseUrl={apiBaseUrl}
            userId={userId}
            llmModel={llmModel}
            embeddingModel={embeddingModel}
            onApiBaseUrlChange={setApiBaseUrl}
            onUserIdChange={setUserId}
            onLlmModelChange={setLlmModel}
            onEmbeddingModelChange={setEmbeddingModel}
          />
        )}
      </aside>
    </main>
  );
}

function DocumentStore({
  documents,
  selectedDocumentId,
  uploading,
  onUpload,
  onSelect,
  onProcess,
}: {
  documents: StoredDocument[];
  selectedDocumentId?: string;
  uploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelect: (documentId: string) => void;
  onProcess: (documentId: string) => void;
}) {
  return (
    <div className="panelContent">
      <label className={uploading ? "uploadZone disabled" : "uploadZone"}>
        {uploading ? <Loader2 size={24} className="spin" /> : <UploadCloud size={24} />}
        <span>{uploading ? "Uploading..." : "Upload PDF or DOCX"}</span>
        <small>Generates a pre-signed S3 upload, then stores metadata</small>
        <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onUpload} disabled={uploading} />
      </label>

      <div className="documentList">
        {documents.length === 0 && (
          <div className="emptyState">
            <FileText size={18} />
            Upload a document to start the RAG flow.
          </div>
        )}

        {documents.map((doc) => {
          const status = normalizeStatus(doc.processing_status);
          const isProcessing = PROCESSING_STATUSES.has(status);
          const canProcess = doc.upload_status === "UPLOADED" && !isProcessing && status !== "COMPLETED";

          return (
            <button className={selectedDocumentId === doc.document_id ? "documentCard selected" : "documentCard"} key={doc.document_id} onClick={() => onSelect(doc.document_id)}>
              <div className="docIcon">
                <FileText size={18} />
              </div>
              <div>
                <strong>{doc.file_name}</strong>
                <span>{doc.document_id}</span>
              </div>
              <em className={statusClassName(status)}>{statusLabel(status)}</em>
              <div className="documentActions">
                {isProcessing && <Clock3 size={15} />}
                {canProcess && (
                  <span
                    className="miniAction"
                    onClick={(event) => {
                      event.stopPropagation();
                      onProcess(doc.document_id);
                    }}
                  >
                    <Play size={13} />
                    Process
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SettingsPanel({
  apiBaseUrl,
  userId,
  llmModel,
  embeddingModel,
  onApiBaseUrlChange,
  onUserIdChange,
  onLlmModelChange,
  onEmbeddingModelChange,
}: {
  apiBaseUrl: string;
  userId: string;
  llmModel: string;
  embeddingModel: string;
  onApiBaseUrlChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onEmbeddingModelChange: (value: string) => void;
}) {
  return (
    <div className="panelContent">
      <label className="field">
        <span>Backend URL</span>
        <input value={apiBaseUrl} onChange={(event) => onApiBaseUrlChange(event.target.value)} placeholder="https://api.example.com/dev" />
      </label>
      <label className="field">
        <span>User ID</span>
        <input value={userId} onChange={(event) => onUserIdChange(event.target.value)} placeholder="user_123" />
      </label>
      <label className="field">
        <span>OpenAI API key</span>
        <div className="inputWithIcon">
          <KeyRound size={16} />
          <input placeholder="Stored in Lambda environment, not the browser" type="password" disabled />
        </div>
      </label>
      <label className="field">
        <span>Answer model</span>
        <select value={llmModel} onChange={(event) => onLlmModelChange(event.target.value)}>
          <option>gpt-4.1-mini</option>
          <option>gpt-4.1</option>
          <option>gpt-4o-mini</option>
        </select>
      </label>
      <label className="field">
        <span>Embedding model</span>
        <select value={embeddingModel} onChange={(event) => onEmbeddingModelChange(event.target.value)}>
          <option>text-embedding-3-small</option>
          <option>text-embedding-3-large</option>
        </select>
      </label>
      <div className="settingNote">
        <CheckCircle2 size={17} />
        API keys stay server-side in Lambda. This UI only sends document and chat requests to your deployed API Gateway.
      </div>
    </div>
  );
}

async function apiFetch<T>(apiBaseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(body.error || body.message || `Request failed with status ${response.status}`);
  }

  return body as T;
}

function contentTypeForFile(fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function regionalS3PostUrl(uploadUrl: string, apiBaseUrl: string) {
  const region = regionFromApiUrl(apiBaseUrl);
  if (!region) {
    return uploadUrl;
  }

  return uploadUrl.replace(".s3.amazonaws.com", `.s3.${region}.amazonaws.com`);
}

function regionFromApiUrl(apiBaseUrl: string) {
  const match = apiBaseUrl.match(/execute-api\.([a-z0-9-]+)\.amazonaws\.com/);
  return match?.[1];
}

function normalizeStatus(status?: string) {
  return (status || "NOT_STARTED").toUpperCase() as DocStatus;
}

function statusLabel(status: string) {
  if (status === "COMPLETED") return "Indexed";
  if (status === "FAILED") return "Failed";
  if (PROCESSING_STATUSES.has(status)) return "Processing";
  if (status === "UPLOADED" || status === "NOT_STARTED") return "Uploaded";
  return status.replaceAll("_", " ");
}

function statusClassName(status: string) {
  if (status === "COMPLETED") return "status done";
  if (status === "FAILED") return "status failed";
  return "status";
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}
