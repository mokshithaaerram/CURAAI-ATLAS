// src/DotTooltip.js
import React from "react";

function DotTooltip({ x, y, question, answer, specialty }) {
  const style = {
    position: "absolute",
    left: x + 30,
    top: y + 35,
    background: "#fff",
    border: "2px solid #1976d2",
    borderRadius: "12px",
    padding: "1.5em",
    minWidth: "450px",
    maxWidth: "500px",
    minHeight: "80px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    zIndex: 100,
    pointerEvents: "none",
    fontSize: "14px",
    lineHeight: "1.5"
  };
  
  return (
    <div style={style}>
      <div style={{
        fontWeight: "bold",
        marginBottom: "0.6em",
        color: "#1976d2",
        fontSize: "16px",
        borderBottom: "2px solid #f0f0f0",
        paddingBottom: "0.4em"
      }}>
        {specialty}
      </div>
      <div style={{
        fontWeight: "bold",
        marginBottom: "0.5em",
        color: "#2c3e50"
      }}>
        Q: {question}
      </div>
      <div style={{
        margin: "0.5em 0 0 0",
        color: "#34495e"
      }}>
        A: {answer}
      </div>
    </div>
  );
}

export default DotTooltip;