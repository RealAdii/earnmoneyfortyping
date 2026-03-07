"use client";

import { useEffect, useRef } from "react";

export default function ComingSoon() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const fontSize = 14;
    const cols = Math.floor(w / fontSize);
    const drops: number[] = Array(cols)
      .fill(0)
      .map(() => Math.random() * -100);

    // Mix of binary, dollar signs, and decimal values
    const chars = "01$01010101¢01010.1010101$010101".split("");

    function draw() {
      ctx!.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx!.fillRect(0, 0, w, h);

      for (let i = 0; i < cols; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Vary green intensity
        const bright = Math.random();
        if (char === "$" || char === "¢") {
          ctx!.fillStyle = `rgba(0, 255, 65, ${0.6 + bright * 0.4})`;
        } else {
          ctx!.fillStyle = `rgba(0, 255, 65, ${0.15 + bright * 0.35})`;
        }
        ctx!.font = `${fontSize}px "JetBrains Mono", monospace`;
        ctx!.fillText(char, x, y);

        if (y > h && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    const interval = setInterval(draw, 40);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#000",
      overflow: "hidden",
    }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Center content */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        textAlign: "center",
        gap: "1rem",
      }}>
        {/* Glow backdrop for readability */}
        <div style={{
          position: "absolute",
          width: "600px",
          height: "300px",
          background: "radial-gradient(ellipse, rgba(0,0,0,0.85) 30%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <h1 style={{
          fontFamily: '"Thunder Titan Italic", "Thunder Titan", Impact, sans-serif',
          fontStyle: "italic",
          fontSize: "clamp(3rem, 10vw, 7rem)",
          fontWeight: 400,
          color: "#00ff41",
          textTransform: "uppercase",
          letterSpacing: "6px",
          textShadow: "0 0 6px rgba(0, 255, 65, 0.4)",
          position: "relative",
          lineHeight: 1.1,
        }}>
          Coming Soon
        </h1>

        <p style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: "clamp(0.85rem, 2vw, 1.1rem)",
          color: "rgba(0, 255, 65, 0.6)",
          position: "relative",
          letterSpacing: "2px",
        }}>
          earn money for typing
        </p>

        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: "0.75rem",
          color: "rgba(0, 255, 65, 0.3)",
          position: "relative",
          marginTop: "2rem",
          letterSpacing: "1px",
        }}>
          [ MONDAY ]
        </div>
      </div>
    </div>
  );
}
