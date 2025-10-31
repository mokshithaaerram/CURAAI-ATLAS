import React from "react";
import "./styles.css";

function DotModal({ open, question, answer, specialty, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>X</button>
        <h2 style={{ marginBottom: "0.6em" }}>{question}</h2>
        <p>{answer}</p>
        {specialty && (
          <div style={{ marginTop: "1em", fontWeight: "bold", color: "#6c757d" }}>
            Specialty: {specialty}
          </div>
        )}
      </div>
    </div>
  );
}
export default DotModal;
