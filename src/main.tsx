import React from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { templates } from "./templates/generated";
import "./style.css";

const root = createRoot(document.getElementById("root")!);
const templateId = window.location.pathname.split("/").filter(Boolean)[0];
const selectedTemplate = templates.find(({ id }) => id === templateId);

function App() {
  if (!templateId) {
    return (
      <main className="home">
        <header className="header">
          <img src="/shared/spark.svg" alt="" />
          <span>Dynamic Remotion</span>
        </header>
        <section className="intro">
          <p className="eyebrow">VIDEO TEMPLATE SYSTEM</p>
          <h1>Satu folder untuk setiap cerita.</h1>
          <p>
            Pilih template untuk melihat preview. Setiap template memiliki
            komponen, JSON, dan asetnya sendiri.
          </p>
        </section>
        <section className="cards">
          {templates.map((template) => (
            <a className="card" href={`/${template.id}`} key={template.id}>
              <span className="card-accent" />
              <h2>{template.name}</h2>
              <p>{template.description}</p>
              <span className="card-link">Buka preview <span aria-hidden="true">→</span></span>
            </a>
          ))}
        </section>
      </main>
    );
  }

  if (!selectedTemplate) {
    return (
      <main className="not-found">
        <h1>Template tidak ditemukan</h1>
        <p>Folder template “{templateId}” belum terdaftar.</p>
        <a href="/">Kembali ke daftar template</a>
      </main>
    );
  }

  const { component: Component, data } = selectedTemplate;
  const fps = data.fps ?? 30;
  const width = data.width ?? 1920;
  const height = data.height ?? 1080;
  return (
    <main className="preview-page">
      <header className="preview-header">
        <a className="back-link" href="/">← Semua template</a>
        <span>{selectedTemplate.name}</span>
      </header>
      <section className="player-wrap">
        <Player
          key={selectedTemplate.id}
          component={Component}
          inputProps={{ data }}
          durationInFrames={Math.round(data.durationInSeconds * fps)}
          compositionWidth={width}
          compositionHeight={height}
          fps={fps}
          controls
          style={{ width: "100%" }}
        />
      </section>
      <p className="hint">
        Edit <code>src/templates/{selectedTemplate.id}/data.json</code> untuk
        mengganti konten template.
      </p>
    </main>
  );
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
