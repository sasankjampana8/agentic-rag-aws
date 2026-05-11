"use client";

import {
  AlertCircle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  History,
  KeyRound,
  Loader2,
  LogIn,
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

type Panel = "documents" | "settings" | "trace";
type DocStatus = "PENDING_UPLOAD" | "UPLOADED" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "NOT_STARTED";

type Citation = {
  chunk_id: string;
  document_id: string;
  file_name?: string;
  page_number?: number;
  score?: number;
};

type Artifact = {
  artifact_id: string;
  artifact_type: string;
  content_type: string;
  presigned_url?: string;
  s3_key?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  citations?: Citation[];
  artifacts?: Artifact[];
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

type ChatSummary = {
  chat_id: string;
  title: string;
  status: string;
  message_count?: number;
  last_message_preview?: string | null;
  updated_at?: string;
};

type AuthTokens = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

const DEFAULT_API_BASE_URL = "https://xqyn795842.execute-api.ap-south-1.amazonaws.com/dev";
const PROCESSING_STATUSES = new Set([
  "QUEUED",
  "PROCESSING",
  "TEXT_EXTRACTION_STARTED",
  "TEXT_EXTRACTION_COMPLETED",
  "CHUNKING_STARTED",
  "CHUNKING_COMPLETED",
  "EMBEDDING_STARTED",
  "INDEXING_STARTED",
]);

export function ChatApp() {
  const [panel, setPanel] = useState<Panel>("documents");
  const [input, setInput] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [llmModel, setLlmModel] = useState("gpt-4.1-mini");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [activeRunId, setActiveRunId] = useState<string>("");
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Sign in, upload documents, process them, then ask grounded questions. I will route through RAG, memory, and tools when useful.",
    },
  ]);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
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

  const authenticated = Boolean(tokens?.access_token);

  useEffect(() => {
    const savedApi = window.localStorage.getItem("cloudrag.apiBaseUrl");
    const savedTokens = window.localStorage.getItem("cloudrag.tokens");
    const savedEmail = window.localStorage.getItem("cloudrag.email");
    if (savedApi) setApiBaseUrl(savedApi);
    if (savedEmail) setEmail(savedEmail);
    if (savedTokens) setTokens(JSON.parse(savedTokens));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("cloudrag.apiBaseUrl", apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!tokens?.access_token) {
      return;
    }
    refreshDocuments();
    refreshChats();
  }, [tokens?.access_token]);

  useEffect(() => {
    if (!processingId || !selectedDocumentId || !tokens?.access_token) {
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
        }>(apiBaseUrl, `/v1/documents/${selectedDocumentId}/processes/${processingId}`, { token: tokens.access_token });

        setDocuments((current) =>
          current.map((doc) =>
            doc.document_id === job.document_id
              ? { ...doc, processing_status: normalizeStatus(job.status), latest_process_id: job.process_id }
              : doc,
          ),
        );

        if (job.status === "COMPLETED") {
          setProcessingId(null);
          setNotice(`Processing completed. ${job.total_chunks ?? "Your"} chunks are ready for chat.`);
          refreshDocuments();
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
  }, [apiBaseUrl, processingId, selectedDocumentId, tokens?.access_token]);

  useEffect(() => {
    if (!pendingMessageId || !activeChatId || !tokens?.access_token) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await apiFetch<{
          message_id: string;
          status: string;
          answer: string | null;
          citations: Citation[];
          artifacts: Artifact[];
          run_id: string;
          error_message?: string | null;
        }>(apiBaseUrl, `/v1/chats/${activeChatId}/messages/${pendingMessageId}/response`, {
          token: tokens.access_token,
        });

        setActiveRunId(response.run_id);
        if (response.status === "COMPLETED" && response.answer) {
          setPendingMessageId(null);
          setAsking(false);
          setMessages((current) => [
            ...current,
            {
              id: `${response.message_id}_assistant`,
              role: "assistant",
              content: response.answer || "",
              citations: response.citations,
              artifacts: response.artifacts,
            },
          ]);
          setNotice("Answer completed. Trace is available in the Trace panel.");
          refreshChats();
          loadTrace(response.run_id);
        }

        if (response.status === "FAILED") {
          setPendingMessageId(null);
          setAsking(false);
          setError(response.error_message || "Runtime failed. Check the run trace and CloudWatch logs.");
        }
      } catch (err) {
        setError(formatError(err));
      }
    }, 3500);

    return () => window.clearInterval(timer);
  }, [activeChatId, apiBaseUrl, pendingMessageId, tokens?.access_token]);

  async function refreshDocuments() {
    if (!tokens?.access_token) return;
    const response = await apiFetch<{ documents: StoredDocument[] }>(apiBaseUrl, "/v1/documents", {
      token: tokens.access_token,
    });
    setDocuments(response.documents || []);
    if (!selectedDocumentId && response.documents?.[0]) {
      setSelectedDocumentId(response.documents[0].document_id);
    }
  }

  async function refreshChats() {
    if (!tokens?.access_token) return;
    const response = await apiFetch<{ chats: ChatSummary[] }>(apiBaseUrl, "/v1/chats", {
      token: tokens.access_token,
    });
    setChats(response.chats || []);
    if (!activeChatId && response.chats?.[0]) {
      setActiveChatId(response.chats[0].chat_id);
    }
  }

  async function signup() {
    setError("");
    const response = await apiFetch<{ status: string }>(apiBaseUrl, "/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name: name || email }),
    });
    setNotice(`Signup status: ${response.status}. Check email for confirmation code.`);
    window.localStorage.setItem("cloudrag.email", email);
  }

  async function confirmSignup() {
    setError("");
    const response = await apiFetch<{ status: string }>(apiBaseUrl, "/v1/auth/confirm", {
      method: "POST",
      body: JSON.stringify({ email, confirmation_code: confirmationCode }),
    });
    setNotice(`User ${response.status}. You can log in now.`);
  }

  async function login() {
    setError("");
    const response = await apiFetch<AuthTokens>(apiBaseUrl, "/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(response);
    window.localStorage.setItem("cloudrag.tokens", JSON.stringify(response));
    window.localStorage.setItem("cloudrag.email", email);
    setNotice("Logged in. Protected /v1 APIs are ready.");
  }

  function logout() {
    setTokens(null);
    setDocuments([]);
    setChats([]);
    setActiveChatId("");
    setActiveRunId("");
    setTrace(null);
    window.localStorage.removeItem("cloudrag.tokens");
    setNotice("Logged out locally.");
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !tokens?.access_token) {
      setError("Log in before uploading documents.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice(`Uploading ${file.name}...`);

    try {
      const uploadUrl = await apiFetch<{ documents: ApiDocument[] }>(apiBaseUrl, "/v1/documents/upload-url", {
        method: "POST",
        token: tokens.access_token,
        body: JSON.stringify({
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
      Object.entries(document.upload.fields).forEach(([key, value]) => form.append(key, value));
      form.append("file", file);

      const s3Response = await fetch(regionalS3PostUrl(document.upload.url, apiBaseUrl), {
        method: "POST",
        body: form,
      });

      if (!s3Response.ok) {
        throw new Error(`S3 upload failed with status ${s3Response.status}`);
      }

      const status = await apiFetch<StoredDocument>(apiBaseUrl, `/v1/documents/${document.document_id}`, {
        token: tokens.access_token,
      });
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
    if (!tokens?.access_token) {
      setError("Log in before processing documents.");
      return;
    }

    setError("");
    setNotice("Starting async processing...");

    try {
      const response = await apiFetch<{ process_id: string; document_id: string; status: string }>(
        apiBaseUrl,
        `/v1/documents/${documentId}/process`,
        {
          method: "POST",
          token: tokens.access_token,
          body: JSON.stringify({
            embedding_model: "text-embedding-3-small",
            chunking_strategy: "recursive",
            chunk_size: 800,
            chunk_overlap: 120,
          }),
        },
      );

      setProcessingId(response.process_id);
      setSelectedDocumentId(documentId);
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

  async function ensureChat(query: string) {
    if (activeChatId) return activeChatId;
    if (!tokens?.access_token) throw new Error("Log in before chatting.");
    const title = query.length > 42 ? `${query.slice(0, 42)}...` : query;
    const chat = await apiFetch<ChatSummary>(apiBaseUrl, "/v1/chats", {
      method: "POST",
      token: tokens.access_token,
      body: JSON.stringify({ title }),
    });
    setActiveChatId(chat.chat_id);
    setChats((current) => [chat, ...current]);
    return chat.chat_id;
  }

  async function newChat() {
    if (!tokens?.access_token) {
      setPanel("settings");
      setError("Log in before creating a chat.");
      return;
    }
    const chat = await apiFetch<ChatSummary>(apiBaseUrl, "/v1/chats", {
      method: "POST",
      token: tokens.access_token,
      body: JSON.stringify({ title: "New Chat" }),
    });
    setActiveChatId(chat.chat_id);
    setChats((current) => [chat, ...current]);
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: "New chat started." }]);
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = input.trim();

    if (!query || asking || !tokens?.access_token) {
      if (!tokens?.access_token) setError("Log in before asking questions.");
      return;
    }

    const documentIds = selectedDocument?.processing_status === "COMPLETED" ? [selectedDocument.document_id] : completedDocuments;
    setAsking(true);
    setError("");
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: query }]);

    try {
      const chatId = await ensureChat(query);
      const response = await apiFetch<{
        chat_id: string;
        message_id: string;
        run_id: string;
        status: string;
      }>(apiBaseUrl, `/v1/chats/${chatId}/messages`, {
        method: "POST",
        token: tokens.access_token,
        body: JSON.stringify({
          input: query,
          document_ids: documentIds,
          runtime_options: {
            use_rag: documentIds.length > 0,
            use_memory: true,
            use_web: false,
            allow_charts: true,
            top_k: 5,
            llm_model: llmModel,
          },
        }),
      });

      setActiveRunId(response.run_id);
      setPendingMessageId(response.message_id);
      setNotice(`Runtime queued: ${response.run_id}`);
    } catch (err) {
      setAsking(false);
      setError(formatError(err));
    }
  }

  async function loadTrace(runId = activeRunId) {
    if (!tokens?.access_token || !runId) return;
    const response = await apiFetch<{ trace: Record<string, unknown> | null }>(apiBaseUrl, `/v1/runs/${runId}/trace`, {
      token: tokens.access_token,
    });
    setTrace(response.trace);
    setPanel("trace");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="sidebarTop">
          <button className="iconButton" aria-label="Toggle sidebar">
            <Menu size={18} />
          </button>
          <button className="newChat" onClick={newChat}>
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
          <button className={panel === "trace" ? "navItem active" : "navItem"} onClick={() => setPanel("trace")}>
            <BarChart3 size={18} />
            Trace
          </button>
        </div>

        <section className="history">
          <div className="sectionTitle">
            <span>Chats</span>
            <History size={15} />
          </div>
          {chats.length === 0 && <p className="mutedText">No chats yet</p>}
          {chats.map((chat) => (
            <button
              className={activeChatId === chat.chat_id ? "chatRow selected" : "chatRow"}
              key={chat.chat_id}
              onClick={() => setActiveChatId(chat.chat_id)}
            >
              <span>{chat.title}</span>
              <small>{chat.message_count ?? 0}</small>
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
            {authenticated ? llmModel : "Sign in"}
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
                {message.content.split("\n").map((line, index) => (
                  <p key={`${message.id}-${index}`}>{line}</p>
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
                {message.artifacts && message.artifacts.length > 0 && (
                  <div className="citations">
                    {message.artifacts.map((artifact) => (
                      <a key={artifact.artifact_id} href={artifact.presigned_url} target="_blank" rel="noreferrer">
                        {artifact.artifact_type}
                      </a>
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
                Runtime is working through memory, retrieval, and tools...
              </div>
            </article>
          )}
        </div>

        <form className="composer" onSubmit={handleAsk}>
          <textarea
            aria-label="Message"
            placeholder={authenticated ? "Ask your processed documents anything..." : "Log in from settings to start chatting..."}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="composerActions">
            <label className="iconButton" aria-label="Attach document">
              <Paperclip size={18} />
              <input
                className="hiddenFile"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleUpload}
              />
            </label>
            <button type="button" className="filterButton" onClick={() => setPanel("documents")}>
              <SlidersHorizontal size={16} />
              {selectedDocument ? selectedDocument.file_name : "All indexed docs"}
            </button>
            <button type="button" className="filterButton" onClick={() => loadTrace()} disabled={!activeRunId}>
              <BarChart3 size={16} />
              Trace
            </button>
            <button type="submit" className="sendButton" aria-label="Send message" disabled={asking || !authenticated}>
              {asking ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </section>

      <aside className="workspace">
        <div className="workspaceHeader">
          <div>
            <p className="eyebrow">{panel === "documents" ? "Library" : panel === "settings" ? "Runtime" : "Observability"}</p>
            <h2>{panel === "documents" ? "Document store" : panel === "settings" ? "Settings" : "Run trace"}</h2>
          </div>
          <button className="iconButton" aria-label="More options">
            <MoreHorizontal size={18} />
          </button>
        </div>

        {panel === "documents" && (
          <DocumentStore
            documents={documents}
            selectedDocumentId={selectedDocument?.document_id}
            uploading={uploading}
            authenticated={authenticated}
            onUpload={handleUpload}
            onSelect={setSelectedDocumentId}
            onProcess={startProcessing}
            onRefresh={refreshDocuments}
          />
        )}
        {panel === "settings" && (
          <SettingsPanel
            apiBaseUrl={apiBaseUrl}
            email={email}
            password={password}
            name={name}
            confirmationCode={confirmationCode}
            authenticated={authenticated}
            llmModel={llmModel}
            onApiBaseUrlChange={setApiBaseUrl}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onNameChange={setName}
            onConfirmationCodeChange={setConfirmationCode}
            onLlmModelChange={setLlmModel}
            onSignup={signup}
            onConfirm={confirmSignup}
            onLogin={login}
            onLogout={logout}
          />
        )}
        {panel === "trace" && <TracePanel trace={trace} activeRunId={activeRunId} onRefresh={() => loadTrace()} />}
      </aside>
    </main>
  );
}

function DocumentStore({
  documents,
  selectedDocumentId,
  uploading,
  authenticated,
  onUpload,
  onSelect,
  onProcess,
  onRefresh,
}: {
  documents: StoredDocument[];
  selectedDocumentId?: string;
  uploading: boolean;
  authenticated: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelect: (documentId: string) => void;
  onProcess: (documentId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="panelContent">
      <label className={uploading || !authenticated ? "uploadZone disabled" : "uploadZone"}>
        {uploading ? <Loader2 size={24} className="spin" /> : <UploadCloud size={24} />}
        <span>{uploading ? "Uploading..." : authenticated ? "Upload PDF or DOCX" : "Sign in to upload"}</span>
        <small>Uses /v1 presigned S3 upload and authenticated metadata</small>
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onUpload}
          disabled={uploading || !authenticated}
        />
      </label>

      <button type="button" className="filterButton wideButton" onClick={onRefresh} disabled={!authenticated}>
        <Search size={16} />
        Refresh documents
      </button>

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
  email,
  password,
  name,
  confirmationCode,
  authenticated,
  llmModel,
  onApiBaseUrlChange,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onConfirmationCodeChange,
  onLlmModelChange,
  onSignup,
  onConfirm,
  onLogin,
  onLogout,
}: {
  apiBaseUrl: string;
  email: string;
  password: string;
  name: string;
  confirmationCode: string;
  authenticated: boolean;
  llmModel: string;
  onApiBaseUrlChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onConfirmationCodeChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onSignup: () => void;
  onConfirm: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="panelContent">
      <label className="field">
        <span>Backend URL</span>
        <input value={apiBaseUrl} onChange={(event) => onApiBaseUrlChange(event.target.value)} placeholder="https://api.example.com/dev" />
      </label>
      <label className="field">
        <span>Email</span>
        <input value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" />
      </label>
      <label className="field">
        <span>Password</span>
        <input value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Cognito password" type="password" />
      </label>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Optional signup name" />
      </label>
      <div className="buttonRow">
        <button type="button" className="filterButton" onClick={onSignup}>
          <User size={16} />
          Signup
        </button>
        <button type="button" className="filterButton" onClick={onLogin}>
          <LogIn size={16} />
          Login
        </button>
      </div>
      <label className="field">
        <span>Confirmation code</span>
        <input value={confirmationCode} onChange={(event) => onConfirmationCodeChange(event.target.value)} placeholder="123456" />
      </label>
      <div className="buttonRow">
        <button type="button" className="filterButton" onClick={onConfirm}>
          <CheckCircle2 size={16} />
          Confirm
        </button>
        <button type="button" className="filterButton" onClick={onLogout} disabled={!authenticated}>
          Logout
        </button>
      </div>
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
      <div className="settingNote">
        <CheckCircle2 size={17} />
        {authenticated ? "Authenticated. The UI sends Bearer tokens to protected /v1 APIs." : "Log in to use protected /v1 document and chat APIs."}
      </div>
    </div>
  );
}

function TracePanel({ trace, activeRunId, onRefresh }: { trace: Record<string, unknown> | null; activeRunId: string; onRefresh: () => void }) {
  const spans = Array.isArray(trace?.spans) ? (trace?.spans as Array<Record<string, unknown>>) : [];
  return (
    <div className="panelContent">
      <button type="button" className="filterButton wideButton" onClick={onRefresh} disabled={!activeRunId}>
        <BarChart3 size={16} />
        Refresh trace
      </button>
      {!trace && (
        <div className="emptyState">
          <BarChart3 size={18} />
          Send a chat message to create a run trace.
        </div>
      )}
      {trace && (
        <div className="traceBox">
          <strong>{String(trace.trace_id || "trace")}</strong>
          <span>Status: {String(trace.status || "unknown")}</span>
          <span>Run: {String(trace.run_id || activeRunId)}</span>
          <span>Spans: {spans.length}</span>
          {spans.map((span) => (
            <div className="traceSpan" key={String(span.span_id)}>
              <b>{String(span.name)}</b>
              <small>
                {String(span.status)} · {String(span.latency_ms ?? 0)} ms
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function apiFetch<T>(
  apiBaseUrl: string,
  path: string,
  init?: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...requestInit } = init || {};
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestInit.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = body?.error?.message || body.error || body.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return (body?.status === "success" && "data" in body ? body.data : body) as T;
}

function contentTypeForFile(fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function regionalS3PostUrl(uploadUrl: string, apiBaseUrl: string) {
  const region = regionFromApiUrl(apiBaseUrl);
  if (!region) return uploadUrl;
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
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
