export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  citations?: string[];
};

export const chatHistory = [
  { id: "c1", title: "Summarize onboarding docs", time: "Today" },
  { id: "c2", title: "Compare policy revisions", time: "Yesterday" },
  { id: "c3", title: "Find API limits", time: "2d" },
  { id: "c4", title: "Draft support response", time: "4d" },
];

export const documents = [
  {
    id: "doc_8f42",
    name: "cloudrag-architecture.pdf",
    size: "2.4 MB",
    status: "Indexed",
    chunks: 64,
  },
  {
    id: "doc_a137",
    name: "api-contracts.docx",
    size: "820 KB",
    status: "Processing",
    chunks: 18,
  },
  {
    id: "doc_b902",
    name: "deployment-notes.pdf",
    size: "1.1 MB",
    status: "Indexed",
    chunks: 33,
  },
];

export const messages: ChatMessage[] = [
  {
    id: "m1",
    role: "assistant",
    content:
      "CloudRAG is ready. Upload documents in the document store, choose a model in settings, then ask questions grounded in your indexed files.",
  },
  {
    id: "m2",
    role: "user",
    content: "What does the backend need before I can run document Q&A?",
  },
  {
    id: "m3",
    role: "assistant",
    content:
      "You need a document bucket, DynamoDB metadata tables, an SQS processing queue, PostgreSQL with pgvector, and OpenAI credentials. Once documents are indexed, retrieval can return chunks and the ask endpoint can answer with citations.",
    citations: ["cloudrag-architecture.pdf p.2", "deployment-notes.pdf p.4"],
  },
];
