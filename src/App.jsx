import React, { useState } from "react";
import Chatbot from "./components/Chatbot.jsx";
import CodeViewer from "./components/CodeViewer.jsx";

export default function App() {
  const [view, setView] = useState("chat");

  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "20px" }}>
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => setView("chat")}
          style={{
            padding: "8px 16px",
            borderRadius: "5px",
            border: "1px solid #ddd",
            cursor: "pointer",
            backgroundColor: view === "chat" ? "#007bff" : "#f0f0f0",
            color: view === "chat" ? "white" : "black",
          }}
        >
          Chat
        </button>
        <button
          onClick={() => setView("codigo")}
          style={{
            padding: "8px 16px",
            borderRadius: "5px",
            border: "1px solid #ddd",
            cursor: "pointer",
            backgroundColor: view === "codigo" ? "#007bff" : "#f0f0f0",
            color: view === "codigo" ? "white" : "black",
          }}
        >
          Ver código
        </button>
      </div>

      {view === "chat" ? <Chatbot /> : <CodeViewer />}
    </div>
  );
}
