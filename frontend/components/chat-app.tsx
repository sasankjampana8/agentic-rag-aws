"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  History,
  KeyRound,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  UploadCloud,
  User,
} from "lucide-react";
import { useState } from "react";
import { chatHistory, documents, messages } from "@/lib/mock-data";

type Panel = "documents" | "settings";

export function ChatApp() {
  const [panel, setPanel] = useState<Panel>("documents");
  const [input, setInput] = useState("");

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="sidebarTop">
          <button className="iconButton" aria-label="Toggle sidebar">
            <Menu size={18} />
          </button>
          <button className="newChat">
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
          <button className="modelSelect">
            gpt-4.1-mini
            <ChevronDown size={16} />
          </button>
        </header>

        <div className="conversation">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="avatar">{message.role === "assistant" ? <Bot size={18} /> : <User size={18} />}</div>
              <div className="bubble">
                <p>{message.content}</p>
                {message.citations && (
                  <div className="citations">
                    {message.citations.map((citation) => (
                      <span key={citation}>{citation}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            setInput("");
          }}
        >
          <textarea
            aria-label="Message"
            placeholder="Ask your documents anything..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <div className="composerActions">
            <button type="button" className="iconButton" aria-label="Attach document">
              <Paperclip size={18} />
            </button>
            <button type="button" className="filterButton">
              <SlidersHorizontal size={16} />
              All indexed docs
            </button>
            <button type="submit" className="sendButton" aria-label="Send message">
              <Send size={18} />
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

        {panel === "documents" ? <DocumentStore /> : <SettingsPanel />}
      </aside>
    </main>
  );
}

function DocumentStore() {
  return (
    <div className="panelContent">
      <label className="uploadZone">
        <UploadCloud size={24} />
        <span>Drop PDF or DOCX files here</span>
        <small>Mock upload for now</small>
        <input type="file" multiple accept=".pdf,.docx" />
      </label>

      <div className="documentList">
        {documents.map((doc) => (
          <div className="documentCard" key={doc.id}>
            <div className="docIcon">
              <FileText size={18} />
            </div>
            <div>
              <strong>{doc.name}</strong>
              <span>
                {doc.size} · {doc.chunks} chunks
              </span>
            </div>
            <em className={doc.status === "Indexed" ? "status done" : "status"}>{doc.status}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="panelContent">
      <label className="field">
        <span>Backend URL</span>
        <input placeholder="https://api.example.com/dev" />
      </label>
      <label className="field">
        <span>OpenAI API key</span>
        <div className="inputWithIcon">
          <KeyRound size={16} />
          <input placeholder="sk-..." type="password" />
        </div>
      </label>
      <label className="field">
        <span>Answer model</span>
        <select defaultValue="gpt-4.1-mini">
          <option>gpt-4.1-mini</option>
          <option>gpt-4.1</option>
          <option>gpt-4o-mini</option>
        </select>
      </label>
      <label className="field">
        <span>Embedding model</span>
        <select defaultValue="text-embedding-3-small">
          <option>text-embedding-3-small</option>
          <option>text-embedding-3-large</option>
        </select>
      </label>
      <div className="settingNote">
        <CheckCircle2 size={17} />
        Settings are local mock values. Later they can map to environment variables or a backend config endpoint.
      </div>
    </div>
  );
}
